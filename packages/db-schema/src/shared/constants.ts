/**
 * Shared constants for Drizzle schemas across Postgres and SQLite dialects.
 *
 * These values mirror the CHECK constraints and domain enums used in existing
 * SQL migrations. Keep in sync with `@sergeant/shared` types when they exist.
 */

/** Allowed tier_interest values for waitlist_entries (migration 009). */
export const WAITLIST_TIERS = ["free", "plus", "pro", "unsure"] as const;
export type WaitlistTier = (typeof WAITLIST_TIERS)[number];

/** Allowed sync_audit_log op_type values (migration 023). */
export const SYNC_OP_TYPES = ["push", "pull", "push_all", "pull_all"] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

/** Allowed sync_audit_log outcome values (migration 023). */
export const SYNC_OUTCOMES = [
  "ok",
  "empty",
  "conflict",
  "invalid",
  "too_large",
  "unauthorized",
  "error",
] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

/** Allowed sync_audit_log module values (migration 023). */
export const SYNC_MODULES = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "profile",
  "all",
  "unknown",
] as const;
export type SyncModule = (typeof SYNC_MODULES)[number];

/** Default waitlist source when not specified. */
export const DEFAULT_WAITLIST_SOURCE = "pricing_page" as const;

/**
 * Allowed `op` values for `sync_op_log` (migration 027). Mirrors the
 * CHECK constraint on the column. v2 sync uses these to apply per-row
 * mutations against module-specific tables (initial whitelist:
 * `routine_entries`, `routine_streaks`).
 */
export const SYNC_OP_LOG_OPS = ["insert", "update", "delete"] as const;
export type SyncOpLogOp = (typeof SYNC_OP_LOG_OPS)[number];

/**
 * Allowed `status` values for `sync_op_log` (migration 027).
 * `applied` — row mutation succeeded.
 * `duplicate` — replay of a previously-seen idempotency key.
 * `rejected` — apply path refused the op (LWW conflict, table not
 * allowed, FK violation, schema mismatch, …).
 */
export const SYNC_OP_LOG_STATUSES = [
  "applied",
  "duplicate",
  "rejected",
] as const;
export type SyncOpLogStatus = (typeof SYNC_OP_LOG_STATUSES)[number];
