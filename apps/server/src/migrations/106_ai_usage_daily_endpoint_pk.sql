-- 106: перебудова PK `ai_usage_daily` на 4 колонки (subject_key, usage_day,
-- bucket, endpoint) — закриває несумісність, знайдену в pre-beta
-- schema-debt аудиті 2026-08-04.
--
-- WHY. `anthropicUsageStore.ts` (`recordAnthropicUsageToDb`) і
-- `routes/internal/ai-usage.ts` обидва пишуть
--   `INSERT INTO ai_usage_daily (...) VALUES (...)
--    ON CONFLICT (subject_key, usage_day, bucket, endpoint) DO UPDATE ...`
-- Postgres резолвить `ON CONFLICT (cols)` проти unique-індексу/констрейнта,
-- що ТОЧНО покриває заданий список колонок. Міграція 104
-- (`104_ai_usage_endpoint_and_cache.sql`, колишня `091_*`) додала саме
-- такий 4-колонковий unique-індекс — але PK лишився 3-колонковим
-- (`subject_key, usage_day, bucket` — міграція 004). Це не той самий
-- констрейнт: коли другий `endpoint` пише в ту саму трійку
-- `(subject, day, bucket)`, INSERT все одно порушує СТАРИЙ 3-колонковий
-- PK (значення `subject_key, usage_day, bucket` уже існує з іншим
-- `endpoint`), а `ON CONFLICT` не ловить конфлікт по констрейнту, який не
-- є заявленим arbiter-ом — Postgres кидає 23505 замість запланованого
-- UPDATE. Другий endpoint для тієї самої моделі того самого дня завжди
-- падав.
--
-- FIX. PK стає 4-колонковим (як і задумано в 104), а старий 4-колонковий
-- unique-індекс, що більше не потрібен окремо від PK, знімається.
--
-- NOT NULL перед PK. `endpoint` лишався nullable з 104 (additive-first —
-- Hard Rule #4). Тут — окремий, заявлений крок 2 патерну «додай
-- nullable → backfill → NOT NULL»: 104 уже забекфілив існуючі рядки як
-- `endpoint = 'legacy'`; перед тим, як колонка стане частиною PK (яка не
-- може містити NULL), додатковий backfill нижче ловить будь-які рядки,
-- вставлені між деплоєм 104 і цим деплоєм (малоймовірно на pre-deploy
-- міграціях, але дешево і безпечно).
--
-- Sentinel-канон: 'legacy' (не 'unknown'). Backfill 104 і цей backfill
-- обидва пишуть `'legacy'` для рядків без ендпоінта. Живий код
-- (`anthropicUsageStore.ts:169`, `endpoint ?? "unknown"`) досі підставляє
-- інший sentinel — Stage 2 (server) має уніфікувати його до `'legacy'`,
-- щоб `GROUP BY endpoint` в `/internal/ai-usage` не розділяв один
-- логічний "без ендпоінта" кейс на два різні рядки. Це серверна зміна
-- коду, тут лише зазначено.

UPDATE ai_usage_daily SET endpoint = 'legacy' WHERE endpoint IS NULL;

ALTER TABLE ai_usage_daily
  ALTER COLUMN endpoint SET NOT NULL;

ALTER TABLE ai_usage_daily
  DROP CONSTRAINT IF EXISTS ai_usage_daily_pkey;

DROP INDEX IF EXISTS uq_ai_usage_daily_subject_day_bucket_endpoint;

ALTER TABLE ai_usage_daily
  ADD PRIMARY KEY (subject_key, usage_day, bucket, endpoint);
