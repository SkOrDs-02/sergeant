-- Idempotent rollback for `027_sync_op_log.sql` (Stage 2 / PR #021).
-- Re-runnable: `IF EXISTS` on the drop. `DROP TABLE … CASCADE` removes
-- both indexes (`sync_op_log_user_id_idx`,
-- `sync_op_log_user_table_server_ts_idx`) and the unique constraint
-- created in the up migration, so explicit `DROP INDEX` / `DROP
-- CONSTRAINT` are not needed. Production never auto-runs `.down.sql` —
-- this is the local-rollback escape hatch used by `rollback-sanity`
-- tests and by manual DBA work.

DROP TABLE IF EXISTS sync_op_log CASCADE;
