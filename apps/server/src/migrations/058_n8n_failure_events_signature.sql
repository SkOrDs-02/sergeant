-- Migration: n8n_failure_events alert dedup signature
-- Created: 2026-05-13
-- PR-15 (48-plan): WF-98 alert dedup cooldown 30 хв по (workflow_id, error_signature)
--
-- Додає generated column `error_signature = md5(left(error_message, 200))` +
-- партіальний індекс по `(workflow_id, error_signature, created_at)`, щоб
-- WF-98 alert-router міг дешево перевірити «чи вже алертили цей сігнатур
-- за останні 30 хв». Дешева dedup-перевірка зменшує alert-flap-storm.

ALTER TABLE n8n_failure_events
  ADD COLUMN IF NOT EXISTS error_signature TEXT
  GENERATED ALWAYS AS (md5(substring(error_message FROM 1 FOR 200))) STORED;

CREATE INDEX IF NOT EXISTS n8n_failure_events_signature_recent_idx
  ON n8n_failure_events (workflow_id, error_signature, created_at DESC);

COMMENT ON COLUMN n8n_failure_events.error_signature IS
  'MD5 of first 200 chars of error_message — alert-dedup key for WF-98 cooldown.';
