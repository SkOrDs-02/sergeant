-- ADR-0073 (рішення власника №5, 2026-07-03): додати `created_at` до двох
-- nutrition-таблиць, які Stage 11 (051_nutrition_full_state.sql) створив
-- без нього. Передумова Кроку 2 міграції на generic dual-write фреймворк —
-- знімає `TableSpec.createdAt: "absent"` для цих таблиць.
--
-- Колонка свідомо nullable: адаптери почнуть писати created_at лише з
-- Кроку 2 (уніфікована семантика `entity.createdAt ?? clientTs`); NOT NULL
-- затягнемо окремою міграцією, коли всі писачі гарантовано її заповнюють
-- (двофазна дисципліна в дусі Hard Rule #4). Backfill = updated_at —
-- найкраще доступне наближення для існуючих рядків.

ALTER TABLE nutrition_water_log
  ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE nutrition_water_log
   SET created_at = updated_at
 WHERE created_at IS NULL;

ALTER TABLE nutrition_shopping_list
  ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE nutrition_shopping_list
   SET created_at = updated_at
 WHERE created_at IS NULL;
