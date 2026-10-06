import {
  ServerMessageSchema,
  WS_PATH,
  WsCloseCode,
  wsProtocols,
  type AnalyticsEvent,
  type Dashboard,
  type ServerMessage,
} from "@pulse/shared";
import type { ConnectionStatus } from "@/stores/connection";
import { backoffDelay } from "./backoff";

export interface SocketHandlers {
  onStatus(status: ConnectionStatus, retryAt?: number | null): void;
  /** Fired after every successful (re)connect: time to (re)load the snapshot. */
  onReady(hello: Extract<ServerMessage, { type: "hello" }>): void;
  onEvents(firstSeq: number, events: AnalyticsEvent[]): void;
  onDashboardUpdated(dashboard: Dashboard): void;
  /** Token expired: reconnecting with it would just fail. */
  onAuthExpired(): void;
}

const PING_EVERY_MS = 15_000;
/** If nothing at all arrives for this long, assume the connection is dead. */
const SILENCE_LIMIT_MS = 35_000;

/** Same origin in dev (Vite proxies /ws) and behind a reverse proxy in prod. */
function defaultUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${WS_PATH}`;
}

/**
 * A WebSocket that keeps itself connected. Framework-agnostic: React only
 * sees it through the handlers.
 *
 *  - Reconnects with jittered exponential backoff (see backoff.ts).
 *  - Detects dead connections the browser hasn't noticed (Wi-Fi drop,
 *    laptop sleep) with an application-level ping and a silence timer.
 *  - Reacts to the browser's online/offline events and to the tab becoming
 *    visible again, instead of waiting out the backoff.
 */
export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;

  constructor(
    private readonly token: string,
    private readonly tokenExpiresAt: number,
    private readonly handlers: SocketHandlers,
    private readonly url: string = defaultUrl(),
  ) {}

  start(): void {
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clearTimers();
    this.ws?.close(1000, "Client closed");
    this.ws = null;
  }

  private connect = (): void => {
    if (this.stopped) return;
    this.clearTimers();
    if (Date.now() >= this.tokenExpiresAt) return this.handlers.onAuthExpired();
    if (!navigator.onLine) return this.handlers.onStatus("offline");

    this.handlers.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.url, wsProtocols(this.token));
    this.ws = ws;

    ws.onmessage = (e: MessageEvent<string>) => {
      this.lastMessageAt = Date.now();
      let json: unknown;
      try {
        json = JSON.parse(e.data);
      } catch {
        return;
      }
      // Validate at the boundary: a malformed frame is dropped, not rendered.
      const parsed = ServerMessageSchema.safeParse(json);
      if (!parsed.success) return;
      const msg = parsed.data;
      switch (msg.type) {
        case "hello":
          this.attempt = 0; // healthy again: reset the backoff
          this.handlers.onStatus("live");
          this.startHeartbeat();
          this.handlers.onReady(msg);
          break;
        case "events":
          this.handlers.onEvents(msg.firstSeq, msg.events);
          break;
        case "dashboard.updated":
          this.handlers.onDashboardUpdated(msg.dashboard);
          break;
        case "pong":
        case "error":
          break;
      }
    };

    ws.onclose = (e: CloseEvent) => {
      if (this.ws !== ws) return; // a newer socket already replaced this one
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      if (e.code === WsCloseCode.TokenExpired) return this.handlers.onAuthExpired();
      this.scheduleReconnect();
    };
    // onerror is always followed by onclose; reconnect logic lives there.
  };

  private scheduleReconnect(): void {
    if (!navigator.onLine) return this.handlers.onStatus("offline");
    const delay = backoffDelay(this.attempt++);
    this.handlers.onStatus("reconnecting", Date.now() + delay);
    this.retryTimer = setTimeout(this.connect, delay);
  }

  private startHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > SILENCE_LIMIT_MS) {
        // Half-open connection: force-close so onclose schedules a reconnect.
        this.ws?.close(4000, "No traffic");
        return;
      }
      this.ws?.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, PING_EVERY_MS);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private onOnline = (): void => {
    if (!this.ws) {
      this.attempt = 0;
      this.connect();
    }
  };

  private onOffline = (): void => {
    this.handlers.onStatus("offline");
  };

  private onVisible = (): void => {
    // Back on a tab whose socket died while hidden: don't wait for the backoff.
    if (document.visibilityState === "visible" && !this.ws) this.connect();
  };
}
