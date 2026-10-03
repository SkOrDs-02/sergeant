-- Migration: nutrition_pantry_events
-- Created: 2026-07-25
--
-- 086: Append-only журнал руху продуктів у коморі. Хвиля 1, СТАДІЯ 1
-- задачі W1-PANTRY-APPEND (`docs/90-work/planning/product-knowledge-backlog.md`).
--
-- Контекст
-- --------
-- Залишок у коморі сьогодні — МУТОВАНИЙ ЛІЧИЛЬНИК на трьох рівнях
-- (`nutrition_pantry_items.qty`). `consumePantryItem`
-- (`apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts`) читає
-- `qty`, віднімає і ПЕРЕЗАПИСУЄ; при `remaining <= 0` робить
-- `items.splice(idx, 1)` — позиція зникає, факт споживання не лишається
-- ніде. HubChat-екзекутор `consume_from_pantry`
-- (`apps/web/src/core/lib/chatActions/nutritionActions.ts`) видаляє позицію
-- цілком, ігноруючи кількість. Сервер накладає на це класичний per-row LWW
-- (`applyNutritionPantryItems`), тож некомутативні decrement/increment із
-- двох пристроїв дають «останній пише» — одна операція гине без сліду
-- (audit E-7, `docs/90-work/audits/product-knowledge-nutrition.md`).
--
-- Ця таблиця — append-only журнал сирих фактів руху. На стадії 1 вона НЕ
-- пишеться і НЕ читається ніким: жоден UI, hook, chat-tool чи звіт на неї
-- не спирається, `nutrition_pantry_items.qty` лишається ЄДИНИМ джерелом
-- залишку. Якщо журнал зламається — продукт не помітить. Це і є критерій
-- приймання стадії 1.
--
-- Свідомі рішення схеми
-- ---------------------
-- 1. `id` / `pantry_id` / `item_id` / `meal_id` — TEXT, а НЕ UUID.
--    Це НЕ недогляд і НЕ «неузгодженість» із `nutrition_pantry_items`.
--    Клієнт формує ці id як НЕ-UUID рядки:
--      * pantry id  -> `home` або `p_<ms>_<idx>`
--        (`packages/nutrition-domain/src/nutritionPantries.ts`),
--      * item id    -> `${pantryId}::${index}::${name}`
--        (`apps/web/src/modules/nutrition/lib/nutritionStorage.ts`
--        -> `extractPantrySnapshots`).
--    У Postgres `nutrition_pantries.id` і `nutrition_pantry_items.id`
--    оголошені `UUID` (`035_nutrition_tables.sql`), тому реальний push із
--    браузера падає на `22P02` (`invalid input syntax for type uuid`) —
--    той самий клас багу, що вже задокументований для routine у
--    `docs/90-work/tech-debt/backend.md` § «Routine: PK-тип». Нова таблиця
--    свідомо обходить пастку замість того, щоб її успадкувати.
--    НЕ «наводь симетрію» з `nutrition_pantry_items` — симетрія тут і є баг.
-- 2. З тієї ж причини тут НЕМАЄ FK на `nutrition_pantries(id)` /
--    `nutrition_pantry_items(id)`: типи фізично різні (TEXT vs UUID), FK
--    неможливий. FK лишається лише на `"user"(id)` — він TEXT (Better Auth
--    opaque string) і збігається.
-- 3. Подія несе І `item_id` (ідентичність рядка), І `item_key`
--    (`canonicalFoodKey(name)` з `packages/nutrition-domain`). `item_id`
--    нестабільний за конструкцією — він містить індекс і назву, тож
--    перейменування чи зсув позиції в масиві породжує НОВИЙ id. `item_key`
--    переживає обидві операції, тому згортка залишку ключується саме ним.
-- 4. `delta_qty` (знакова) для 'consume'/'replenish' vs `abs_qty`
--    (чекпойнт) для 'adjust'/'initial' — CHECK нижче гарантує, що подія
--    несе рівно ту величину, яка має сенс для її kind. Це backstop:
--    apply-шлях (`applyNutritionPantryEvents`) валідує раніше і віддає
--    `missing_delta_or_abs` / `invalid_event_kind`.
-- 5. `deleted_at` є, попри append-only. Це РЕТРАКЦІЯ помилково записаної
--    події (зміст рядка не переписується — згортка просто перестає його
--    враховувати), а не редагування історії. `op='update'` apply-шлях
--    відхиляє з `append_only_violation`; `op='delete'` ставить tombstone.
--
-- Hard Rule #4: міграція ЧИСТО additive — ЖОДНОГО ALTER / DROP над
-- існуючими таблицями, зокрема над `nutrition_pantry_items`. `.down.sql`
-- написано, але прод на нього не покладається (forward-only `db:migrate`).
--
-- Канон: docs/01-product/model/nutrition.md §9
-- ADR:   docs/04-governance/adr/0077-pantry-append-only-ledger.md
-- Аудит: docs/90-work/audits/product-knowledge-nutrition.md § E-2 / E-7

CREATE TABLE IF NOT EXISTS nutrition_pantry_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  pantry_id    TEXT NOT NULL,
  item_id      TEXT,
  item_key     TEXT NOT NULL,
  kind         TEXT NOT NULL
               CHECK (kind IN ('consume', 'replenish', 'adjust', 'initial')),
  delta_qty    REAL,
  abs_qty      REAL,
  unit         TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',
  meal_id      TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT nutrition_pantry_events_qty_shape CHECK (
    (kind IN ('consume', 'replenish') AND delta_qty IS NOT NULL)
    OR (kind IN ('adjust', 'initial') AND abs_qty IS NOT NULL)
  )
);

-- Гарячий запит майбутньої згортки (`derivePantryQty`): «усі події однієї
-- позиції комори в хронологічному порядку» — останній чекпойнт
-- ('initial'/'adjust') плюс сума delta після нього. Порядок колонок дає ще
-- й префіксні сканування (user_id) та (user_id, pantry_id).
CREATE INDEX IF NOT EXISTS nutrition_pantry_events_user_item_idx
  ON nutrition_pantry_events (user_id, pantry_id, item_key, occurred_at);

-- Живі (не ретраговані) події користувача — форма, яку читає sync-pull і
-- майбутній parity-звіт стадії 3.
CREATE INDEX IF NOT EXISTS nutrition_pantry_events_user_active_idx
  ON nutrition_pantry_events (user_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE nutrition_pantry_events IS
  'Append-only ledger of pantry stock movements (kind=consume|replenish|adjust|initial). NEITHER WRITTEN NOR READ as of stage 1 (W1-PANTRY-APPEND): nutrition_pantry_items.qty stays the single source of truth for the remaining quantity. Never UPDATE a row here - the sync apply-path rejects op=update with reason append_only_violation; op=delete only sets deleted_at (retraction of a mis-recorded event). id/pantry_id/item_id are TEXT (not UUID) on purpose: the client generates non-UUID ids (home, p_<ms>_<idx>, <pantryId>::<idx>::<name>) - see docs/90-work/tech-debt/backend.md section "Routine: PK-type" for the same class of bug. Canon: docs/01-product/model/nutrition.md section 9. ADR: docs/04-governance/adr/0077-pantry-append-only-ledger.md.';

COMMENT ON COLUMN nutrition_pantry_events.item_key IS
  'canonicalFoodKey(name) from packages/nutrition-domain/src/pantryTextParser.ts. The fold keys on this, not on item_id: item_id embeds the array index and the name, so a rename or a reorder mints a brand new id.';

COMMENT ON COLUMN nutrition_pantry_events.delta_qty IS
  'Signed change in the item own unit (negative for consume). Required for kind=consume|replenish, NULL for checkpoints.';

COMMENT ON COLUMN nutrition_pantry_events.abs_qty IS
  'Absolute checkpoint quantity in the item own unit. Required for kind=adjust|initial, NULL for deltas.';

COMMENT ON COLUMN nutrition_pantry_events.source IS
  'Origin of the event: meal_log | manual | parse_pantry | chat_tool | shopping_list | backfill.';

COMMENT ON COLUMN nutrition_pantry_events.deleted_at IS
  'Retraction tombstone for a mis-recorded event. The fold skips tombstoned rows; the event body is never rewritten.';
