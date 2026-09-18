-- 095_nutrition_pk_text.sql
--
-- Status: Active
--
-- Закриває тех-борг «Nutrition: PK-тип `nutrition_pantries` /
-- `nutrition_pantry_items` розходиться з клієнтським id»
-- (docs/90-work/tech-debt/backend.md), знайдений 2026-07-25. Продовження
-- міграції 094, яка зняла той самий клас багу в Рутині.
--
-- Живий прогін 2026-08-01 показав, що уражені не дві таблиці, а ЧОТИРИ —
-- клієнт у жодній з них не шле UUID:
--   nutrition_pantries.id       `home` | `p_<ms>_<idx>`
--   nutrition_pantry_items.id   `<pantryId>::<idx>::<name>`
--   nutrition_meals.id          `meal_mig_<ts>_<idx>_<uuid>` (legacy-фолбек)
--   nutrition_recipes.id        `rcp_ai_<hash>`
-- `POST /api/v2/sync/push` із цими id повертав `apply_failed` на всіх
-- чотирьох; контрольний op із голим UUID — `applied`.
--
-- Разом з PK міняємо і посилальні колонки, інакше FK не переживе зміну типу:
--   nutrition_pantry_items.pantry_id  → text (FK на nutrition_pantries)
--   nutrition_prefs.active_pantry_id  → text (вказує на ту саму комору)
--
-- Двофазність (Hard Rule #4) не потрібна: DROP колонок немає, `uuid → text`
-- через USING лише розширює домен значень. FK знімаємо й ставимо назад у тій
-- самій транзакції, тож зовні він не зникає. Залежних вʼю немає.
--
-- ВІДОМЕ ОБМЕЖЕННЯ (не лікується типом): id позиції комори містить index і
-- name, тому перейменування продукту чи зсув у масиві породжує НОВИЙ id, і
-- LWW-upsert по такому ключу лишається нестабільним. Канонічний шлях —
-- append-only `nutrition_pantry_events` з ключем `item_key` (ADR-0077 §3.2);
-- ця міграція лише прибирає 22P02, а не робить ключ стабільним.

BEGIN;

ALTER TABLE nutrition_pantry_items
  DROP CONSTRAINT nutrition_pantry_items_pantry_id_fkey;

ALTER TABLE nutrition_pantries
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE nutrition_pantry_items
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN pantry_id TYPE text USING pantry_id::text;

ALTER TABLE nutrition_pantry_items
  ADD CONSTRAINT nutrition_pantry_items_pantry_id_fkey
  FOREIGN KEY (pantry_id) REFERENCES nutrition_pantries(id) ON DELETE CASCADE;

ALTER TABLE nutrition_prefs
  ALTER COLUMN active_pantry_id TYPE text USING active_pantry_id::text;

ALTER TABLE nutrition_meals
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE nutrition_recipes
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMIT;
