-- Inverse of `044_rename_041_email_unsubscribes.sql`. Local-only rollback —
-- production never runs `.down.sql`. Re-creates the dangling row that the
-- forward migration deleted, so `043_email_unsubscribes.sql` again looks
-- like the renamed twin of `041_email_unsubscribes.sql`.
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
    INSERT INTO schema_migrations (name) VALUES ('041_email_unsubscribes.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END$$;
