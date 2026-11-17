-- Відкат 165: прибирає окремий маркер wipe чеків Сільпо.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Колонка silpo_connection.receipts_wiped_at (159) лишається як була.

DROP TABLE IF EXISTS silpo_wipe_marker;
