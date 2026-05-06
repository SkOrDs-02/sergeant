-- Down migration for 049_ai_usage_daily_transcribe_bucket.sql.
--
-- Restores the migration-005 form of the CHECK. Note: this would FAIL
-- if the table contains any `transcribe:<model>` rows by the time the
-- down-migration runs, because those would violate the restored
-- constraint. That is by design — H9 ledger rows must be cleaned up
-- before reverting (`DELETE FROM ai_usage_daily WHERE bucket LIKE
-- 'transcribe:%';`) and the operator should make that decision
-- consciously.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_daily_bucket_format'
  ) THEN
    ALTER TABLE ai_usage_daily
      DROP CONSTRAINT ai_usage_daily_bucket_format;
  END IF;

  ALTER TABLE ai_usage_daily
    ADD CONSTRAINT ai_usage_daily_bucket_format
      CHECK (bucket = 'default' OR bucket LIKE 'tool:_%');
END $$;
