-- Rollback for 036_transcribe_usd_micros.sql.
--
-- DBA-runnable manual rollback: the runner in `apps/server/src/db.ts`
-- ignores `*.down.sql`. Drops the per-bucket USD ledger column. Code
-- that reads `usd_micros` (`apps/server/src/modules/transcribe/usdCap.ts`)
-- must be redeployed without H9 changes BEFORE running this — інакше
-- виклик SELECT з відсутньою колонкою кине 42703 і Whisper повністю
-- ляже до наступного релізу.

ALTER TABLE ai_usage_daily
  DROP COLUMN IF EXISTS usd_micros;
