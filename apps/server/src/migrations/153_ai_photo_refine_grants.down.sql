-- Відкат 153: прибирає таблицю грантів refine-photo разом з індексом.
-- Без таблиці refine-photo безпечно списує week:photo (збій пошуку гранту =
-- гранту немає), тож відкат не відкриває обхід квоти.

DROP INDEX IF EXISTS ai_photo_refine_grants_created_at_idx;
DROP TABLE IF EXISTS ai_photo_refine_grants;
