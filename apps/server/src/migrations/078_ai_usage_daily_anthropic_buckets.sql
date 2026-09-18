-- Restore Anthropic per-model usage buckets after 077 widened the same CHECK
-- for Pro tier counters but accidentally omitted the 059 `anthropic:<model>`
-- family. Live `/api/chat` uses buckets such as
-- `anthropic:claude-haiku-4-5-20251001` for provider-level cost tracking.

DO $$
BEGIN
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
        OR bucket LIKE 'anthropic:_%'
      );
END $$;
