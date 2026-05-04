-- 040: extend sync_op_log.op CHECK constraint with 'increment' — Stage 5
-- / PR #042a of `docs/planning/storage-roadmap.md` (foundation for PR
-- #042b PN-counter for `routine_streaks`).
--
-- Context. The v2 op-log currently restricts `op` to insert / update /
-- delete (migration 027). PR #042 introduces a fourth kind, `increment`,
-- carrying a numeric `delta` payload — it is the protocol primitive for
-- the PN-counter CRDT documented in
-- `docs/planning/storage-roadmap.md` § Stage 5 / PR #042. Two devices
-- toggling the same habit between syncs each emit `op='increment'`
-- with `delta=±1`; the apply-fn lands those as an atomic
-- `UPDATE … SET counter = counter + delta` so neither side overwrites
-- the other (LWW would lose one of the toggles).
--
-- This migration is the *protocol-only* half of the change (PR #042a):
-- it widens the CHECK so the kind passes Postgres validation, but no
-- apply-fn writes to it yet. The companion server change (next commit
-- in this PR) adds an engine-level pre-apply gate that rejects every
-- incoming `op='increment'` with `reject_reason='op_not_supported'`,
-- so even with the constraint widened, no row of `op='increment'` will
-- be persisted by the current code path. PR #042b lands the apply-fn
-- + dual-write client and flips the gate per-table via an opt-in set.
--
-- Why split it. Adding the kind in two phases lets us deploy the wider
-- CHECK ahead of any code that emits `op='increment'`: when PR #042b
-- ships, every running Sergeant instance already accepts the kind in
-- the column, so the apply-fn never sees a `value violates check
-- constraint "sync_op_log_op_check"` failure mid-rollout. Hard rule
-- #4 from `AGENTS.md` (no two-phase column-rename foot-gun) applies in
-- spirit: widen first, narrow / use later.
--
-- Forward-compat. Old clients still only emit insert/update/delete —
-- the wider CHECK is a superset, so existing inserts keep working. The
-- engine-level gate ensures `op='increment'` from any future client
-- against today's server is recorded as an explicit rejected row in
-- `sync_op_log` (with `reason='op_not_supported'`) rather than
-- silently lost.
--
-- Rollback. Local-only via `040_sync_op_log_op_increment.down.sql`
-- (rule #4 — production never runs `down.sql`). Restoring the narrow
-- CHECK is safe iff zero rows of `op='increment'` exist in
-- `sync_op_log`; under PR #042a alone they cannot exist (the engine
-- gate rejects every one), so the rollback is a clean no-op.

-- Drop the migration-027 CHECK and add a wider replacement. Postgres
-- does not support an in-place "extend an existing CHECK"; we have to
-- name the new constraint and let the old anonymous one go.
ALTER TABLE sync_op_log DROP CONSTRAINT IF EXISTS sync_op_log_op_check;

ALTER TABLE sync_op_log
  ADD CONSTRAINT sync_op_log_op_check
  CHECK (op IN ('insert', 'update', 'delete', 'increment'));
