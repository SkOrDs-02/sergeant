-- 135_routine_weekly_target_history.sql
--
-- PR-2 спеки `routine-flexible-weekly-frequency`: адитивне поле історії
-- тижневої цілі для `recurrence='flexible'`.
--
-- Форма: JSON array of `{ "from": "YYYY-MM-DD", "target": 1..7 }`.
-- Сервер навмисно перевіряє тільки array-shape: детальну нормалізацію
-- робить routine-domain, а старі клієнти поля не шлють і отримують
-- безпечний дефолт `[]`.

ALTER TABLE routine_habits
  ADD COLUMN IF NOT EXISTS weekly_target_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE routine_habits
  ADD CONSTRAINT routine_habits_weekly_target_history_array
  CHECK (jsonb_typeof(weekly_target_history) = 'array');
