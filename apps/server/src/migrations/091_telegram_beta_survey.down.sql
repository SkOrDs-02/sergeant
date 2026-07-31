-- Down migration: telegram_beta_survey_responses
--
-- Ідемпотентний rollback для `091_telegram_beta_survey.sql`. Таблиця
-- зʼявилась саме в 091 і нічого іншого не змінювала — DROP TABLE знімає
-- власний індекс і FK разом із рядками.
--
-- ⚠️ Відповіді тестерів втрачаються безповоротно: у Telegram їх не
-- перепитаєш, а сам callback-апдейт живе лічені хвилини.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations).

DROP TABLE IF EXISTS telegram_beta_survey_responses;
