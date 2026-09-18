-- Migration: tg_alert_acks_dedup_signature
-- Created: 2026-05-13
-- O4 / B.1 (sprint-roadmap §1.2, telegram-improvements-roadmap §4.2):
-- Alert dedup / occurrence-counter (10-min window).
--
-- Замість того щоб слати кожен дубль як окремий alert у топік, групуємо
-- однакові події (за `(topic, dedup_signature)`) у 10-хвилинне вікно і
-- editMessageText-ом оновлюємо лічильник у вже-надісланому повідомленні
-- ("🔁 5× за 10 хв: <error>"). Pain P5 closed.
--
-- Архітектурне рішення: розширюємо існуючу `tg_alert_acks` (а не вводимо
-- окрему `telegram_alert_groups`), бо:
--   1. Той самий row представляє одну "групу alert-ів" — UNIQUE(alert_id)
--      гарантує, що retry storm-и не плодять рядків.
--   2. ack-lifecycle (`ack_at`, `escalated_at`) і dedup-counter мусять
--      бачити одне джерело правди: ack по одному з 5 дублів автоматично
--      гасить всю групу.
--   3. Уникаємо дворівневих JOIN-ів у `/alerts/pending`.
--
-- Кожна колонка nullable / має DEFAULT — Hard Rule #4-compatible
-- (старий writer без знання про dedup продовжує писати UNIQUE alert_id =
-- group-of-1, що еквівалентно legacy-поведінці).

ALTER TABLE tg_alert_acks
  ADD COLUMN IF NOT EXISTS dedup_signature TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_occurrence_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;

-- Lookup-індекс для dedup-перевірки: "за останні 10 хв у топіку X
-- з тією ж сигнатурою — чи є вже row?". Partial-index по `dedup_signature
-- IS NOT NULL` тримає working set маленьким; legacy alerts (без signature)
-- з індексу випадають.
CREATE INDEX IF NOT EXISTS tg_alert_acks_dedup_lookup_idx
  ON tg_alert_acks (topic, dedup_signature, last_occurrence_at DESC)
  WHERE dedup_signature IS NOT NULL;

COMMENT ON COLUMN tg_alert_acks.dedup_signature IS
  'Stable hash для групування дублів (B.1). Зазвичай "<workflow_id>:<error_signature>". NULL → no-dedup (legacy behaviour, кожен alert окремо).';

COMMENT ON COLUMN tg_alert_acks.occurrence_count IS
  'Скільки разів alert із цією сигнатурою повторився у поточному 10-min window. Стартує з 1; інкрементується dedup-логікою.';

COMMENT ON COLUMN tg_alert_acks.last_occurrence_at IS
  'Час останнього occurrence-у. Driver dedup-вікна — якщо NOW() - last_occurrence_at < window (10 хв default), editMessageText замість нового send-у.';

COMMENT ON COLUMN tg_alert_acks.telegram_chat_id IS
  'chat_id Telegram, у який пішло перше повідомлення групи. NULL → не записано (legacy). Потрібно для editMessageText.';

COMMENT ON COLUMN tg_alert_acks.telegram_message_id IS
  'message_id у Telegram. NULL → не записано (legacy, або n8n не передав). Потрібно для editMessageText.';
