-- Відкат 170: прибрати лічильник звички і привʼязку автовідмітки.
--
-- Локальний відкат: прод ніколи не виконує down.sql (Hard Rule #4).
-- Перед відкатом поверни код, що не читає ці колонки й таблицю, інакше
-- sync Рутини впаде на відсутніх колонках. Дані лічильників і привʼязки
-- втрачаються; звички лишаються «так/ні», відмітки (`completions`) цілі.
-- CHECK-и йдуть разом зі своїми колонками.

DROP INDEX IF EXISTS routine_habit_counts_user_habit_idx;
DROP TABLE IF EXISTS routine_habit_counts;

ALTER TABLE routine_habits
  DROP COLUMN IF EXISTS auto_mark_source,
  DROP COLUMN IF EXISTS count_unit,
  DROP COLUMN IF EXISTS count_target;
