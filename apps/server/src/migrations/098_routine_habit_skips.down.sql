-- Down для 098_routine_habit_skips.sql
--
-- Обидві зміни адитивні, тож відкат безпечний: таблиця пропусків не має
-- зовнішніх залежностей, а `pause_intervals` читається лише клієнтом і
-- деградує у «пауз немає».

DROP INDEX IF EXISTS routine_habit_skips_user_active_idx;
DROP TABLE IF EXISTS routine_habit_skips;

ALTER TABLE routine_habits
  DROP COLUMN IF EXISTS pause_intervals;
