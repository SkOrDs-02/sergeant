-- 026: routine_entries + routine_streaks — normalized target shape for the
-- Routine module (Stage 2 / PR #020 із `docs/planning/storage-roadmap.md`).
--
-- Контекст. До цього моменту весь стан Routine жив одним JSONB-блобом у
-- `module_data` з `module='routine'`: габіти, виконання, серії, теги — все
-- разом. Whole-blob LWW push/pull-сторона працює, але:
--
--   * не дозволяє per-row sync (multi-device колізії на одному блобі
--     перетирають свіжі правки опонента),
--   * стає bottleneck-ом коли виконань багато (push/pull тягне весь блоб
--     ~ десятки KB у синку),
--   * не має реляційних інваріантів (UNIQUE per-user, FK на user, soft-delete),
--     які треба для дешевих point-lookup-ів та аудиту.
--
-- Ця міграція додає **тільки таблиці**. Сервер ще нічого з них не читає —
-- вона write-only через backfill-скрипт `apps/server/src/scripts/migrate-routine-from-blob.ts`.
-- Stage 4 dual-write (PR #024) почне писати в обидві сторони, далі PR #025
-- зробить cut-over читань на нові таблиці.
--
-- **Не торкаємось `module_data.data->'routine'`** на цьому етапі — Stage 4
-- залежить від цього блобу як safety net на час dual-write фази.
--
-- Forward-only `pnpm db:migrate` руки сюди не підкладає DROP-ів, тому правило
-- #4 (two-phase DROP) не застосовується. `.down.sql` — тільки для local rollback.

-- routine_entries — індивідуальні рядки виконання габітів (з name-ом
-- денормалізовано, щоб видалена звичка не ламала історичний показ).
-- `completed_at` — TIMESTAMPTZ моменту виконання; NULL для ситуацій
-- де backfill зустрів габіт без жодного виконання, але хоче зберегти
-- факт існування. `deleted_at` — soft-delete tombstone (Stage 4 dual-write
-- очікує що клієнт може "повернути" виконання назад).
CREATE TABLE IF NOT EXISTS routine_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- Per-user list view: "покажи мені habit-completion історію за останні
-- N днів". Найгарячіший запит — DESC бо клієнт завжди рендерить
-- найсвіжіше зверху і приймає `LIMIT N`.
CREATE INDEX IF NOT EXISTS routine_entries_user_created_idx
  ON routine_entries (user_id, created_at DESC);

-- Soft-delete-aware list view: "покажи мені тільки активні (не tombstone-нуті)
-- виконання користувача". `WHERE deleted_at IS NULL` робить індекс компактним
-- — рядки помічені на видалення займають 0 місця в індексі.
CREATE INDEX IF NOT EXISTS routine_entries_user_active_idx
  ON routine_entries (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- routine_streaks — агреговані метрики стріків per-user. Один рядок на
-- юзера (PK = user_id). current_streak / longest_streak — звичайні
-- цілочисельні лічильники; last_completed_at дозволяє швидко зрозуміти
-- чи стрік ще «живий» без сканування `routine_entries`.
CREATE TABLE IF NOT EXISTS routine_streaks (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  current_streak     INTEGER NOT NULL DEFAULT 0,
  longest_streak     INTEGER NOT NULL DEFAULT 0,
  last_completed_at  TIMESTAMPTZ
);

COMMENT ON TABLE routine_entries IS
  'Normalized per-completion rows for the Routine module (Stage 2 / PR #020).';
COMMENT ON COLUMN routine_entries.name IS
  'Denormalized habit name at moment of completion — preserved if habit is later deleted.';
COMMENT ON COLUMN routine_entries.completed_at IS
  'Timestamp when habit was completed. NULL = entry exists but never completed.';
COMMENT ON COLUMN routine_entries.deleted_at IS
  'Soft-delete tombstone. NULL = active row. Filtered by routine_entries_user_active_idx.';
COMMENT ON TABLE routine_streaks IS
  'Per-user aggregated streak metrics (Stage 2 / PR #020). One row per user.';
