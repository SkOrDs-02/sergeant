-- Down migration: n8n_webhook_events replay tracking
-- PR-29 rollback. Removes replay-tracking columns.
--
-- Безпечно при rollback-у: колонки не reference-аться FK, не входять
-- в indexes / constraints. DROP-ить тільки те, що ALTER ADD у forward-у.

ALTER TABLE n8n_webhook_events DROP COLUMN IF EXISTS last_replayed_at;
ALTER TABLE n8n_webhook_events DROP COLUMN IF EXISTS replay_count;
