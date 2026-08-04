-- 104 (перейменовано з 091): облік AI-вартості по ендпоінтах, реальна ціна
-- і кеш-токени.
--
-- Renumbering note (2026-08-04, аудит pre-beta schema debt). Файл народився
-- як `091_ai_usage_endpoint_and_cache.sql` на гілці, паралельній до вже
-- накочених у прод `091_privat_connection.sql` і
-- `091_telegram_beta_survey.sql` (див. `APPLIED_DUPLICATE_NUMBERS` у
-- `scripts/lint-migrations.mjs`). На відміну від тих двох, ЦЕЙ файл ніколи
-- не деплоївся — `schema_migrations` у проді про нього не знає, тож
-- перейменування безпечне без bookkeeping-DELETE (на відміну від прецеденту
-- `038_rename_035_rate_limit_buckets.sql` /
-- `044_rename_041_email_unsubscribes.sql`, де старий номер уже був у
-- ledger-і). PK на 4 колонки додає окрема міграція
-- `105_ai_usage_daily_endpoint_pk.sql`.
--
-- WHY. Досі `ai_usage_daily` розрізняв споживання лише по `bucket`
-- (`anthropic:<model>`). Поки перший тур і синтез їхали різними моделями, це
-- випадково працювало як розріз по кроках. Щойно обидва слоти стають однією
-- моделлю — рядки зливаються, і питання «скільки коштує вибір інструмента
-- проти відповіді» перестає мати відповідь. Ті самі рядки збирають ще й
-- digest/nutrition/mono, якщо ті на тій самій моделі.
--
-- WHY кеш-токени. Payload першого туру — ~10.5k незмінних токенів (77 схем
-- інструментів + SYSTEM_PREFIX), і вони кешуються з TTL=1h. Різниця між
-- влучанням і промахом — десятикратна, але зараз перевірити, чи кеш узагалі
-- спрацьовує в проді, неможливо: ці числа нікуди не пишуться.
--
-- WHY окрема колонка вартості. `est_cost_usd` — оцінка з локальної
-- прайс-таблиці, яка систематично протухає. OpenRouter повертає РЕАЛЬНО
-- списану суму в `usage.cost`; для неї потрібне власне поле, щоб не змішувати
-- виміряне з порахованим.
--
-- Additive-first: усі колонки nullable без DEFAULT-беквфілу, наявні рядки
-- лишаються валідними. Розширення унікальності — окремим кроком нижче.

ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS cache_read_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC(12, 8);

-- Наявні рядки не мають ендпоінта — позначаємо явно, щоб `NULL` означав
-- «колонки ще не було», а не «невідомо чому порожньо».
UPDATE ai_usage_daily SET endpoint = 'legacy' WHERE endpoint IS NULL;

-- Грануляція тепер (subject, day, bucket, endpoint). Старий PK лишається
-- чинним для рядків з endpoint='legacy'; новий унікальний індекс дозволяє
-- писати різні ендпоінти однієї моделі окремими рядками.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_daily_subject_day_bucket_endpoint
  ON ai_usage_daily (subject_key, usage_day, bucket, endpoint);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_endpoint
  ON ai_usage_daily (endpoint, usage_day);
