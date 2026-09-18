-- Migration: n8n_webhook_events replay tracking
-- Created: 2026-05-13
-- PR-29 (48-plan, docs/planning/pr-plan-2026-05.md): додає колонки для
-- relay-CLI (`scripts/replay-webhook.mjs`) + admin-API (`POST
-- /api/internal/webhook-events/replay`).
--
-- Контекст: PR-28 створив append-only `n8n_webhook_events` як audit-log
-- raw payload-ів, але не передбачав relay-операцію — re-POST збереженого
-- payload-у назад у n8n webhook-URL коли WF падає → fix → replay.
--
-- Колонки:
--   * `replay_count INT NOT NULL DEFAULT 0` — лічильник вдалих replay-ів
--     для конкретного event-у. CHECK >= 0 захищає від випадкового
--     decrement-у. Якщо WF продовжує падати після replay-у —
--     значення показує операторові «replay-loop-у не вийшло».
--   * `last_replayed_at TIMESTAMPTZ` — час останнього replay-у. `NULL`
--     до першого replay-у; перевизначається кожного успіху. Окрема
--     колонка (а не reuse `processed_at`), щоб не «забивати» success-
--     path-event-у. `processed_at` лишається indicator-ом первинної
--     обробки, `last_replayed_at` — окремий signal для diagnostics.
--
-- Additive-only: existing рядки отримують `replay_count = 0`,
-- `last_replayed_at IS NULL`. Indexes / constraints на існуючі шляхи —
-- no-op. Hard Rule #4: forward migration ідемпотентний (re-run у dev
-- — no-op через `IF NOT EXISTS`).
--
-- Чому не окрема таблиця `n8n_webhook_replay_log`:
--   * replay-операцій буде <1% від recorded-events (incident-only); JOIN
--     для diagnostics дорожчий за inline-колонки.
--   * `replay_count` як scalar-counter — final state-aggregation для
--     operator question «скільки разів я replay-ив це»; if you ever
--     потрібен per-replay timestamp-log, можна додати окрему таблицю
--     follow-up-міграцією без розблокування цієї.

ALTER TABLE n8n_webhook_events
  ADD COLUMN IF NOT EXISTS replay_count INT NOT NULL DEFAULT 0
    CHECK (replay_count >= 0);

ALTER TABLE n8n_webhook_events
  ADD COLUMN IF NOT EXISTS last_replayed_at TIMESTAMPTZ;

COMMENT ON COLUMN n8n_webhook_events.replay_count IS
  'PR-29: кількість успішних replay-ів цього event-у через replay-CLI/admin-API. 0 для нових insert-ів; інкрементується атомарно з `last_replayed_at`.';
COMMENT ON COLUMN n8n_webhook_events.last_replayed_at IS
  'PR-29: timestamp останнього успішного replay-у. NULL до першого replay-у. Окремо від `processed_at` — той indicator-ить первинну обробку n8n-ом.';
