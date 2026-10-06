import type {
  AnalyticsEvent,
  ReadonlyRollups,
  RollupCell,
  Dashboard,
  DashboardId,
  Invite,
  PublicUser,
  Role,
  Severity,
  Tenant,
  TenantId,
  UserId,
} from "@pulse/shared";

/** Server-only user record. `passwordHash` must never leave the server. */
export interface UserRecord extends PublicUser {
  passwordHash: string;
}

export interface EventQuery {
  /** Only events with timestamp >= since (epoch ms). */
  since?: number | undefined;
  /** Max events, newest first. */
  limit?: number | undefined;
  severity?: Severity | undefined;
  type?: string | undefined;
}

export type SaveResult =
  | { ok: true; dashboard: Dashboard }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "version_conflict"; current: Dashboard };

/**
 * The data-access contract. Routes depend on this interface, not on a
 * concrete database, so we can swap the in-memory store for SQLite/Postgres
 * later without touching route code.
 *
 * Isolation rule: every method that touches tenant-owned data REQUIRES a
 * tenantId argument. There is intentionally no "list all events" method.
 */
export interface Store {
  tenants: {
    list(): Tenant[];
    getById(id: TenantId): Tenant | undefined;
    insert(tenant: Tenant): void;
  };
  users: {
    /** Login is the one lookup that happens before we know the tenant. */
    findByEmail(email: string): UserRecord | undefined;
    findById(tenantId: TenantId, id: UserId): UserRecord | undefined;
    listByTenant(tenantId: TenantId): UserRecord[];
    insert(user: UserRecord): void;
    setRole(tenantId: TenantId, id: UserId, role: Role): boolean;
    remove(tenantId: TenantId, id: UserId): boolean;
  };
  invites: {
    listByTenant(tenantId: TenantId): Invite[];
    insert(invite: Invite): void;
  };
  dashboards: {
    list(tenantId: TenantId): Dashboard[];
    get(tenantId: TenantId, id: DashboardId): Dashboard | undefined;
    insert(dashboard: Dashboard): void;
    /** Compare-and-swap: only saves if `expectedVersion` is still current. */
    save(
      tenantId: TenantId,
      id: DashboardId,
      expectedVersion: number,
      update: (current: Dashboard) => Dashboard,
    ): SaveResult;
  };
  events: {
    list(tenantId: TenantId, query?: EventQuery): AnalyticsEvent[];
    count(tenantId: TenantId): number;
    /**
     * Stores the event AND adds it to the tenant's rollups.
     * Returns the event's per-tenant sequence number (1, 2, 3…), like a
     * Kafka offset: clients use it to line up snapshots with live updates.
     */
    append(event: AnalyticsEvent): number;
    /** Sequence number of the last appended event (0 if none). */
    seq(tenantId: TenantId): number;
  };
  rollups: {
    /** Per-minute aggregates for the tenant (read-only view). */
    get(tenantId: TenantId): ReadonlyRollups;
    /** Seed a historical bucket directly (no raw events behind it). */
    seedBucket(tenantId: TenantId, t: number, cells: RollupCell[]): void;
  };
}
