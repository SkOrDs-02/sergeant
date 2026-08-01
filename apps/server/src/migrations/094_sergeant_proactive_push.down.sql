-- Down migration: sergeant_proactive_push
--
-- Дзеркалить 094 у зворотному порядку. Відкат чистий: усе, що додає up-міграція,
-- адитивне й не має зовнішніх читачів, крім коду цієї ж фічі.
--
-- УВАГА, що саме втрачається:
--   * `sergeant_push_log` — слід надісланих пушів. Після відкату й повторного
--     накату дедуп не знатиме про вже надіслане, тож у день реставрації юзер
--     може отримати другий пуш за ту саму добу.
--   * `sergeant_nudge_cache` — консерви порад. Не критично: клієнт перезапише
--     їх під час найближчого візиту.
--   * `"user".last_seen_at` — історія візитів. Відновиться природно, але до
--     першого візиту кожен акаунт знову виглядатиме як NULL, тобто шедулер
--     його не чіпатиме. Це безпечний бік помилки.
--
-- Якщо відкат робиться на живому середовищі й лог пушів ще потрібен:
--   COPY sergeant_push_log TO '/tmp/sergeant_push_log.csv' CSV HEADER;

ALTER TABLE user_preferences DROP COLUMN IF EXISTS sergeant_nudges;

DROP TABLE IF EXISTS sergeant_push_log;
DROP TABLE IF EXISTS sergeant_nudge_cache;

DROP INDEX IF EXISTS idx_user_last_seen_at;
ALTER TABLE "user" DROP COLUMN IF EXISTS last_seen_at;
