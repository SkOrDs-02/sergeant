-- Down для 106_ai_usage_daily_endpoint_pk.sql.
--
-- Local-only rollback — прод ніколи не запускає `.down.sql`. Повертає
-- 3-колонковий PK (subject_key, usage_day, bucket) з міграції 004 і
-- відновлює окремий 4-колонковий unique-індекс з міграції 104, а також
-- знімає NOT NULL з `endpoint` (стан "після 104, до 106").
--
-- Це відновлює РІВНО ту несумісність, яку 106 виправляла (другий
-- endpoint на ту саму трійку знову падатиме з 23505) — очікувано для
-- rollback-drill-а, який лише перевіряє, що схема повертається у
-- попередній зафіксований стан, а не що цей стан безпечний.

-- Preflight: 3-колонковий PK неможливо відновити, якщо дані вже містять
-- кілька endpoint-рядків на ту саму трійку (саме той стан, який 106
-- легалізувала). Фейлимось з ясним повідомленням ДО DROP CONSTRAINT —
-- інакше ALTER упаде посеред шляху з криптичним 23505.
DO $$
DECLARE
  duplicate_triples bigint;
BEGIN
  SELECT count(*) INTO duplicate_triples
  FROM (
    SELECT 1
    FROM ai_usage_daily
    GROUP BY subject_key, usage_day, bucket
    HAVING count(*) > 1
  ) AS dup;
  IF duplicate_triples > 0 THEN
    RAISE EXCEPTION
      'ai_usage_daily: % трійок (subject_key, usage_day, bucket) мають >1 рядок — 3-колонковий PK не відновити. Злийте або видаліть дублікати перед rollback-ом 106.',
      duplicate_triples;
  END IF;
END $$;

ALTER TABLE ai_usage_daily
  DROP CONSTRAINT IF EXISTS ai_usage_daily_pkey;

ALTER TABLE ai_usage_daily
  ADD CONSTRAINT ai_usage_daily_pkey
    PRIMARY KEY (subject_key, usage_day, bucket);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_daily_subject_day_bucket_endpoint
  ON ai_usage_daily (subject_key, usage_day, bucket, endpoint);

ALTER TABLE ai_usage_daily
  ALTER COLUMN endpoint DROP NOT NULL;
