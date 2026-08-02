-- 094_routine_pk_text.sql
--
-- Status: Active
--
-- Закриває тех-борг «Routine: PK-тип `routine_*` розходиться з клієнтським id»
-- (docs/90-work/tech-debt/backend.md), знайдений 2026-07-24 і підтверджений
-- живим прогоном 2026-08-01 (docs/90-work/audits/web-qa-pre-beta.md).
--
-- Клієнт генерує id із доменним префіксом: `routineUid("hab"|"tag"|"cat")`
-- у packages/routine-domain/src/storage.ts дає `hab_<uuid>`, а
-- `buildCompletionRowId` для routine_entries — `<habitId>|<дата>|<стан>`.
-- Жодне з цього не є UUID, тому `SELECT ... WHERE id = $1` падав із 22P02
-- ще до apply-логіки, і КОЖЕН push Рутини повертався як `apply_failed`.
-- Помилка осідала рядком у клієнтському `sync_op_outbox` і нікуди не спливала,
-- тому модуль виглядав робочим, не маючи на сервері жодного рядка.
--
-- Обрано послаблення типу колонки, а не переписування id на клієнті: у
-- `routine_entries` id навмисно детермінований (ключ дедуплікації чекінів), і
-- випадковий UUID зламав би саме цю властивість. Прецедент уже в схемі —
-- `routine_completion_events` (міграція 085) свідомо оголошена як `id TEXT`,
-- щоб обійти цю саму пастку; тут ми лише доводимо решту таблиць до неї.
--
-- Двофазність (Hard Rule #4) не потрібна: DROP колонок немає, а `uuid → text`
-- через USING лише розширює домен значень, тож старий код, що шле валідні
-- UUID, працює без змін. FK на ці id відсутні (pg_constraint має лише
-- user_id → "user"), залежних вʼю теж немає.
--
-- DEFAULT лишаємо, щоб серверні INSERT без явного id поводились як раніше.

BEGIN;

ALTER TABLE routine_habits
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE routine_tags
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE routine_categories
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE routine_entries
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMIT;
