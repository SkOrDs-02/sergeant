-- Migration: n8n_webhook_events
-- Created: 2026-05-13
-- PR-28 (48-plan, docs/planning/pr-plan-2026-05.md): webhook replay infrastructure.
--
-- Append-only audit-log для зовнішніх webhook-доставок, які заходять у n8n
-- workflows WF-01 / WF-02 / WF-06 / WF-15. Раніше якщо n8n process / containers
-- падали між webhook ingest і реальною business-обробкою — повідомлення тупо
-- зникало (provider considers it delivered, ми не маємо raw payload-у щоб
-- replay-нути). Ця таблиця живе ПЕРЕД будь-якою business-логікою: webhook
-- entry-handler insert-ить рядок одразу, далі робить свою справу і
-- updates `processed_at`/`error`. PR-29 build-ить replay-CLI поверх цього.
--
-- Дизайн:
--   * `id BIGSERIAL` — sequence для cursor-based replay у chronological order.
--   * `workflow_id TEXT` — короткий handle ('01-billing-pipeline',
--     '06-mono-webhook-enrichment'), а не повне n8n displayName, щоб ID
--     не зміщувався, коли redactor-и в n8n змінять label.
--   * `source TEXT` — provider-handle ('stripe', 'mono', 'railway'); підмножина
--     `webhook_events.source` (з 011_webhook_events.sql).
--   * `payload JSONB` — повний body, як він прийшов. JSONB бо нам треба
--     `WHERE payload ->> 'event_type' = …` для diagnostics.
--   * `headers JSONB` — лише safe-headers (request-id, signature-id);
--     pino-redact policy enforced у server-helper, не на DB-рівні.
--   * `received_at` — server-clock-time, не provider timestamp (той у `payload`).
--   * `processed_at NULL` + `error NULL` — два mutually-exclusive стани
--     після обробки: success ⇒ `processed_at IS NOT NULL AND error IS NULL`;
--     failure ⇒ `processed_at IS NULL AND error IS NOT NULL`.
--     Pending ⇒ обидва NULL.
--
-- Retention: WEBHOOK_EVENTS_RETENTION_DAYS (default 30). In-process poller
-- (analogous to ReminderPoller) DELETE-ить рядки старше за threshold. PR-29
-- replay-CLI читає тільки `received_at > now() - retention`.

CREATE TABLE n8n_webhook_events (
  id           BIGSERIAL    PRIMARY KEY,
  workflow_id  TEXT         NOT NULL,
  source       TEXT         NOT NULL,
  payload      JSONB        NOT NULL,
  headers      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  received_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error        TEXT
);

-- Replay lookup: most-recent події per-workflow ('заостанні 24h по WF-06').
CREATE INDEX n8n_webhook_events_workflow_received_at_idx
  ON n8n_webhook_events (workflow_id, received_at DESC);

-- Pending-queue lookup: «що зависло» (processed_at IS NULL) — partial index
-- щоб не платити за processed-події.
CREATE INDEX n8n_webhook_events_pending_idx
  ON n8n_webhook_events (received_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE n8n_webhook_events IS
  'PR-28: append-only replay log для webhook-доставок у n8n WF-01/02/06/15. Insert ДО business-логіки; processed_at/error update після. Retention via WEBHOOK_EVENTS_RETENTION_DAYS.';
COMMENT ON COLUMN n8n_webhook_events.workflow_id IS
  'Короткий handle n8n workflow-у (01-billing-pipeline, 06-mono-webhook-enrichment).';
COMMENT ON COLUMN n8n_webhook_events.source IS
  'Provider handle (stripe, mono, railway); підмножина webhook_events.source.';
COMMENT ON COLUMN n8n_webhook_events.payload IS
  'Повний raw webhook body — Hard Rule #21 redact-policy у server-helper.';
COMMENT ON COLUMN n8n_webhook_events.headers IS
  'Safe headers (request-id, signature-id). Authorization / cookie / x-api-key — redacted у server-helper.';
COMMENT ON COLUMN n8n_webhook_events.processed_at IS
  'Set після успішної обробки. NULL + error IS NULL ⇒ pending.';
