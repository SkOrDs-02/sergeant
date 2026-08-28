-- 128_nutrition_pantry_pk_per_user.sql
--
-- Status: Active
--
-- Комора не синхронізується ні в кого, крім однієї людини в усій системі.
--
-- `makeDefaultPantry()` (`packages/nutrition-domain/src/nutritionPantries.ts`)
-- віддає КОЖНОМУ користувачу комору з id `home`, а позиції комори дістають id
-- `<pantryId>::<index>::<name>` (`nutritionStorage.ts` -> `extractPantrySnapshots`).
-- Жоден із цих id не унікальний між користувачами: у двох людей із коморою
-- «Дім» і молоком на першій позиції id збігаються посимвольно.
--
-- Обидві таблиці при цьому мають ГЛОБАЛЬНИЙ primary key на `id` (035; типи
-- переведені в text міграцією 095). Тому перший користувач, чия комора доїхала
-- до сервера, займає `home` назавжди, а apply-шлях у всіх наступних бачить
-- `existing.user_id !== userId` і віддає `fk_violation`
-- (`applyNutritionPantries` / `applyNutritionPantryItems`). Клієнт позначає
-- рядок аутбоксу термінально відхиленим — комора лишається локальною назавжди,
-- і користувач про це не дізнається. Прод: SERGEANT-WEB-T,
-- `fk_violation (nutrition_pantries.insert)`, серпень 2026.
--
-- Лікуємо на боці схеми, а не клієнта: id тут семантично унікальний У МЕЖАХ
-- КОРИСТУВАЧА, а не глобально — рівно як це вже читається з кожного
-- `UPDATE ... WHERE id = ? AND user_id = ?` в apply-шарі. Композитний PK
-- робить наявний інваріант явним. Альтернатива (генерувати унікальний id на
-- клієнті) не полагодила б уже уражених користувачів, зажадала б міграції
-- локальних даних і зачепила б пʼять місць, де `home` зашитий фолбеком
-- активної комори.
--
-- Двофазність (Hard Rule #4) не потрібна: `DROP COLUMN` / `DROP TABLE` тут
-- немає, лише перевизначення constraint-ів у одній транзакції. Новий PK
-- СЛАБШИЙ за той, що знімаємо (глобальна унікальність `id` строгіша за
-- унікальність пари), тож наявні рядки задовольняють його за побудовою —
-- ні вибірки даних, ні переливання не потрібно.
--
-- FK `nutrition_pantry_items.pantry_id -> nutrition_pantries(id)` знімаємо і НЕ
-- повертаємо. Дві причини:
--   1. Він фізично не переживе зміну PK: FK вимагає унікальності саме на
--      `nutrition_pantries(id)`, а її більше немає.
--   2. Композитна заміна `(user_id, pantry_id) -> (user_id, id)` була б
--      РЕГРЕСІЄЮ. Sync V2 не гарантує порядок рядків усередині push-а, тож
--      позиція комори, що приїхала раніше за саму комору, дістала б помилку БД
--      замість нинішнього успішного запису. Той самий висновок уже зафіксовано
--      для `nutrition_pantry_events` у 086 («FK лишається лише на "user"(id)»):
--      у LWW-таблицях цілісність тримає apply-шар, а не constraint.
-- Каскад на видаленні акаунта НЕ втрачається: `nutrition_pantry_items.user_id`
-- має власний `REFERENCES "user"(id) ON DELETE CASCADE` ще з 035 — саме він
-- обслуговує GDPR-видалення, а не знятий тут FK на комору.
--
-- Осиротілі позиції (item користувача B із `pantry_id = 'home'`, що фізично
-- вказував на комору користувача A) окремого ремонту не потребують: вони вже
-- несуть правильний `user_id`, а після цієї міграції lookup стає user-scoped,
-- тож кожна резолвиться у власну комору свого користувача, щойно клієнт її
-- допуше.

BEGIN;

-- Спершу FK — він тримає унікальний індекс, що стоїть за PK комори.
ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT nutrition_pantry_items_pantry_id_fkey;

ALTER TABLE nutrition_pantries
  DROP CONSTRAINT nutrition_pantries_pkey;
ALTER TABLE nutrition_pantries
  ADD CONSTRAINT nutrition_pantries_pkey PRIMARY KEY (user_id, id);

ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT nutrition_pantry_items_pkey;
ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pkey PRIMARY KEY (user_id, id);

COMMIT;
