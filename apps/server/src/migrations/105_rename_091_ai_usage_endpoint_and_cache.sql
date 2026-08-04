-- One-shot bookkeeping migration mirroring the precedent of
-- `038_rename_035_rate_limit_buckets.sql` / `044_rename_041_email_unsubscribes.sql`
-- for the `104_ai_usage_endpoint_and_cache.sql` rename (originally
-- `091_ai_usage_endpoint_and_cache.sql`, see the renumbering note at the top
-- of that file).
--
-- Unlike the two 038/044 precedents, the best available signal at rename
-- time (2026-08-04, pre-beta schema-debt audit) is that this specific file
-- was NEVER deployed under its old `091_*` name — it only ever existed on
-- an unmerged working branch, never on a `schema_migrations`-recording
-- environment. This migration is therefore a defensive no-op guard rather
-- than a confirmed cleanup: IF some environment (a preview deploy, a stale
-- branch push) ever DID apply `091_ai_usage_endpoint_and_cache.sql` under
-- the old name, this DELETE removes the dangling ledger row so the
-- renamed `104_*` row is the only one on record — exactly the shape the
-- 038/044 precedent produces. If the row never existed, this is a no-op.
--
-- The `DO $$ … information_schema` guard mirrors both precedents —
-- required because rollback-sanity / focused migration tests
-- (`apps/server/src/migrations/__tests__/*.test.ts`) apply forward
-- migrations directly against a freshly-dropped `public` schema without
-- first running `ensureSchema()`, so `schema_migrations` itself does not
-- exist when this file is replayed in those tests.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    DELETE FROM schema_migrations
     WHERE name = '091_ai_usage_endpoint_and_cache.sql';
  END IF;
END$$;
