/**
 * `npm run seed` — the store is in-memory, so the server seeds itself on
 * boot. This script runs the exact same seed and prints what you get:
 * a quick sanity check, and your list of demo logins.
 */
import { seedStore } from "../src/seed.js";
import { DEMO_PASSWORD } from "../src/seed-data.js";
import { createMemoryStore } from "../src/store/memory.js";

const store = createMemoryStore();
const summary = await seedStore(store);

console.log(`\nSeeded ${summary.tenants} tenants · ${summary.users} users · ${summary.events} events\n`);

for (const tenant of store.tenants.list()) {
  const events = store.events.list(tenant.id, { limit: Number.MAX_SAFE_INTEGER });
  const errors = events.filter((e) => e.severity === "error").length;
  console.log(`${tenant.name}  (${tenant.id}, accent ${tenant.accent})`);
  console.log(`  events: ${events.length}  errors: ${errors}`);
  for (const u of store.users.listByTenant(tenant.id)) {
    console.log(`  ${u.role.padEnd(6)}  ${u.email.padEnd(20)}  ${u.name}`);
  }
  console.log("");
}
console.log(`Password for every demo user: ${DEMO_PASSWORD}\n`);
