-- Down для 104_ai_usage_endpoint_and_cache.sql (перейменовано з 091).
--
-- Local-only rollback — прод ніколи не запускає `.down.sql`. Знімає
-- обидва індекси і чотири колонки, додані up-міграцією. Рядки з
-- endpoint='legacy' (backfill up-міграції) втрачають цю позначку разом із
-- колонкою — це очікувано, бо колонка перестає існувати.

DROP INDEX IF EXISTS idx_ai_usage_daily_endpoint;
DROP INDEX IF EXISTS uq_ai_usage_daily_subject_day_bucket_endpoint;

ALTER TABLE ai_usage_daily
  DROP COLUMN IF EXISTS actual_cost_usd,
  DROP COLUMN IF EXISTS cache_creation_tokens,
  DROP COLUMN IF EXISTS cache_read_tokens,
  DROP COLUMN IF EXISTS endpoint;
