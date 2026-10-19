-- Відкат 157: прибирає таблицю тегів операцій разом з індексом.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Теги, не відправлені з пристроїв, лишаються в їхніх SQLite.

DROP INDEX IF EXISTS finyk_tx_tags_user_active_idx;
DROP TABLE IF EXISTS finyk_tx_tags;
