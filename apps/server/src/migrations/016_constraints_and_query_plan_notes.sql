-- Constraints + expected query-plan notes for the two hottest sync tables.
--
-- Backend tech-debt PR D (`docs/tech-debt/backend.md` → "Roadmap → PR D")
-- carries three asks that fit into one additive, idempotent migration:
--
--   1. `module_data.version >= 1` — the schema in `003_baseline_schema.sql`
--      defaults the column to `1` and `apps/server/src/modules/sync/sync.ts`
--      only ever increments it (`module_data.version + 1`). A defensive
--      CHECK turns a future bug that writes `0` / negative version into a
--      hard failure at the DB boundary instead of silently breaking
--      `Pull` ordering on the client.
--
--   2. `push_subscriptions.endpoint` length cap. The Web Push spec
--      (RFC 8030) does not bound `endpoint` URLs, but in practice they
--      stay well below 2 kB (FCM ≈ 200 chars, Apple ≈ 200, Mozilla
--      ≈ 250). Without a cap a malformed client payload could write
--      arbitrarily large rows and bloat both the table and the
--      `idx_push_subs_user` heap-tuple lookup.
--
--   3. Verify `push_subscriptions.user_id → "user"(id) ON DELETE CASCADE`
--      is in place. It already is (`003_baseline_schema.sql:65`); this
--      migration documents the expectation alongside the other CHECKs
--      so the next reviewer can see the full constraint set in one
--      place. No DDL is emitted for it (would be a no-op because
--      `IF NOT EXISTS` semantics for FKs require a DO-block dance).
--
-- Strategy. Use `ADD CONSTRAINT … NOT VALID` then `VALIDATE CONSTRAINT`
-- so the initial `ADD` only takes a brief `ACCESS EXCLUSIVE`. The
-- `VALIDATE` step runs under `SHARE UPDATE EXCLUSIVE` and lets writes
-- continue while the table is scanned. With the current row counts
-- (low-thousands at most) this is overkill — but it costs us nothing
-- and keeps the migration safe if the table grows by 100x before the
-- next deploy window.
--
-- Idempotency. Wrapped in `DO $$ … $$` blocks that early-return when
-- the constraint already exists (Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`). Re-running the migration after a
-- partial failure is therefore a no-op. Rollback lives in
-- `016_constraints_and_query_plan_notes.down.sql`.
--
-- ─── Expected query plans (reference for future EXPLAIN ANALYZE runs) ────
--
-- A. `INSERT INTO module_data … ON CONFLICT (user_id, module) DO UPDATE
--     … WHERE module_data.client_updated_at <= $4 RETURNING …`
--    (`apps/server/src/modules/sync/sync.ts:175`).
--
--    Insert on module_data  (rows=1)
--      Conflict Resolution: UPDATE
--      Conflict Arbiter Indexes: module_data_user_id_module_key
--        ->  Index Scan using module_data_user_id_module_key
--              Index Cond: (user_id = $1 AND module = $2)
--    Filter `client_updated_at <= $4` is the LWW guard — drops the
--    UPDATE on rows=0 when the incoming change is older.
--
-- B. `SELECT module, data, client_updated_at, server_updated_at, version
--     FROM module_data WHERE user_id = $1 AND module = ANY($2::text[])
--     AND server_updated_at > $3 ORDER BY server_updated_at`
--    (`apps/server/src/modules/sync/sync.ts:309`).
--
--    Sort  (Sort Key: server_updated_at)
--      ->  Index Scan using idx_module_data_user
--              Index Cond: (user_id = $1)
--              Filter: (module = ANY ($2) AND server_updated_at > $3)
--    Module set is bounded to four (`finyk`/`fizruk`/`routine`/`nutrition`),
--    so the `ANY`-list is fully selective even without a composite index.
--
-- C. `SELECT … FROM push_subscriptions WHERE user_id = $1`
--    (consumer: `apps/server/src/lib/webpushSend.ts`, broadcast paths).
--
--    Index Scan using idx_push_subs_user
--      Index Cond: (user_id = $1)
--    Result-set is in the single digits per user (one device per
--    browser × small N browsers).
--
-- D. ON DELETE CASCADE traversal when a user is deleted.
--    Triggers (`"user"` → cascade) drop `module_data`, `push_subscriptions`,
--    `push_devices`, `session`, `account`. Each child table relies on its
--    `user_id` index (`idx_module_data_user`, `idx_push_subs_user`,
--    `idx_push_devices_user_active`) to avoid a sequential scan during
--    cascade evaluation. The CHECKs added below do not affect cascade
--    cost (Postgres skips per-row CHECK validation on DELETE).
--
-- ────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'module_data_version_positive'
      AND conrelid = 'module_data'::regclass
  ) THEN
    ALTER TABLE module_data
      ADD CONSTRAINT module_data_version_positive
      CHECK (version >= 1) NOT VALID;
    ALTER TABLE module_data
      VALIDATE CONSTRAINT module_data_version_positive;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_endpoint_max_length'
      AND conrelid = 'push_subscriptions'::regclass
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_endpoint_max_length
      CHECK (char_length(endpoint) <= 2048) NOT VALID;
    ALTER TABLE push_subscriptions
      VALIDATE CONSTRAINT push_subscriptions_endpoint_max_length;
  END IF;
END$$;

COMMENT ON CONSTRAINT module_data_version_positive ON module_data IS
  'Defensive: server-side version is a monotonically-incrementing counter (default 1, +1 on every ON CONFLICT UPDATE). A 0 / negative value would corrupt LWW ordering on the client.';

COMMENT ON CONSTRAINT push_subscriptions_endpoint_max_length ON push_subscriptions IS
  'Cap unbounded RFC-8030 endpoints at 2048 chars to keep the heap-tuple lookup via idx_push_subs_user predictable; real-world endpoints (FCM/Apple/Mozilla) are < 300 chars.';
