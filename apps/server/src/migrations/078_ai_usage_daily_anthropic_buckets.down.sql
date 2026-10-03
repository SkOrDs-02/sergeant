-- Revert to the 077 CHECK shape. Delete Anthropic rows first so the narrower
-- constraint can be re-added safely during local down-drills.

DO $$
BEGIN
  DELETE FROM ai_usage_daily WHERE bucket LIKE 'anthropic:%';

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
        OR bucket = 'premium'
        OR bucket = 'standard'
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
      );
END $$;
