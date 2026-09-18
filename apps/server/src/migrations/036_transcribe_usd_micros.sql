-- H9 — per-user-per-day USD cap on `/api/transcribe`.
--
-- Адаптивне розширення існуючого `ai_usage_daily`-лічильника замість
-- окремої таблиці. Чому:
--   1) PK уже `(subject_key, usage_day, bucket)` — bucket-у `transcribe`
--      з власним лічильником USD-центів достатньо, щоб не змішувати
--      з default/tool: bucket-ами Anthropic-чату.
--   2) UPSERT-семантика `assertAiQuota`/`consumeQuota` перевикористана —
--      менше нового koду, менше нових bug-surface-ів.
--   3) Прибирання даних після інциденту лишається тривіальним
--      (`DELETE FROM ai_usage_daily WHERE bucket LIKE 'transcribe:%'`).
--
-- USD зберігаємо у *micros* (1 USD = 1_000_000 micros): integer-only
-- арифметика, нуль floating-point дрейфу при сумуванні ~100k записів,
-- BIGINT покриває multi-billion-USD ledger без переповнення. CHECK
-- забороняє від'ємні значення (refund-флоу для transcribe немає —
-- сплата прив'язана до фактичного byte-розміру upload-у, не до
-- успіху Whisper-у).
ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (usd_micros >= 0);

COMMENT ON COLUMN ai_usage_daily.usd_micros IS
  'H9: cumulative USD-micros (1 USD = 1_000_000) spent on Groq Whisper transcription for the (subject_key, usage_day, bucket=transcribe:<model>) tuple. See apps/server/src/modules/transcribe/usdCap.ts.';
