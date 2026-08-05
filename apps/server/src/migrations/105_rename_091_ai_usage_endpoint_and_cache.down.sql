-- Inverse of `105_rename_091_ai_usage_endpoint_and_cache.sql`. Local-only
-- rollback — production never runs `.down.sql`. Re-creates the dangling
-- row the forward migration would have deleted, so the ledger looks as it
-- would have if `091_ai_usage_endpoint_and_cache.sql` had actually been
-- applied under its old name (defensive symmetry with the forward file;
-- harmless no-op in the far more likely case that row never existed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO schema_migrations (name)
      VALUES ('091_ai_usage_endpoint_and_cache.sql')
      ON CONFLICT (name) DO NOTHING;
  END IF;
END$$;
