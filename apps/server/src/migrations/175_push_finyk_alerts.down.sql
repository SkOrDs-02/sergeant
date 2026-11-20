-- Відкат 175: прибрати тумблер push Фініка.
--
-- Локальний відкат: прод ніколи не виконує down.sql (Hard Rule #4).
-- Перед відкатом поверни код, що не читає цю колонку, інакше
-- `/api/me/preferences` і прохід push Фініка впадуть на відсутній колонці.
-- Вибір людини (вимкнений тумблер) втрачається.
ALTER TABLE user_preferences DROP COLUMN IF EXISTS push_finyk_alerts;
