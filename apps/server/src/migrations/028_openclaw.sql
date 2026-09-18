-- 028: OpenClaw v0 — Telegram-only co-founder bot (ADR-0031).
--
-- Phase 1 storage:
--   1) Розширюємо `ai_memories.source` CHECK на 'cofounder' — окремий
--      namespace для founder DM з OpenClaw. Strict isolation: ніхто інший
--      не пише / не читає 'cofounder' source-row-и. Реалізація фільтра —
--      на app-рівні (`recall_memory` tool хардкодить `sources=['cofounder']`).
--   2) `openclaw_decisions` — operational decision log. Атомарно з
--      `record_decision` tool: INSERT тут + open PR з markdown файлом у
--      `docs/decisions/<YYYY-MM-DD>-<slug>.md`. Postgres — для query
--      ("що ми вирішували по тарифах за квартал?"); git — для audit.
--   3) `openclaw_invocations` — audit log усіх викликів bot-а. Кожен
--      DM-update + scheduled trigger пишеться сюди з повним tool-trace,
--      cost, duration, status. Без TTL у v0; manual prune якщо знадобиться.
--      Запис ЗАВЖДИ — навіть при `budget_exceeded` / `iteration_cap` /
--      allowlist-fail.

-- 1) Розширюємо source CHECK на 'cofounder'.
ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_source_check;

ALTER TABLE ai_memories
  ADD CONSTRAINT ai_memories_source_check
  CHECK (source IN (
    'chat',
    'finyk',
    'fizruk',
    'nutrition',
    'routine',
    'journal',
    'digest',
    'cofounder'
  ));

COMMENT ON CONSTRAINT ai_memories_source_check ON ai_memories IS
  'Доменний source. Розширено у міграції 028 на ''cofounder'' для OpenClaw v0 (ADR-0031). Strict isolation на app-рівні.';

-- 2) openclaw_decisions — decision log.
CREATE TABLE IF NOT EXISTS openclaw_decisions (
  id BIGSERIAL PRIMARY KEY,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Founder Better Auth user id; FK з ON DELETE CASCADE щоб decision-row-и
  -- не лишалися сиротами при видаленні user-а через GDPR-flow.
  founder_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- Slug-format заголовок ("subscription-tier-rename"). Унікальність не
  -- guaranteed: одне й те ж рішення може повторитися (тоді дві row-и з
  -- різним rationale-ом — це OK; immutable log).
  topic TEXT NOT NULL,
  -- Контекст, у якому рішення приймалося (snapshot reasoning).
  context TEXT NOT NULL,
  -- Саме рішення (одне речення).
  decision TEXT NOT NULL,
  -- Чому саме так (decision rationale).
  rationale TEXT NOT NULL,
  -- Розглянуті альтернативи (опціонально).
  alternatives TEXT,
  -- Reference на git PR з markdown файлом у `docs/decisions/`.
  -- NULL до того моменту, як OpenClaw встигне відкрити PR (async).
  git_pr_url TEXT,
  -- Reference на invocation, у якому рішення було записане.
  invocation_id BIGINT,
  -- Довільні структуровані метадані (модель, версія prompt-а, etc).
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS openclaw_decisions_decided_idx
  ON openclaw_decisions (decided_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_decisions_topic_idx
  ON openclaw_decisions (founder_user_id, topic, decided_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_decisions_pending_pr_idx
  ON openclaw_decisions (decided_at DESC)
  WHERE git_pr_url IS NULL;

COMMENT ON TABLE openclaw_decisions IS
  'OpenClaw decision log. Append-only; кожен запис парний з PR у docs/decisions/. ADR-0031 §4.';

-- 3) openclaw_invocations — audit log.
CREATE TABLE IF NOT EXISTS openclaw_invocations (
  id BIGSERIAL PRIMARY KEY,
  invoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Better Auth user id (внутрішній, для join-у з ai_memories).
  founder_user_id TEXT NOT NULL,
  -- Telegram numeric user id. NOT NULL щоб явно бачити, хто DM-нув.
  founder_tg_user_id BIGINT NOT NULL,
  -- Тригер виклику.
  trigger TEXT NOT NULL
    CHECK (trigger IN ('dm', 'morning_ritual', 'weekly_review', 'monthly_okr')),
  -- Сирий user-message (або scheduler-prompt для ritual-trigger-ів).
  user_message TEXT NOT NULL,
  -- Фінальна відповідь (NULL якщо викликало fail-closed до фінального
  -- AI-турну).
  assistant_response TEXT,
  -- Список tool-call-ів у цьому invoke-і. Формат:
  -- [{ "tool": "recall_memory", "input": {...}, "output_chars": 320,
  --    "status": "ok" }]
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Сумарна вартість Anthropic-token-ів (USD).
  cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
  -- Duration від першого AI-call-у до фінального response-у (мс).
  duration_ms INTEGER NOT NULL DEFAULT 0,
  -- Кількість Plan→Act→Reflect ітерацій (1 = simple Q&A без tool-call-у).
  iterations INTEGER NOT NULL DEFAULT 0,
  -- Фінальний status. budget_exceeded / iteration_cap / allowlist_fail —
  -- всі fail-closed; success / error — звичайні результати.
  status TEXT NOT NULL
    CHECK (status IN (
      'success',
      'error',
      'budget_exceeded',
      'iteration_cap',
      'allowlist_fail',
      'dm_only_violation'
    ))
    DEFAULT 'success',
  -- Деталі помилки (для error / *_fail / *_exceeded станів).
  error_message TEXT,
  -- Tone-mode, обраний heuristic-селектором ('diplomatic' | 'direct').
  tone_mode TEXT,
  -- Довільні структуровані метадані.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS openclaw_invocations_invoked_idx
  ON openclaw_invocations (invoked_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_invocations_founder_idx
  ON openclaw_invocations (founder_user_id, invoked_at DESC);

-- Partial для денного cost-budget query — '> 0 cost' rows-only щоб не
-- сканувати allowlist-fail / dm_only_violation rows (вони NUMERIC(10,4) = 0).
CREATE INDEX IF NOT EXISTS openclaw_invocations_cost_today_idx
  ON openclaw_invocations (invoked_at DESC, cost_usd)
  WHERE cost_usd > 0;

CREATE INDEX IF NOT EXISTS openclaw_invocations_status_idx
  ON openclaw_invocations (status, invoked_at DESC)
  WHERE status <> 'success';

-- Backref: openclaw_decisions.invocation_id → openclaw_invocations.id
-- (FK тільки тут, бо invocations створюється раніше за decisions у одному
-- transaction-і; зворотній порядок викликав би FK-violation).
ALTER TABLE openclaw_decisions
  ADD CONSTRAINT openclaw_decisions_invocation_fkey
  FOREIGN KEY (invocation_id) REFERENCES openclaw_invocations(id) ON DELETE SET NULL;

COMMENT ON TABLE openclaw_invocations IS
  'OpenClaw audit log. Кожен виклик бота — окремий рядок з повним tool-trace. ADR-0031 §8.';
