-- 035 rollback: drop nutrition tables in reverse FK order so child rows
-- (`nutrition_pantry_items`) are removed before their parent
-- (`nutrition_pantries`). `IF EXISTS` makes this idempotent — re-running
-- the rollback against an already-clean DB is a no-op (AGENTS rule #4).
DROP TABLE IF EXISTS nutrition_pantry_items;
DROP TABLE IF EXISTS nutrition_pantries;
DROP TABLE IF EXISTS nutrition_meals;
DROP TABLE IF EXISTS nutrition_recipes;
DROP TABLE IF EXISTS nutrition_prefs;
