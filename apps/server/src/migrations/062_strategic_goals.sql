-- Migration: strategic_goals
-- Created: 2026-05-13
-- PR-34 (docs/planning/pr-plan-2026-05.md): Strategic mode skeleton —
-- per-persona weekly planning datalayer.
--
-- Контекст: OpenClaw зараз tactical (reactive — відповідає на event).
-- Strategic mode — proactive: щотижня kick-off planning conversation,
-- що формує weekly goals per persona (finyk / fizruk / nutrition / routine),
-- tracks them, reminds. PR-34 — skeleton (тільки datalayer + minimal trigger,
-- без full conversation). Full conversation flow — окремий PR.
--
-- Дизайн:
--   * `id BIGSERIAL` — sequence; Hard Rule #1 coerce-иться у `number` у helper.
--   * `persona TEXT` — 'finyk' | 'fizruk' | 'nutrition' | 'routine'. Той самий
--     enum, що у `ai_memories.source` (migration 025) — лишаємо `TEXT` без
--     CHECK-у, бо persona-каталог еволюціонує і ми не хочемо ALTER-ити
--     міграцію кожного разу, коли додаємо нову persona. Helper-validation
--     у `apps/server/src/lib/strategicGoals.ts` тримає invariant runtime-ом.
--   * `founder_user_id TEXT` — Better Auth opaque string ID. Domain invariant
--     (docs/architecture/domain-invariants.md) — НЕ UUID.
--   * `week_start DATE` — понеділок ISO-тижня у Kyiv local (YYYY-MM-DD).
--     DATE а не TIMESTAMPTZ, бо weekly cron може створити запис у 09:00 Kyiv
--     понеділка, а ми хочемо порівнювати з UI-обраним тижнем, без TZ-noise.
--   * `goal_text TEXT NOT NULL` — вільнотекстова мета; helper кепить до
--     `MAX_GOAL_TEXT_BYTES` (2 KB) перед INSERT-ом.
--   * `status TEXT` з CHECK constraint — обмежений 4-ма станами лайфциклу:
--     active   → щойно створена, ще у виконанні;
--     achieved → мета досягнута (manual marker або auto-trigger у пізніх PR);
--     abandoned → юзер відмовився (плани змінилися);
--     carried_over → не закрили цього тижня → автоматично перенесена WF-26-ом
--       у наступний week_start (PR-34 ще НЕ робить carry-over автоматично;
--       це enum-готовність для PR-35+).
--   * `created_at` + `updated_at` — обидва TIMESTAMPTZ DEFAULT now() для
--     audit-trail; `updated_at` оновлюється trigger-ом нижче.

CREATE TABLE strategic_goals (
  id              BIGSERIAL    PRIMARY KEY,
  persona         TEXT         NOT NULL,
  founder_user_id TEXT         NOT NULL,
  week_start      DATE         NOT NULL,
  goal_text       TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'achieved', 'abandoned', 'carried_over')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Per-persona-week lookup: typical query — "що у мене у `finyk` на цей тиждень?"
-- Composite index match-ить `WHERE persona = $1 AND week_start = $2` (а також
-- `WHERE persona = $1 AND week_start BETWEEN …` для PR-35+ history view).
CREATE INDEX strategic_goals_persona_week_idx
  ON strategic_goals (persona, week_start);

-- Per-founder lookup: для UI "усі мої goals" (cross-persona).
-- Окремий index, бо для founder з 4-ма personas × N week-ів cardinality
-- розрахункова — composite index по persona недостатньо selective.
CREATE INDEX strategic_goals_founder_week_idx
  ON strategic_goals (founder_user_id, week_start DESC);

-- Trigger функція — оновлення `updated_at` при будь-якому UPDATE-і.
-- Не використовуємо global IF NOT EXISTS на функції, бо PostgreSQL ≥14
-- підтримує CREATE OR REPLACE для функцій — це idempotent на re-up.
CREATE OR REPLACE FUNCTION strategic_goals_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strategic_goals_updated_at_trigger
  BEFORE UPDATE ON strategic_goals
  FOR EACH ROW
  EXECUTE FUNCTION strategic_goals_set_updated_at();

COMMENT ON TABLE strategic_goals IS
  'PR-34: per-persona weekly goals (strategic mode skeleton). Helper apps/server/src/lib/strategicGoals.ts; WF-26 weekly cron POST /api/internal/strategic/weekly-checkin.';
COMMENT ON COLUMN strategic_goals.persona IS
  'finyk | fizruk | nutrition | routine — те саме множинне catalog-у ai_memories.source.';
COMMENT ON COLUMN strategic_goals.founder_user_id IS
  'Better Auth opaque string (domain invariant: НЕ UUID).';
COMMENT ON COLUMN strategic_goals.week_start IS
  'Понеділок ISO-тижня у Kyiv local (YYYY-MM-DD). DATE щоб уникнути TZ-noise при cross-week comparison.';
COMMENT ON COLUMN strategic_goals.status IS
  'active | achieved | abandoned | carried_over (auto-carry-over — PR-35+).';
