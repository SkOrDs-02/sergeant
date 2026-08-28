-- Down migration: nutrition_pantry_pk_per_user
--
-- Повертає глобальні PK на `id` і FK позиції -> комора, тобто стан до 129.
--
-- ПЕРЕДУМОВА, яку не можна обійти: відкат можливий, лише поки в жодній із двох
-- таблиць немає двох рядків з однаковим `id` у РІЗНИХ користувачів. Саме такі
-- рядки міграція 129 і дозволяє (кожен юзер має власну комору `home`), тож
-- після того, як бодай двоє людей синхронізують комору, `ADD PRIMARY KEY (id)`
-- нижче впаде на `duplicate key value`.
--
-- Це навмисно. Мовчазна альтернатива — видалити «зайві» рядки — знищила б
-- комору реальних користувачів заради відкоту схеми; гучне падіння лишає
-- рішення людині. Перед відкотом перевір, що дублів немає:
--
--   SELECT id, count(*) FROM nutrition_pantries     GROUP BY id HAVING count(*) > 1;
--   SELECT id, count(*) FROM nutrition_pantry_items GROUP BY id HAVING count(*) > 1;
--
-- Обидва запити мають повернути нуль рядків.

BEGIN;

ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT nutrition_pantry_items_pkey;
ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pkey PRIMARY KEY (id);

ALTER TABLE nutrition_pantries
  DROP CONSTRAINT nutrition_pantries_pkey;
ALTER TABLE nutrition_pantries
  ADD CONSTRAINT nutrition_pantries_pkey PRIMARY KEY (id);

ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pantry_id_fkey
  FOREIGN KEY (pantry_id) REFERENCES nutrition_pantries(id) ON DELETE CASCADE;

COMMIT;
