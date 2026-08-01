-- Down migration: finyk/fizruk PK uuid → text
--
-- УВАГА: відкат НЕ безумовний, з тієї ж причини, що й у 094/095.
-- `text → uuid` через USING падає з 22P02, щойно в таблиці є хоч один
-- клієнтський id (`b_…`, `sub_…`, `a_…`, `cus_…`, bare timestamp,
-- `w_…`, `i_…`, `m_…`, `tpl_…`, `dl_…`, `<item.id>:s<n>`) — тобто рівно
-- ті рядки, заради яких міграція 096 і робилась.
--
-- Перед відкатом на живому середовищі перевір, що не-UUID рядків немає:
--   SELECT 'finyk_budgets' t, count(*) FROM finyk_budgets
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_subscriptions', count(*) FROM finyk_subscriptions
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_assets', count(*) FROM finyk_assets
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_debts', count(*) FROM finyk_debts
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_receivables', count(*) FROM finyk_receivables
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_custom_categories', count(*) FROM finyk_custom_categories
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_manual_expenses', count(*) FROM finyk_manual_expenses
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'finyk_tx_filters', count(*) FROM finyk_tx_filters
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_workouts', count(*) FROM fizruk_workouts
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_workout_items', count(*) FROM fizruk_workout_items
--     WHERE id !~ '^[0-9a-fA-F-]{36}$' OR workout_id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_workout_sets', count(*) FROM fizruk_workout_sets
--     WHERE id !~ '^[0-9a-fA-F-]{36}$' OR workout_item_id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_custom_exercises', count(*) FROM fizruk_custom_exercises
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_measurements', count(*) FROM fizruk_measurements
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_daily_log', count(*) FROM fizruk_daily_log
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'fizruk_workout_templates', count(*) FROM fizruk_workout_templates
--     WHERE id !~ '^[0-9a-fA-F-]{36}$';
-- Ненульовий результат означає, що відкат зітре ці рядки — знімай дамп.

BEGIN;

ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT fizruk_workout_items_workout_id_fkey;

ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT fizruk_workout_sets_workout_item_id_fkey;

ALTER TABLE finyk_tx_filters
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_manual_expenses
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_custom_categories
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_receivables
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_debts
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_assets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_subscriptions
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE finyk_budgets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_workout_templates
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_daily_log
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_measurements
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_custom_exercises
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_workouts
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE fizruk_workout_items
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN workout_id TYPE uuid USING workout_id::uuid;

ALTER TABLE fizruk_workout_sets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN workout_item_id TYPE uuid USING workout_item_id::uuid;

ALTER TABLE fizruk_workout_items
  ADD CONSTRAINT fizruk_workout_items_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES fizruk_workouts(id) ON DELETE CASCADE;

ALTER TABLE fizruk_workout_sets
  ADD CONSTRAINT fizruk_workout_sets_workout_item_id_fkey
  FOREIGN KEY (workout_item_id) REFERENCES fizruk_workout_items(id) ON DELETE CASCADE;

COMMIT;
