-- 132 down: відкотити оцінку витрат і свої заняття.
--
-- Дані по обох втрачаються назавжди: kcal_burned - єдине місце, де жило
-- заморожене число (клієнт після відкоту перерахує його формулою за поточною
-- вагою), а свої заняття дзеркала не мають. Це очікувана ціна down-міграції.

DROP INDEX IF EXISTS fizruk_custom_activities_user_idx;
DROP TABLE IF EXISTS fizruk_custom_activities;

ALTER TABLE fizruk_workouts
  DROP COLUMN IF EXISTS kcal_burned;
