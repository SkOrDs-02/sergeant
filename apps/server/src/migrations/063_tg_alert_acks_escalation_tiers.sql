-- Migration: tg_alert_acks_escalation_tiers
-- Created: 2026-05-13
-- Sprint 6 / Alert-bot escalation policy: розширюємо 1-tier WF-103 DM-ескалацію
-- (15-min unacked → DM founder) у 3-tier ladder. Сидить поверх ADR-0038 W3 §3.2.
--
-- Tier 1 @ 15 хв — `escalated_at` (вже існує, WF-103, DM founder через
-- OpenClaw_sergeant_bot). Не торкаємо.
--
-- Tier 2 @ 60 хв — `repeated_at` (NEW, WF-105 cron). Якщо alert unacked
-- 60 хв і не re-pinged раніше, alert-bot робить repeat-broadcast у той самий
-- топік з prefix `⚠ REPEAT ${minutesSincePost}хв` + inline-keyboard з 3
-- кнопками: «✅ Прочитав / 🕐 Snooze 1h / 🕓 Snooze 4h».
--
-- Tier 3 @ 120 хв — `sentry_warned_at` (NEW, WF-106 cron). Якщо alert unacked
-- 120 хв і ще не sent у Sentry — server-side `Sentry.captureMessage(level=
-- "warning", tag=unacked-alert-escalation)`. На цей момент припускаємо, що
-- founder поза мережею і потрібен off-channel signal у Sentry дашборді/email.
--
-- Snooze (NEW, `snoozed_until_at`) — operator натиснув «Snooze 1h/4h» на T2
-- repeat-message. Усі наступні tier-cron'и пропускають row до
-- `snoozed_until_at`. Без CHECK relaxation: snooze — це окрема transition,
-- не ack-action, тож `ack_action` CHECK залишається `('read','investigating',
-- 'muted')`.
--
-- Кожна колонка nullable, без DEFAULT (Hard Rule #4-compatible):
-- старий writer без знання про escalation-tiers продовжує писати legacy
-- row-у, нові колонки NULL — те саме що "tier-cron'и не торкались".
--
-- Idempotency pattern на UPDATE — той самий, що для `escalated_at`:
--   UPDATE … SET <col> = NOW() WHERE alert_id=$1 AND <col> IS NULL
-- Race-vs-ack: WHERE-фільтри cron-у `WHERE ack_at IS NULL AND <col> IS NULL`
-- — якщо user clicked поки cron-у triggered, escalation скіпається на
-- наступному tick-у.

ALTER TABLE tg_alert_acks
  ADD COLUMN IF NOT EXISTS repeated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sentry_warned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until_at TIMESTAMPTZ;

-- WF-105 (T2) cron query: "find un-acked older than 60 хв, не repeated,
-- не snoozed". Partial index — як тільки alert acked/repeated/expired, він
-- випадає з робочого набору.
CREATE INDEX IF NOT EXISTS tg_alert_acks_repeat_due_idx
  ON tg_alert_acks (posted_at DESC)
  WHERE ack_at IS NULL AND repeated_at IS NULL;

-- WF-106 (T3) cron query: "find un-acked older than 120 хв, не sentry-warned,
-- не snoozed".
CREATE INDEX IF NOT EXISTS tg_alert_acks_sentry_due_idx
  ON tg_alert_acks (posted_at DESC)
  WHERE ack_at IS NULL AND sentry_warned_at IS NULL;

COMMENT ON COLUMN tg_alert_acks.repeated_at IS
  'Populated коли WF-105 repeat-ping cron вже зробив повторну броадкаст у топік. Idempotency: WHERE repeated_at IS NULL гарантує один repeat-ping на alert. Tier 2 @ 60min.';

COMMENT ON COLUMN tg_alert_acks.sentry_warned_at IS
  'Populated коли WF-106 sentry-warn cron вже капчурив Sentry warning. Idempotency: WHERE sentry_warned_at IS NULL гарантує один Sentry-event на alert. Tier 3 @ 120min.';

COMMENT ON COLUMN tg_alert_acks.snoozed_until_at IS
  'Operator натиснув "Snooze 1h/4h" на T2 repeat-message. Tier-crons фільтрують WHERE snoozed_until_at IS NULL OR snoozed_until_at < NOW(). Не плутати з muted ack-action (той зупиняє dedup-loop на 30 хв).';
