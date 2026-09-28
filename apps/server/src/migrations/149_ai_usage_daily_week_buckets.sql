-- 149: тижневі відра AI-квоти Free (`week:ai`, `week:photo`, `week:finyk-vision`).
--
-- Спека docs/work/specs/access-tiers.md переводить Free з денного відра
-- `default` (5 на добу) на тижневі: 20 дій, окремо 3 фото їжі і 5 vision-сканів
-- Фініка. Ключ тижня = понеділок ISO-тижня за Києвом, він пишеться в наявну
-- колонку `usage_day`, тож нова таблиця не потрібна, а лише ширший CHECK.
--
-- Форма як у 049/077/078: зняти CHECK і повернути надмножину. Однофазно:
-- усі наявні рядки підпадають під старий піднабір, а новий його строго
-- розширює. Ідемпотентно (`IF EXISTS` у `DO $$`), повторний прогін no-op.

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
      );
END $$;
