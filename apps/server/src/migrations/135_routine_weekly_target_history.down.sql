-- Down для 135_routine_weekly_target_history.sql

ALTER TABLE routine_habits
  DROP CONSTRAINT IF EXISTS routine_habits_weekly_target_history_array;

ALTER TABLE routine_habits
  DROP COLUMN IF EXISTS weekly_target_history;
