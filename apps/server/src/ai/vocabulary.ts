import type { FilterVocabulary, TenantId } from "@pulse/shared";
import type { Store } from "../store/types.js";

const MAX_TERMS = 100;

/**
 * The event types and sources THIS tenant has sent in the last day, read from
 * its own rollups (tenant from the token, as always). Another tenant's
 * vocabulary can never end up in a prompt.
 */
export function tenantVocabulary(store: Store, tenantId: TenantId): FilterVocabulary {
  const types = new Set<string>();
  const sources = new Set<string>();
  for (const bucket of store.rollups.get(tenantId).values()) {
    for (const cell of bucket.values()) {
      types.add(cell.type);
      sources.add(cell.source);
    }
  }
  return {
    eventTypes: [...types].sort().slice(0, MAX_TERMS),
    sources: [...sources].sort().slice(0, MAX_TERMS),
  };
}
