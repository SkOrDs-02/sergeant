-- Down migration: tg_alert_acks_dedup_signature
-- O4 / B.1 rollback. Прод НЕ покладається на down-міграцію (Hard Rule #4),
-- цей файл — для локальної ітерації.

DROP INDEX IF EXISTS tg_alert_acks_dedup_lookup_idx;

ALTER TABLE tg_alert_acks
  DROP COLUMN IF EXISTS telegram_message_id,
  DROP COLUMN IF EXISTS telegram_chat_id,
  DROP COLUMN IF EXISTS last_occurrence_at,
  DROP COLUMN IF EXISTS occurrence_count,
  DROP COLUMN IF EXISTS dedup_signature;
