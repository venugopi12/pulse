/**
 * Server load test: many WebSocket clients across three tenants.
 *
 *   npm run perf:ws
 *   CLIENTS=600 SIM_RATE=200 npm run perf:ws
 *
 * For each server batching setting it measures:
 *   - delivery latency (event created -> client received), p50/p95/p99
 *   - frames and events delivered per second
 *   - server CPU (from /api/health) and memory
 *   - ISOLATION: every event must belong to the receiving client's tenant.
 *     Any cross-tenant delivery is counted, and fails the run.
 *
 * Clients run in this one Node process, so at very high loads the numbers
 * include this process's own JSON parsing. They're for comparison, not a
 * capacity guarantee.
 */
import WebSocket from "ws";
import { TENANT_ADMINS, login, percentile, save, serverStats, sleep, startServer, table } from "./lib.js";

const PORT = 4301;
const API = `http://localhost:${PORT}`;
const CLIENTS = Number(process.env.CLIENTS ?? 300);
const SIM_RATE = Number(process.env.SIM_RATE ?? 100);
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 15_000);
const FLUSH_SETTINGS = [1, 50];

interface Frame {
  type: string;
  firstSeq?: number;
  events?: { tenantId: string; timestamp: number }[];
}

async function run(flushMs: number) {
  const server = await startServer({
    port: PORT,
    simRate: SIM_RATE,
    simTickMs: 10,
    wsFlushMs: flushMs,
    seedEvents: 200,
    corsOrigin: "http://localhost:5173",
  });

  const sessions = await Promise.all(TENANT_ADMINS.map((email) => login(API, email)));
  let measuring = false;
  let frames = 0;
  let events = 0;
  let violations = 0;
  const latencies: number[] = [];

  // CLIENTS sockets spread evenly over the three tenants.
  const sockets = await Promise.all(
    Array.from({ length: CLIENTS }, (_, i) => {
      const s = sessions[i % sessions.length]!;
      return new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws`, ["pulse.v1", `bearer.${s.token}`]);
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString()) as Frame;
          if (msg.type === "hello") return resolve(ws);
          if (msg.type !== "events" || !measuring || !msg.events) return;
          const now = Date.now();
          frames += 1;
          for (const e of msg.events) {
            events += 1;
            if (e.tenantId !== s.tenant.id) violations += 1;
            latencies.push(now - e.timestamp);
          }
        });
        ws.on("error", reject);
      });
    }),
  );

  await sleep(3000); // warm-up
  const before = await serverStats(API);
  const t0 = Date.now();
  measuring = true;
  await sleep(MEASURE_MS);
  measuring = false;
  const seconds = (Date.now() - t0) / 1000;
  const after = await serverStats(API);

  for (const ws of sockets) ws.close();
  await server.stop();

  latencies.sort((a, b) => a - b);
  return {
    "Server batch": `${flushMs} ms`,
    Clients: CLIENTS,
    "Frames/s (all clients)": Math.round(frames / seconds).toLocaleString("en-US"),
    "Events delivered/s": Math.round(events / seconds).toLocaleString("en-US"),
    "Latency p50": `${percentile(latencies, 50)} ms`,
    "Latency p95": `${percentile(latencies, 95)} ms`,
    "Latency p99": `${percentile(latencies, 99)} ms`,
    "Server CPU": `${Math.round(((after.cpuMs - before.cpuMs) / (seconds * 1000)) * 100)}%`,
    "Server RSS": `${after.rssMB} MB`,
    "Cross-tenant deliveries": violations,
  };
}

async function main() {
  const rows: Record<string, string | number>[] = [];
  for (const flush of FLUSH_SETTINGS) {
    process.stdout.write(`• ${CLIENTS} clients, server batch ${flush}ms … `);
    const row = await run(flush);
    rows.push(row);
    console.log(`${row["Frames/s (all clients)"]} frames/s, p95 ${row["Latency p95"]}, CPU ${row["Server CPU"]}`);
  }

  const md = `# WebSocket load test

${CLIENTS} clients (${CLIENTS / 3} per tenant), ${SIM_RATE} events/sec/tenant at peak, ${MEASURE_MS / 1000}s per run.
"Server batch" is \`WS_FLUSH_MS\`: how long the server collects a tenant's events before sending one frame.

${table(rows)}

- **Latency**: from the event being created on the server to a client parsing it (same machine clock).
- **Cross-tenant deliveries** must be 0: every event a client receives belongs to its own tenant.

Run on: ${process.platform} ${process.arch}, Node ${process.version}, ${new Date().toISOString().slice(0, 16)}Z
`;
  save("./results/ws.md", md);
  save("./results/ws.json", JSON.stringify(rows, null, 2));
  console.log("\n" + md);
  if (rows.some((r) => r["Cross-tenant deliveries"] !== 0)) {
    console.error("ISOLATION FAILURE: a client received another tenant's events");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
