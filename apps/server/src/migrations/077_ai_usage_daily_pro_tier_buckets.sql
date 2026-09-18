-- Pro tiered model degradation — allow `premium` and `standard` buckets.
--
-- Context: migration 005 added `ai_usage_daily_bucket_format` and 049
-- relaxed it to `default | tool:_% | transcribe:_%`. The Pro tiering
-- feature (premium -> standard -> floor model cascade for paying users)
-- adds two exact-name buckets that count a Pro user's daily premium and
-- standard AI calls separately, so `resolveProTier()` can pick the model
-- tier. Both are exact strings (like `default`), not prefixes -- there is
-- one premium counter and one standard counter per (subject, day).
--
-- Fix shape mirrors 049: drop the over-narrow CHECK and re-add a
-- permissive superset listing every bucket family we own. Shape
-- validation is kept (not `bucket IS NOT NULL`) so a misbehaving caller
-- cannot spray garbage bucket names to bloat the table.
--
-- Idempotent (`IF EXISTS` / `DO $$`) so dev re-runs are no-ops. Single
-- phase: widening the rule is safe because all existing rows already
-- match the old subset and the new rule is a strict superset.

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
      CHECK (
        bucket = 'default'
        OR bucket = 'premium'
        OR bucket = 'standard'
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
      );
END $$;
