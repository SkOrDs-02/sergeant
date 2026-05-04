-- Rollback for migration 040_sync_op_log_op_increment.sql.
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Restoring the narrower CHECK is safe iff
-- `sync_op_log` contains zero rows of `op='increment'`. Under PR #042a
-- alone the engine-level gate rejects every incoming `op='increment'`
-- before the INSERT, so this precondition holds for any deploy that
-- only ran 040.up.sql + the matching server change. After PR #042b
-- (which lets the kind land in the table for whitelisted tables) this
-- rollback would require a precursor data cleanup; document that in
-- 042b's down.sql when it lands.
--
-- Idempotent: the new constraint is dropped IF EXISTS; the original
-- migration's anonymous CHECK is restored under its conventional name
-- so a re-run of the up.sql afterwards produces a clean swap rather
-- than a duplicate constraint failure.

ALTER TABLE sync_op_log DROP CONSTRAINT IF EXISTS sync_op_log_op_check;

ALTER TABLE sync_op_log
  ADD CONSTRAINT sync_op_log_op_check
  CHECK (op IN ('insert', 'update', 'delete'));
