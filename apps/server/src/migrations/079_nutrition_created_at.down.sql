-- Відкат 079: прибрати created_at з обох nutrition-таблиць. Дані колонки
-- похідні (backfill з updated_at), тож drop безпечний для down-drill.

ALTER TABLE nutrition_water_log
  DROP COLUMN IF EXISTS created_at;

ALTER TABLE nutrition_shopping_list
  DROP COLUMN IF EXISTS created_at;
