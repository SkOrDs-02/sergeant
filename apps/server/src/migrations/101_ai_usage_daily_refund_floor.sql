-- Migration: ai_usage_daily_refund_floor
-- Created: 2026-08-04
--
-- Дозволяє лічильнику AI-квоти опускатись до нуля при refund-і.
--
-- Передісторія (аудит 2026-08-04, знахідка 7): при фейлі upstream-виклику
-- Anthropic сервер повертає квоту атомарним декрементом
-- `SET request_count = GREATEST(0, request_count - cost)` (aiQuota.ts ::
-- refundConsumed). Але CHECK-констрейнт вимагав `request_count > 0` СТРОГО,
-- тож перший же refund, який опускав лічильник у нуль (типовий кейс: один
-- запит за день, і той упав), ловив 23514 і губився —
-- `ai_quota_refund_failed` у логах, квота користувача згорала на кожному
-- фейлі провайдера.
--
-- Нуль — легітимний стан «спожито й повернуто»: рядок лишається (в ньому
-- живуть token-акаунтинг і usd_micros), а `>= 0` зберігає захист від
-- відʼємних значень. Зміна лише семантики констрейнта, без DROP колонок —
-- двофазність (Hard Rule #4) не потрібна.

ALTER TABLE ai_usage_daily
  DROP CONSTRAINT IF EXISTS ai_usage_daily_request_count_check;

ALTER TABLE ai_usage_daily
  ADD CONSTRAINT ai_usage_daily_request_count_check CHECK (request_count >= 0);
