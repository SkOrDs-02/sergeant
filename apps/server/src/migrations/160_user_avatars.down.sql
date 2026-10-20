-- Відкат 160: прибирає таблицю аватарів.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Після відкату `user.image` лишає посилання на роут без даних (404 на GET).

DROP TABLE IF EXISTS user_avatars;
