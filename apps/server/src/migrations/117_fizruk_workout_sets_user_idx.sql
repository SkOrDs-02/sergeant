-- Migration: fizruk_workout_sets_user_idx
-- Created: 2026-08-05
--
-- Індекс `fizruk_workout_sets(user_id)` — закриває пропущений FK-індекс,
-- через який видалення акаунта сканує всю таблицю підходів.
--
-- Аудит шару даних 2026-08-05. Postgres НЕ створює індекс на боці, що
-- посилається (referencing side) — його заводять руками. У
-- `fizruk_workout_sets` є `user_id TEXT NOT NULL REFERENCES "user"(id)
-- ON DELETE CASCADE` (міграція 029, рядок 82), але єдиний індекс таблиці —
-- `fizruk_workout_sets_item_idx (workout_item_id, sort_order)`. `user_id`
-- серед провідних колонок немає, тож для планувальника індексу по ній не
-- існує.
--
-- Що це ламає. `deleteUserData` (`apps/server/src/modules/me/dataRights.ts`)
-- виконує жорсткий `DELETE FROM "user"`, і CASCADE мусить знайти рядки
-- цього юзера в КОЖНІЙ дочірній таблиці. Без індексу це Seq Scan по всій
-- таблиці — а це найбільша таблиця fizruk-дерева: один рядок на КОЖЕН
-- підхід кожної вправи кожного тренування ВСІХ юзерів. Тривалість
-- видалення одного акаунта росте лінійно з обсягом тренувань усієї бази,
-- і весь цей час тримається блокування.
--
-- Чому це недогляд, а не рішення: сусідня `fizruk_workout_items` має рівно
-- такий індекс — `fizruk_workout_items_user_idx (user_id)` (029, рядок 75).
-- Дві таблиці одного дерева, однаковий FK, індекс лише в однієї.
--
-- Форма навмисно та сама, що в sibling-а — один стовпець, без композиту.
-- CASCADE шукає рівно за рівністю по `user_id`; друга колонка коштувала б
-- на кожному записі підходу, не купуючи нічого для цього запиту.
--
-- Безпека rollout-у: чистий адитивний `CREATE INDEX IF NOT EXISTS` — стара
-- версія застосунку працює без змін. НЕ `CONCURRENTLY`: раннер виконує
-- міграцію всередині транзакції (`packages/db-schema/src/migrate/adapters/pg.ts`),
-- а `CREATE INDEX CONCURRENTLY` у транзакції заборонений. На поточному
-- обсязі це частки секунди.

CREATE INDEX IF NOT EXISTS fizruk_workout_sets_user_idx
  ON fizruk_workout_sets (user_id);

COMMENT ON INDEX fizruk_workout_sets_user_idx IS
  'FK-index for ON DELETE CASCADE from "user"(id). Without it, account deletion seq-scans the whole sets table. Mirrors fizruk_workout_items_user_idx.';
