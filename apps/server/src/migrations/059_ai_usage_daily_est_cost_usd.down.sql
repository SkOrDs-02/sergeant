-- ALLOW_DROP: PR-12 rollback — drop est_cost_usd column.
-- Use only if cost ledger has to be removed wholesale; PR-13/PR-14 stop working.

-- Звужуємо CHECK назад до set-у без `anthropic:_%` (попередній стан після
-- міграції 049). Безпечно, бо rollback видаляє і колонку, у яку Anthropic
-- buckets писали.
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
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
      );
END $$;

ALTER TABLE ai_usage_daily
  DROP COLUMN IF EXISTS est_cost_usd;
