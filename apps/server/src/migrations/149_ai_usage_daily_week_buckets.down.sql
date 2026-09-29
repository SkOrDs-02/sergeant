-- Відкат 149 до форми CHECK з 078. Спершу видаляємо тижневі рядки, інакше
-- вужче правило не додасться. Перед відкатом поверни код, що не пише
-- `week:*`-відра, інакше кожне списання квоти Free впаде на CHECK.

DO $$
BEGIN
  DELETE FROM ai_usage_daily WHERE bucket LIKE 'week:%';

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
