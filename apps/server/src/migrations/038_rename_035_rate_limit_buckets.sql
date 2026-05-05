-- One-shot bookkeeping migration to dedupe the previous migration number
-- collision: both `035_nutrition_tables.sql` and `035_rate_limit_buckets.sql`
-- existed simultaneously on `main`, which broke `pnpm lint:migrations`
-- (`Duplicate migration numbers: 035`).
--
-- Fix: `035_rate_limit_buckets.sql` was renamed to `037_rate_limit_buckets.sql`
-- (036 was already taken by `036_transcribe_usd_micros.sql`). The DDL itself
-- is fully idempotent (`CREATE TABLE IF NOT EXISTS rate_limit_buckets` +
-- `CREATE INDEX IF NOT EXISTS`), so re-applying the renamed file in any
-- environment is a no-op for tables.
--
-- Bookkeeping detail. On production `schema_migrations` already carries a
-- row with `name = '035_rate_limit_buckets.sql'` from the original deploy.
-- Migration ordering is by filename, so `037_rate_limit_buckets.sql` runs
-- *first* (re-recording itself as applied via `INSERT INTO
-- schema_migrations`); we cannot `UPDATE` the old `035_*` row in place to
-- the new name afterwards, because the primary key on `name` would clash
-- with the freshly inserted `037_*` row. The clean shape after both
-- migrations: a single row keyed by `037_rate_limit_buckets.sql`. Hence:
-- delete the dangling `035_*` row.
--
-- On a fresh database the row does not exist yet, so the DELETE is a no-op
-- and the renamed file applies normally as `037_rate_limit_buckets.sql`.
--
-- The `DO $$ … information_schema` guard mirrors `034_cleanup_orphan_032_tracking.sql`
-- and is required because rollback-sanity / focused migration tests
-- (`apps/server/src/migrations/__tests__/*.test.ts`) apply forward migrations
-- directly against a freshly-dropped public schema without first running
-- `ensureSchema()` — so the `schema_migrations` table itself does not exist
-- when this file is replayed in those tests. Skipping the DELETE in that case
-- is correct: the orphan row is a production-state artifact that can't appear
-- in a clean-schema test container.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    DELETE FROM schema_migrations
     WHERE name = '035_rate_limit_buckets.sql';
  END IF;
END$$;
