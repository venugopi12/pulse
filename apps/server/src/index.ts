import { createAnthropicInterpreter } from "./ai/anthropic.js";
import { loadConfig } from "./config.js";
import { createPulseServer } from "./pulse-server.js";

const config = loadConfig();
const pulse = await createPulseServer({
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  corsOrigins: config.corsOrigins,
  wsFlushMs: config.wsFlushMs,
  seed: { eventsPerTenant: config.seedEvents },
  trustProxy: config.trustProxy,
  ai: {
    interpreter: config.ai.apiKey ? createAnthropicInterpreter(config.ai.apiKey, config.ai.model) : null,
    timeoutMs: config.ai.timeoutMs,
  },
  ...(config.simRate > 0 ? { simulatorRate: config.simRate, simulatorTickMs: config.simTickMs } : {}),
});

const port = await pulse.listen(config.port);
const { tenants, users, events, historyMinutes } = pulse.seedSummary;
console.log(`[pulse] API + WebSocket on http://localhost:${port} (ws path /ws)`);
console.log(
  `[pulse] seeded ${tenants} tenants, ${users} users, ${events} recent events, ${historyMinutes} min of rollups each`,
);
console.log(
  config.ai.apiKey
    ? `[pulse] AI filters: ${config.ai.model}`
    : "[pulse] AI filters: keyword matching only (set ANTHROPIC_API_KEY to use Claude)",
);
console.log(
  config.simRate > 0
    ? `[pulse] simulator: ~${config.simRate} events/sec per tenant at peak, WS flush every ${config.wsFlushMs}ms`
    : "[pulse] simulator off (SIM_RATE=0)",
);

// Graceful shutdown: tell WS clients we're going away, finish in-flight HTTP.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[pulse] ${signal} received, shutting down`);
    void pulse.close().then(() => process.exit(0));
  });
}
