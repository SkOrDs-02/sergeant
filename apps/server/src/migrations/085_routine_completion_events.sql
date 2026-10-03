-- Migration: routine_completion_events
-- Created: 2026-07-25
--
-- 085: Append-only журнал відміток звичок. Хвиля 1, СТАДІЯ 1 задачі
-- W1-ROUTINE-APPEND (`docs/90-work/planning/product-knowledge-backlog.md`).
--
-- Контекст
-- --------
-- Сьогодні відмітка виконання — МУТОВАНА МНОЖИНА, а не журнал: клієнт тримає
-- `RoutineState.completions: Record<habitId, dateKey[]>`, toggle або додає,
-- або ВИДАЛЯЄ dateKey, а персист (`routine_entries`) зберігає один рядок на
-- (звичку, день) із soft-delete tombstone-ом. Факт «було відмічено, потім
-- знято» не зберігається ніде, а похідні (стрік / rate / heatmap) рахуються з
-- ПОТОЧНОЇ конфігурації і ретроактивно переписуються при паузі чи архіві
-- (audit E-3 / E-6 / E-7 у `docs/90-work/audits/product-knowledge-routine.md`).
--
-- Ця таблиця — append-only журнал сирих фактів. На стадії 1 вона тільки
-- ПИШЕТЬСЯ (паралельно зі старим шляхом) і НЕ читається ніким: жоден UI,
-- push, digest чи chat-tool на неї не спирається. Якщо журнал зламається —
-- продукт не помітить. Це і є критерій приймання стадії 1.
--
-- Свідомі рішення схеми
-- ---------------------
-- 1. `id` — TEXT, НЕ UUID. `routine_entries.id` у PG оголошений як `UUID`
--    (`026_routine_tables.sql`), тоді як клієнт шле `hab_<base36>_<rand>:
--    YYYY-MM-DD` → реальний push падає з `22P02` → `apply_failed`
--    (`docs/90-work/tech-debt/backend.md` § «Routine: PK-тип»). Нова таблиця
--    свідомо обходить цю пастку: id генерує клієнт як детермінований TEXT.
-- 2. Подія несе І `date_key` (як його порахував КЛІЄНТ), І сирі
--    `occurred_at` + `tz_offset_min` + `day_anchor`. Тому рішення про єдину
--    часову доктрину (задача W1-TIME-DOCTRINE, Kyiv vs device-local) можна
--    ухвалити ПІСЛЯ і переграти ключі з подій — стадія 1 ним не заблокована.
-- 3. `state` = 'done' | 'undone': журнал фіксує і зняття відмітки, інакше
--    fold не зміг би відтворити цикл toggle -> untoggle -> toggle.
-- 4. `day_anchor` допускає 'unknown' — синтетичні події майбутнього backfill-у
--    (стадія 2) не мають права вдавати, ніби знають доктрину, за якою клієнт
--    порахував ключ.
--
-- Hard Rule #4: міграція ЧИСТО additive — жодного ALTER / DROP над існуючими
-- таблицями. `.down.sql` написано, але прод на нього не покладається
-- (forward-only `pnpm db:migrate`).
--
-- Канон: docs/01-product/model/routine.md §3
-- Аудит: docs/90-work/audits/product-knowledge-routine.md § беклог #1

CREATE TABLE IF NOT EXISTS routine_completion_events (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  habit_id       TEXT NOT NULL,
  date_key       TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'done' CHECK (state IN ('done', 'undone')),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tz_offset_min  INTEGER,
  day_anchor     TEXT NOT NULL DEFAULT 'unknown',
  source         TEXT NOT NULL DEFAULT 'ui',
  device_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Гарячий запит майбутнього fold-у: «усі події однієї звички за день у
-- хронологічному порядку» — останній `occurred_at` виграє. Порядок колонок
-- дає ще й префіксні сканування (user_id) та (user_id, habit_id).
CREATE INDEX IF NOT EXISTS routine_completion_events_user_habit_date_idx
  ON routine_completion_events (user_id, habit_id, date_key, occurred_at);

-- Часовий зріз для майбутнього серверного derive / digest-снапшоту:
-- «усі події користувача за проміжок».
CREATE INDEX IF NOT EXISTS routine_completion_events_user_occurred_idx
  ON routine_completion_events (user_id, occurred_at);

COMMENT ON TABLE routine_completion_events IS
  'Append-only journal of habit completion toggles (state=done|undone). WRITE-ONLY as of stage 1 (W1-ROUTINE-APPEND): nothing reads it — streak/rate/heatmap/digest still derive from routine_entries/completions. Never UPDATE or DELETE a row here: the sync apply-path rejects op=update/delete with reason append_only_violation. id is TEXT (client-generated, deterministic) on purpose — see docs/90-work/tech-debt/backend.md section "Routine: PK-type". Each row carries both the client-declared date_key and the raw occurred_at/tz_offset_min/day_anchor so the time doctrine (Kyiv vs device-local) can be re-decided later. Canon: docs/01-product/model/routine.md section 3.';

COMMENT ON COLUMN routine_completion_events.date_key IS
  'YYYY-MM-DD as the CLIENT computed it at the moment of the toggle. Interpretation depends on day_anchor — do not assume Kyiv.';

COMMENT ON COLUMN routine_completion_events.day_anchor IS
  'How date_key was derived: device-local | kyiv | unknown. Backfilled rows use unknown.';

COMMENT ON COLUMN routine_completion_events.source IS
  'Origin of the event: ui | chat | bulk | backfill | seed.';
