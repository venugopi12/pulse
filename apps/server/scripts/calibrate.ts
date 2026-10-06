/**
 * Dev helper: what do the seeded KPIs read during normal traffic vs an
 * incident? Used to pick sensible warn/critical thresholds.
 *   npx tsx scripts/calibrate.ts
 */
import { addToRollups, computeMetric, TenantIdSchema, type Rollups } from "@pulse/shared";
import { createRng } from "../src/lib/random.js";
import { TENANT_PROFILES } from "../src/seed-data.js";
import { createIdFactory, makeEvent } from "../src/sim/generator.js";

const RATE = Number(process.env.SIM_RATE ?? 30);
const now = Date.UTC(2026, 0, 15, 12);
for (const p of TENANT_PROFILES) {
  for (const [label, incident] of [["normal", false], ["incident", true]] as const) {
    const rng = createRng(7);
    const r: Rollups = new Map();
    const nextId = createIdFactory("x");
    // 60 minutes at RATE events/sec (peak shape = 1.0)
    for (let i = 0; i < RATE * 3600; i++) {
      addToRollups(r, makeEvent(rng, TenantIdSchema.parse(p.id), p.events, incident, now - 3_600_000 + i * (1000 / RATE), nextId));
    }
    const vals = p.widgets
      .filter((w) => w.type === "kpi")
      .map((w) => `${w.id}=${Math.round(computeMetric(r, w.metric, now) ?? NaN)}`);
    console.log(p.slug.padEnd(16), label.padEnd(9), vals.join("  "));
  }
}
