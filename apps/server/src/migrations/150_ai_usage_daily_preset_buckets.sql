-- 150: бакети `preset:<id>` для сценарного бюджету AI-квоти.
--
-- `resolvePresetBudget` (`modules/chat/aiQuotaBudget.ts`) списує сценарний
-- preset (інтервʼю заповнення профілю) у власне тижневе відро
-- `preset:<id>`, але жоден CHECK цю родину не дозволяв. Кожна вставка падала
-- на `ai_usage_daily_bucket_format`, `assertAiQuota` ловив помилку й
-- пропускав запит без ліміту (fail-open), а збій ішов у circuit breaker, тож
-- серія preset-запитів могла розімкнути його і дати 503 на весь AI.
--
-- Форма як у 049/077/078/149: зняти CHECK і повернути надмножину.
-- Однофазно й ідемпотентно.

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
        OR bucket LIKE 'week:_%'
        OR bucket LIKE 'preset:_%'
      );
END $$;
