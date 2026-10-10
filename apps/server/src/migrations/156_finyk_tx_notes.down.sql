-- Відкат 156: прибирає таблицю нотаток до операцій разом з індексом.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Нотатки, не відправлені з пристроїв, лишаються в їхніх SQLite/LS.

DROP INDEX IF EXISTS finyk_tx_notes_user_active_idx;
DROP TABLE IF EXISTS finyk_tx_notes;
