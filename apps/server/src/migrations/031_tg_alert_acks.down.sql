-- Down-migration for 031_tg_alert_acks.sql.
--
-- Drops the alert-acks table and its partial indexes. Idempotent
-- (IF EXISTS) per AGENTS.md hard rule #4 + the rollback-sanity test in
-- apps/server/src/migrations/__tests__/rollback-sanity.test.ts.
--
-- Production never runs .down.sql (Railway pre-deploy is forward-only) —
-- this file exists for local rollbacks and CI sanity.

DROP INDEX IF EXISTS tg_alert_acks_posted_idx;
DROP INDEX IF EXISTS tg_alert_acks_pending_idx;
DROP INDEX IF EXISTS tg_alert_acks_unacked_idx;

DROP TABLE IF EXISTS tg_alert_acks;
