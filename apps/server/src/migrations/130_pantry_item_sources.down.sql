-- Down для 130_pantry_item_sources.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Знімає колонку варіантів; позиції комори повертаються до форми
-- `name + qty + unit + notes`, у якій вони й лежали до цієї міграції.
-- Родові назви, вже записані у `name`, відкат НЕ повертає — вони лишаються
-- звичайними назвами позицій, які людина може перейменувати руками.

ALTER TABLE nutrition_pantry_items
  DROP COLUMN IF EXISTS sources;
