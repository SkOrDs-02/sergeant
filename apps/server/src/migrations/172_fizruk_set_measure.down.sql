-- Відкат 172: прибрати секунди й метри підходів і тип виміру вправи.
--
-- Локальний відкат: прод ніколи не виконує down.sql (Hard Rule #4).
-- Перед відкатом поверни код, що не читає ці колонки, інакше sync Фізрука
-- впаде на відсутніх колонках. Секунди й метри підходів і типи виміру
-- втрачаються. CHECK-и йдуть разом зі своїми колонками. Однойменні
-- колонки `fizruk_workout_items.duration_sec` / `distance_m` (029) не
-- чіпаються.

ALTER TABLE fizruk_workout_items DROP COLUMN IF EXISTS measure;

ALTER TABLE fizruk_workout_sets
  DROP COLUMN IF EXISTS distance_m,
  DROP COLUMN IF EXISTS duration_sec;
