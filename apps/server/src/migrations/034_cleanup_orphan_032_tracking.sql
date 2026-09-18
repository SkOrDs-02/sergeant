-- Cleanup orphan tracking row left by the 032 → 033 rename of
-- mono_webhook_secret_rotated_at (PR #1502).
--
-- Background. PR #1490 and PR #1497 simultaneously landed migration
-- number 032 (one each), creating a duplicate that broke `pnpm
-- lint:migrations` on every PR opened against main. PR #1502 fixed the
-- duplicate by renaming the mono webhook file from 032 to 033. By the
-- time #1502 merges, Railway's pre-deploy hook (`pnpm --filter
-- @sergeant/server db:migrate`, ADR-0013 §13.3) has already applied the
-- original under its old filename `032_mono_webhook_secret_rotated_at.sql`
-- and recorded it in `schema_migrations`. The physical schema is correct —
-- the 033 file is byte-identical and all its DDL is `IF NOT EXISTS` /
-- `COALESCE`-guarded, so re-applying it under the new name is a full
-- no-op. But `schema_migrations` is left with an orphan row whose name
-- references a file that no longer exists on disk.
--
-- This migration deletes that orphan row so the tracking table stays in
-- 1:1 correspondence with the on-disk migration files. On a database
-- that was never deployed under the old filename (CI containers,
-- developer laptops cloned after the rename) the DELETE matches zero
-- rows and is a silent no-op.
--
-- The `DO $$ … information_schema` guard exists because the rollback
-- sanity test (`apps/server/src/migrations/__tests__/rollback-sanity.test.ts`)
-- applies forward migrations directly against a freshly-dropped public
-- schema without first running `ensureSchema()` — so the
-- `schema_migrations` table itself does not exist when this file is
-- replayed in that test. Skipping the DELETE in that case is correct:
-- the orphan row is a production-state artifact that can't appear in a
-- clean-schema test container.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    DELETE FROM schema_migrations
    WHERE name = '032_mono_webhook_secret_rotated_at.sql';
  END IF;
END $$;
