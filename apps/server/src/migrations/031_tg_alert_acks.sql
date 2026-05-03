-- 031: tg_alert_acks — accountability trail for Sergeant_alert_bot
-- broadcasts (P0..P3 alerts in the `Sergeant_ops` supergroup).
--
-- ADR-0040, Wave 3 §3.2. Closes pain P2 (alerts without accountability:
-- nobody knows who saw what when). Each n8n alert workflow now POSTs to
-- /api/internal/alerts/post BEFORE sendMessage; the inline-keyboard
-- callback (WF-104, deferred to follow-up PR) UPDATEs `ack_at` when a
-- founder/operator clicks one of [Read | Investigating | Muted]. WF-103
-- (cron, also follow-up PR) selects un-acked P0 rows older than 15 min
-- and DM-escalates via @OpenClaw_sergeant_bot.
--
-- Mutable per-row (not append-only — ADR-0040 §Considered Options):
--
--   * INSERT on alert posted (`posted_at` set, NULL ack/escalated).
--   * UPDATE on user click (`ack_at` set, idempotent via WHERE ack_at IS NULL).
--   * UPDATE on WF-103 escalation (`escalated_at` set, idempotent via
--      WHERE escalated_at IS NULL).
--
-- Idempotency: UNIQUE(alert_id) + INSERT … ON CONFLICT DO NOTHING in the
-- store layer means n8n retry storms do not duplicate rows nor re-bump
-- `posted_at` (which would break the TTA / escalation metric).

CREATE TABLE IF NOT EXISTS tg_alert_acks (
  id                 BIGSERIAL PRIMARY KEY,
  posted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Stable id for one alert event. Conventions:
  --   "<workflow_id>:<execution_id>"  for n8n workflows
  --   "<topic>:<sha256(message)>"     for ad-hoc posts
  -- UNIQUE so retries are idempotent (see store.recordAlertPost).
  alert_id           TEXT NOT NULL,

  -- One of 7 forum topic keys (incidents, revenue, growth, digests, meta,
  -- engineering, control_plane). Soft-validated route-side; not enum-d
  -- because new topics ship without a schema migration.
  topic              TEXT NOT NULL,

  -- Severity tier. CHECK because P0..P3 contract is fixed (ADR-0040 §1).
  severity           TEXT NOT NULL
    CHECK (severity IN ('P0','P1','P2','P3')),

  -- Free-form short summary surfaced by /alerts pending. Optional — n8n
  -- workflows that don't carry a summary (e.g. heartbeat-failure) leave
  -- it NULL; the topic + severity are enough for the operator.
  summary            TEXT,

  -- Set when an operator clicks one of the inline-keyboard buttons.
  -- Idempotent: store.recordAlertAck WHERE ack_at IS NULL ensures only
  -- the first click wins.
  ack_at             TIMESTAMPTZ,
  ack_by_tg_user_id  BIGINT,
  ack_action         TEXT
    CHECK (ack_action IN ('read','investigating','muted')),

  -- Set when WF-103 DM-pings the founder. Same idempotency pattern.
  escalated_at       TIMESTAMPTZ,

  -- Free-form (workflow_id, execution_id, raw payload digest, etc.).
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT tg_alert_acks_alert_id_unique UNIQUE (alert_id)
);

-- WF-103 escalation cron: "find un-acked P0/P1 older than 15 min not yet
-- escalated". Partial index keeps the working set tiny — once an alert
-- is acked or escalated, it falls out of the index.
CREATE INDEX IF NOT EXISTS tg_alert_acks_unacked_idx
  ON tg_alert_acks (posted_at DESC)
  WHERE ack_at IS NULL AND escalated_at IS NULL;

-- /alerts pending slash + topic-scoped queries.
CREATE INDEX IF NOT EXISTS tg_alert_acks_pending_idx
  ON tg_alert_acks (topic, posted_at DESC)
  WHERE ack_at IS NULL;

-- Generic listing (post-mortem queries: TTA distribution per severity).
CREATE INDEX IF NOT EXISTS tg_alert_acks_posted_idx
  ON tg_alert_acks (posted_at DESC);

COMMENT ON TABLE tg_alert_acks IS
  'Accountability trail for Sergeant_alert_bot broadcasts: one row per posted alert, mutable on ack/escalation. ADR-0040, Wave 3 §3.2.';

COMMENT ON COLUMN tg_alert_acks.alert_id IS
  'Stable id (n8n workflow:execution OR topic:sha256). UNIQUE — n8n retries are no-ops.';

COMMENT ON COLUMN tg_alert_acks.severity IS
  'P0|P1|P2|P3 tier. WF-103 escalation cron filters on severity = ''P0'' AND posted_at < NOW() - 15min AND ack_at IS NULL AND escalated_at IS NULL.';
