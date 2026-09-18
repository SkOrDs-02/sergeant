-- Down migration: tg_alert_acks_escalation_tiers
-- Sprint 6 / alert escalation rollback. Прод НЕ покладається на down-міграцію
-- (Hard Rule #4) — цей файл для локальної ітерації.

DROP INDEX IF EXISTS tg_alert_acks_sentry_due_idx;
DROP INDEX IF EXISTS tg_alert_acks_repeat_due_idx;

ALTER TABLE tg_alert_acks
  DROP COLUMN IF EXISTS snoozed_until_at,
  DROP COLUMN IF EXISTS sentry_warned_at,
  DROP COLUMN IF EXISTS repeated_at;
