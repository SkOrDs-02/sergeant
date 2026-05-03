-- Down-migration for 030_openclaw_write_audit.sql.
--
-- Drops the audit table and its indexes. Idempotent (IF EXISTS) so a
-- second run is a no-op (AGENTS.md hard rule #4 + the rollback-sanity
-- test in apps/server/src/migrations/__tests__/rollback-sanity.test.ts
-- runs every .down.sql then re-applies its forward pair to verify
-- schema fingerprint round-trips cleanly).
--
-- Production never runs .down.sql (Railway pre-deploy is forward-only) —
-- this file exists for local rollbacks and CI sanity.

DROP INDEX IF EXISTS openclaw_write_audit_founder_idx;
DROP INDEX IF EXISTS openclaw_write_audit_tool_idx;
DROP INDEX IF EXISTS openclaw_write_audit_approval_idx;
DROP INDEX IF EXISTS openclaw_write_audit_recorded_idx;

DROP TABLE IF EXISTS openclaw_write_audit;
