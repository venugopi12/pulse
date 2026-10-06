import {
  ClientMessageSchema,
  WS_PATH,
  WS_PROTOCOL,
  WS_TOKEN_PROTOCOL_PREFIX,
  WsCloseCode,
  type ServerMessage,
} from "@pulse/shared";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveAuth, type AuthContext } from "../auth/context.js";
import type { TokenService } from "../auth/jwt.js";
import type { Store } from "../store/types.js";
import type { Hub, HubClient } from "./hub.js";

export interface RealtimeDeps {
  store: Store;
  tokens: TokenService;
  hub: Hub;
  allowedOrigins: string[];
  heartbeatMs?: number;
}

const MAX_TIMEOUT_MS = 2_147_483_647; // setTimeout's max (≈24.8 days)

/**
 * Attaches the WebSocket server to the SAME http.Server as Express.
 *
 * Authentication happens during the HTTP upgrade request, BEFORE the socket
 * is accepted. An unauthenticated client never gets a WebSocket at all —
 * it gets a plain `401` and the TCP connection is closed.
 */
export function attachRealtime(server: Server, deps: RealtimeDeps) {
  const { store, tokens, hub, allowedOrigins, heartbeatMs = 30_000 } = deps;

  const wss = new WebSocketServer({
    noServer: true, // we handle `upgrade` ourselves so we can authenticate first
    maxPayload: 16 * 1024, // clients only send tiny control messages
    // Echo back `pulse.v1`; never echo the `bearer.<jwt>` protocol.
    handleProtocols: (protocols) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
  });

  async function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());

    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== WS_PATH) return reject(socket, 404, "Not Found");

    // Defence in depth against cross-site WebSocket hijacking. Browsers always
    // send Origin; non-browser clients may omit it (they still need a token).
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin) && !isSameOrigin(req, origin)) {
      return reject(socket, 403, "Forbidden");
    }

    const token = extractToken(req.headers["sec-websocket-protocol"]);
    if (!token) return reject(socket, 401, "Unauthorized");

    let auth: AuthContext;
    try {
      auth = await resolveAuth(store, tokens, token);
    } catch {
      return reject(socket, 401, "Unauthorized");
    }

    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, auth));
  }

  function onConnection(ws: WebSocket, auth: AuthContext) {
    let alive = true;
    const client: HubClient = {
      auth,
      get bufferedAmount() {
        return ws.bufferedAmount;
      },
      send: (data) => ws.send(data),
      close: (code, reason) => ws.close(code, reason),
    };
    const sendMessage = (msg: ServerMessage) => ws.send(JSON.stringify(msg));

    hub.join(client);
    sendMessage({
      type: "hello",
      tenantId: auth.tenantId,
      userId: auth.userId,
      role: auth.role,
      serverTime: Date.now(),
    });

    // A socket can outlive its token. Close it the moment the token expires;
    // the client then reconnects with a fresh token (or gets sent to login).
    const expiryTimer = setTimeout(
      () => ws.close(WsCloseCode.TokenExpired, "Token expired"),
      Math.min(Math.max(auth.tokenExpiresAt - Date.now(), 0), MAX_TIMEOUT_MS),
    );

    // Heartbeat: detect half-open connections (laptop lid closed, Wi-Fi gone)
    // that never send a FIN. No pong since the last ping -> terminate.
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, heartbeatMs);
    ws.on("pong", () => {
      alive = true;
    });

    ws.on("message", (raw) => {
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        return sendMessage({ type: "error", code: "BAD_MESSAGE", message: "Invalid JSON" });
      }
      // Anything not in the client schema (e.g. {type:"subscribe", tenantId})
      // is rejected. Clients have no way to choose a tenant.
      const parsed = ClientMessageSchema.safeParse(json);
      if (!parsed.success) {
        return sendMessage({ type: "error", code: "BAD_MESSAGE", message: "Unknown message" });
      }
      switch (parsed.data.type) {
        case "ping":
          sendMessage({ type: "pong", t: parsed.data.t });
          break;
      }
    });

    ws.on("close", () => {
      clearTimeout(expiryTimer);
      clearInterval(heartbeat);
      hub.leave(client);
    });
  }

  server.on("upgrade", (req, socket, head) => {
    void onUpgrade(req, socket, head);
  });

  return {
    wss,
    /** Close every socket with "going away" so clients know to reconnect. */
    close(): Promise<void> {
      for (const ws of wss.clients) ws.close(WsCloseCode.ServerShutdown, "Server shutting down");
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

function extractToken(header: string | undefined): string | undefined {
  const protocol = header
    ?.split(",")
    .map((p) => p.trim())
    .find((p) => p.startsWith(WS_TOKEN_PROTOCOL_PREFIX));
  return protocol?.slice(WS_TOKEN_PROTOCOL_PREFIX.length) || undefined;
}

/**
 * True when the page opening the socket was served from the same host the
 * socket connects to: the web app and the API share one domain (Vite's proxy
 * locally; one Vercel deployment with services in production). Every Vercel
 * preview has its own URL, so listing origins in CORS_ORIGIN can't cover
 * them, but a same-host page is by definition not cross-site.
 *
 * Safe because a browser can't forge either side: it sets Origin itself and
 * can't set Host or X-Forwarded-Host on a WebSocket. A non-browser client
 * could, but it could just as well omit Origin, and it still needs a token.
 */
export function isSameOrigin(req: IncomingMessage, origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = req.headers["x-forwarded-host"];
  const candidates = [req.headers.host, ...(Array.isArray(forwarded) ? forwarded : (forwarded ?? "").split(","))]
    .map((h) => h?.trim().toLowerCase())
    .filter(Boolean);
  return candidates.includes(host.toLowerCase());
}

function reject(socket: Duplex, status: number, text: string) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
