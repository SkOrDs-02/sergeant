-- Rollback for `041_push_send_audit.sql` — drops the audit log table
-- introduced for hardening item M14
-- (`docs/security/hardening/M14-internal-push-ip-allowlist.md`).
--
-- The forward migration creates `push_send_audit` with three indexes
-- (target_user, caller_ip, created_at). `DROP TABLE` removes the table
-- and all dependent indexes atomically — there is no FK on this table
-- (it intentionally does not reference `users.id` so audit rows survive
-- user deletion for incident-response), so the rollback does not need
-- a CASCADE to detach foreign references.
--
-- Idempotent: `DROP TABLE IF EXISTS` per rollback rule #4 — re-running
-- the down migration after the table is already gone must be a no-op,
-- so the harness in `__tests__/rollback-sanity.test.ts` can exercise
-- "down → re-up → down" without spurious failures.

DROP TABLE IF EXISTS push_send_audit;
