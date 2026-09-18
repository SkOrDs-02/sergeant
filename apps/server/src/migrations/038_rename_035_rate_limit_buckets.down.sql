-- Inverse of `038_rename_035_rate_limit_buckets.sql`. Local-only rollback —
-- production never runs `.down.sql`. Re-creates the dangling row that the
-- forward migration deleted, so `037_rate_limit_buckets.sql` again looks
-- like the renamed twin of `035_rate_limit_buckets.sql`.
--
-- The `DO $$ … information_schema` guard mirrors the forward file: rollback
-- sanity tests apply migrations against a freshly-dropped `public` schema
-- without first running `ensureSchema()`, so `schema_migrations` does not
-- exist there. In that case we silently no-op; the test only checks that the
-- physical schema round-trips, not the bookkeeping row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO schema_migrations (name) VALUES ('035_rate_limit_buckets.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END$$;
