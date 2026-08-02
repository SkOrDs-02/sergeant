-- Down migration: nutrition PK uuid → text
--
-- УВАГА: відкат НЕ безумовний, з тієї ж причини, що й у 094. `text → uuid`
-- падає з 22P02, щойно в таблиці є хоч один клієнтський id (`home`,
-- `p_<ms>_<idx>`, `<pantryId>::<idx>::<name>`, `meal_mig_…`, `rcp_ai_…`) —
-- тобто рівно ті рядки, заради яких міграція 095 і робилась.
--
-- Перед відкатом на живому середовищі перевір, що не-UUID рядків немає:
--   SELECT 'nutrition_pantries' t, count(*) FROM nutrition_pantries
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'nutrition_pantry_items', count(*) FROM nutrition_pantry_items
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'nutrition_meals', count(*) FROM nutrition_meals
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'nutrition_recipes', count(*) FROM nutrition_recipes
--     WHERE id !~ '^[0-9a-fA-F-]{36}$';

BEGIN;

ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT nutrition_pantry_items_pantry_id_fkey;

ALTER TABLE nutrition_recipes
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE nutrition_meals
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE nutrition_prefs
  ALTER COLUMN active_pantry_id TYPE uuid USING active_pantry_id::uuid;

ALTER TABLE nutrition_pantry_items
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN pantry_id TYPE uuid USING pantry_id::uuid;

ALTER TABLE nutrition_pantries
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pantry_id_fkey
  FOREIGN KEY (pantry_id) REFERENCES nutrition_pantries(id) ON DELETE CASCADE;

COMMIT;
