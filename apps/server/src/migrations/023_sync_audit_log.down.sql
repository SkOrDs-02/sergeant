-- Idempotent rollback for `023_sync_audit_log.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).
-- DROP TABLE … CASCADE також знімає три індекси з up.sql,
-- окремих DROP INDEX не потрібно.

DROP TABLE IF EXISTS sync_audit_log CASCADE;
