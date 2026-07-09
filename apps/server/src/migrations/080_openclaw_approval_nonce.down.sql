-- Down-migration for 080_openclaw_approval_nonce.sql.
--
-- Drops the nonce ledger and its index. Idempotent (IF EXISTS) so the
-- rollback-sanity test (apps/server/src/migrations/__tests__/rollback-sanity.test.ts)
-- can run every .down.sql then re-apply its forward pair and verify the
-- schema fingerprint round-trips.
--
-- Production never runs .down.sql (Railway pre-deploy is forward-only) —
-- this exists for local rollbacks and CI sanity.

DROP INDEX IF EXISTS openclaw_approval_nonce_expires_idx;

DROP TABLE IF EXISTS openclaw_approval_nonce;
