-- Down migration: nutrition_pantry_pk_per_user
--
-- Повертає глобальні PK на `id` і FK позиції -> комора, тобто стан до 129.
--
-- ПОРЯДОК ТУТ НЕ ДОВІЛЬНИЙ, і саме він робить відкат ідемпотентним
-- (`rollback-sanity.test.ts` проганяє кожен down.sql ДВІЧІ). FK
-- `nutrition_pantry_items_pantry_id_fkey` посилається на унікальність
-- `nutrition_pantries(id)`, тож поки він існує, `nutrition_pantries_pkey`
-- не дропнеться: Postgres віддає `cannot drop constraint ... because other
-- objects depend on it`. Перший прогін цього не показує (FK зняла up-міграція
-- 129 і на вході його немає), а другий — уже так, бо кінець першого його
-- повернув. Тому FK знімаємо ПЕРШИМ, до будь-яких дій з PK, і повертаємо
-- останнім.
--
-- `IF EXISTS` на всіх DROP — з тієї ж причини: другий прогін заходить у вже
-- відкочену схему.
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
-- ДРУГА ПЕРЕДУМОВА, з тієї ж природи: осиротілі позиції. Крок 3 нижче повертає
-- FK `pantry_id -> nutrition_pantries(id)`, тобто ГЛОБАЛЬНЕ посилання, і
-- Postgres вимагає для кожного рядка наявну цільову комору. Міграція 129 такий
-- стан якраз і уможливлює: після неї lookup user-scoped, тож позиція цілком
-- законно живе з `pantry_id`, чия комора під тим самим `id` належить іншому
-- користувачу або ще не доїхала з клієнта. Обидві перевірки на дублі вище на
-- це сліпі — вони дивляться лише на `id`, а не на звʼязок.
--
--   SELECT i.id, i.user_id, i.pantry_id
--     FROM nutrition_pantry_items AS i
--     LEFT JOIN nutrition_pantries AS p ON p.id = i.pantry_id
--    WHERE p.id IS NULL;
--
-- Усі три запити мають повернути нуль рядків. Знайдено ревʼю-ботом на PR #915.

BEGIN;

-- 1. FK — першим: він тримає унікальність `nutrition_pantries(id)`.
ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT IF EXISTS nutrition_pantry_items_pantry_id_fkey;

-- 2. Композитні PK -> глобальні.
ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT IF EXISTS nutrition_pantry_items_pkey;
ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pkey PRIMARY KEY (id);

ALTER TABLE nutrition_pantries
  DROP CONSTRAINT IF EXISTS nutrition_pantries_pkey;
ALTER TABLE nutrition_pantries
  ADD CONSTRAINT nutrition_pantries_pkey PRIMARY KEY (id);

-- 3. FK назад — останнім, коли цільова унікальність уже існує.
ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pantry_id_fkey
  FOREIGN KEY (pantry_id) REFERENCES nutrition_pantries(id) ON DELETE CASCADE;

COMMIT;
