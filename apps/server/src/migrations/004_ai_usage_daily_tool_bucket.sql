-- Розділяємо денний лічильник AI за "бакетами": `default` для plain chat,
-- `tool:<name>` для окремих tool-use викликів. Це дає окремі ліміти і робить
-- tool-use дорожчим за звичайний чат (через cost-коефіцієнт у хендлері).
ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS bucket TEXT NOT NULL DEFAULT 'default';

-- Primary key тепер включає bucket. Старий PK був (subject_key, usage_day) —
-- поточні записи коректно перекваліфікуються як bucket='default' через DEFAULT.
ALTER TABLE ai_usage_daily
  DROP CONSTRAINT IF EXISTS ai_usage_daily_pkey;
ALTER TABLE ai_usage_daily
  ADD PRIMARY KEY (subject_key, usage_day, bucket);
