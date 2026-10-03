-- Revert Pro-tier buckets: restore the 049 CHECK (default | tool:_% |
-- transcribe:_%). Safe only if no `premium` / `standard` rows exist; the
-- delete below clears them first so the re-added constraint cannot fail.
-- Idempotent.

DO $$
BEGIN
  DELETE FROM ai_usage_daily WHERE bucket IN ('premium', 'standard');

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_daily_bucket_format'
  ) THEN
    ALTER TABLE ai_usage_daily
      DROP CONSTRAINT ai_usage_daily_bucket_format;
  END IF;

  ALTER TABLE ai_usage_daily
    ADD CONSTRAINT ai_usage_daily_bucket_format
      CHECK (
        bucket = 'default'
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
      );
END $$;
