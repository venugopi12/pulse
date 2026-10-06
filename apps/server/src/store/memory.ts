import {
  ROLLUP_BUCKET_MS,
  addToRollups,
  pruneRollups,
  rollupKey,
  type Rollups,
} from "@pulse/shared";
import type {
  AnalyticsEvent,
  Dashboard,
  DashboardId,
  Invite,
  Tenant,
  TenantId,
  UserId,
} from "@pulse/shared";
import type { EventQuery, Store, UserRecord } from "./types.js";

/** Keep memory bounded: oldest RAW events are dropped past this per-tenant cap. */
const MAX_EVENTS_PER_TENANT = 50_000;
/** Rollups are tiny, so we keep a full day of them. */
const ROLLUP_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory implementation of Store.
 *
 * Tenant-owned data is physically partitioned: one Map/array per tenant,
 * keyed by tenantId. A query for tenant A literally cannot read tenant B's
 * partition — isolation by construction, not by remembering a WHERE clause.
 */
export function createMemoryStore(): Store {
  const tenants = new Map<TenantId, Tenant>();
  const usersById = new Map<UserId, UserRecord>();
  const userIdByEmail = new Map<string, UserId>();
  const invitesByTenant = new Map<TenantId, Invite[]>();
  const dashboardsByTenant = new Map<TenantId, Map<DashboardId, Dashboard>>();
  const eventsByTenant = new Map<TenantId, AnalyticsEvent[]>();
  const seqByTenant = new Map<TenantId, number>();
  const rollupsByTenant = new Map<TenantId, Rollups>();
  const EMPTY_ROLLUPS: Rollups = new Map();

  /** Get-or-create the partition for a tenant. */
  function partition<V>(map: Map<TenantId, V>, tenantId: TenantId, create: () => V): V {
    let value = map.get(tenantId);
    if (value === undefined) {
      value = create();
      map.set(tenantId, value);
    }
    return value;
  }

  const ownUser = (tenantId: TenantId, id: UserId): UserRecord | undefined => {
    const user = usersById.get(id);
    // Even a direct id lookup is checked against the caller's tenant.
    return user && user.tenantId === tenantId ? user : undefined;
  };

  return {
    tenants: {
      list: () => [...tenants.values()],
      getById: (id) => tenants.get(id),
      insert: (tenant) => {
        tenants.set(tenant.id, tenant);
      },
    },

    users: {
      findByEmail: (email) => {
        const id = userIdByEmail.get(email.toLowerCase());
        return id ? usersById.get(id) : undefined;
      },
      findById: ownUser,
      listByTenant: (tenantId) => [...usersById.values()].filter((u) => u.tenantId === tenantId),
      insert: (user) => {
        const email = user.email.toLowerCase();
        if (userIdByEmail.has(email)) throw new Error(`Duplicate email: ${email}`);
        usersById.set(user.id, user);
        userIdByEmail.set(email, user.id);
      },
      setRole: (tenantId, id, role) => {
        const user = ownUser(tenantId, id);
        if (!user) return false;
        usersById.set(id, { ...user, role });
        return true;
      },
      remove: (tenantId, id) => {
        const user = ownUser(tenantId, id);
        if (!user) return false;
        usersById.delete(id);
        userIdByEmail.delete(user.email.toLowerCase());
        return true;
      },
    },

    invites: {
      listByTenant: (tenantId) => [...(invitesByTenant.get(tenantId) ?? [])],
      insert: (invite) => {
        partition(invitesByTenant, invite.tenantId, () => []).push(invite);
      },
    },

    dashboards: {
      list: (tenantId) => [...(dashboardsByTenant.get(tenantId)?.values() ?? [])],
      get: (tenantId, id) => dashboardsByTenant.get(tenantId)?.get(id),
      insert: (dashboard) => {
        partition(dashboardsByTenant, dashboard.tenantId, () => new Map()).set(dashboard.id, dashboard);
      },
      save: (tenantId, id, expectedVersion, update) => {
        const bucket = dashboardsByTenant.get(tenantId);
        const current = bucket?.get(id);
        if (!bucket || !current) return { ok: false, reason: "not_found" };
        if (current.version !== expectedVersion) {
          return { ok: false, reason: "version_conflict", current };
        }
        // The updater can't move a dashboard to another tenant or rewind its version.
        const next: Dashboard = {
          ...update(current),
          id: current.id,
          tenantId: current.tenantId,
          version: current.version + 1,
        };
        bucket.set(id, next);
        return { ok: true, dashboard: next };
      },
    },

    events: {
      // Stored oldest -> newest (cheap append); returned newest -> oldest.
      list: (tenantId, query: EventQuery = {}) => {
        const arr = eventsByTenant.get(tenantId) ?? [];
        const { since = 0, limit = 500, severity, type } = query;
        const out: AnalyticsEvent[] = [];
        for (let i = arr.length - 1; i >= 0 && out.length < limit; i--) {
          const e = arr[i];
          if (!e || e.timestamp < since) break;
          if (severity && e.severity !== severity) continue;
          if (type && e.type !== type) continue;
          out.push(e);
        }
        return out;
      },
      count: (tenantId) => eventsByTenant.get(tenantId)?.length ?? 0,
      append: (event) => {
        const arr = partition(eventsByTenant, event.tenantId, () => []);
        arr.push(event);
        // Trim in chunks, not one-by-one: splice is O(n), so amortise it.
        if (arr.length > MAX_EVENTS_PER_TENANT * 1.1) {
          arr.splice(0, arr.length - MAX_EVENTS_PER_TENANT);
        }

        const rollups = partition(rollupsByTenant, event.tenantId, () => new Map());
        const isNewMinute = !rollups.has(event.timestamp - (event.timestamp % ROLLUP_BUCKET_MS));
        addToRollups(rollups, event);
        if (isNewMinute) pruneRollups(rollups, event.timestamp - ROLLUP_RETENTION_MS);

        const seq = (seqByTenant.get(event.tenantId) ?? 0) + 1;
        seqByTenant.set(event.tenantId, seq);
        return seq;
      },
      seq: (tenantId) => seqByTenant.get(tenantId) ?? 0,
    },

    rollups: {
      get: (tenantId) => rollupsByTenant.get(tenantId) ?? EMPTY_ROLLUPS,
      seedBucket: (tenantId, t, cells) => {
        const rollups = partition(rollupsByTenant, tenantId, () => new Map());
        const bucket = new Map(cells.map((c) => [rollupKey(c), { ...c }] as const));
        rollups.set(t, bucket);
      },
    },
  };
}
