-- H9 ledger fix — relax `ai_usage_daily_bucket_format` to allow
-- `transcribe:<model>` buckets.
--
-- Context: migration 005 added the CHECK constraint
--   `bucket = 'default' OR bucket LIKE 'tool:_%'`
-- back when the only consumers of `ai_usage_daily` were Anthropic chat
-- (`default`) and per-tool counters (`tool:foo`). Migration 036 then
-- introduced a third bucket family `transcribe:<model>` for the H9 USD
-- cap on `/api/transcribe`, but did NOT relax the CHECK. As a result
-- every `recordTranscribeUsdSpend()` UPSERT raised
-- `ai_usage_daily_bucket_format` and was silently swallowed by the
-- module's fail-open catch (`transcribe_usd_cap_record_failed` warn).
-- Net effect: H9 cap was always counted against an empty ledger, and
-- the per-user-per-day USD cap effectively did not engage. Discovered
-- by `transcribe-usd-cap.e2e.test.ts` (initiative 0011 Phase 3 PR 3.3).
--
-- Fix shape: drop the over-narrow CHECK and re-add a permissive one
-- that explicitly allows the three bucket families we own. We do NOT
-- collapse to `bucket IS NOT NULL` — keeping shape validation prevents
-- an attacker / misbehaving caller from spraying garbage bucket names
-- to bloat the table.
--
-- Idempotent (`IF EXISTS` / `DO $$`) so re-runs in dev are no-ops.
-- Single phase: tightening the rule (re-add) is safe because all
-- existing rows already match the old subset (`default`, `tool:%`),
-- and the new rule is a strict superset.

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
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
      );
END $$;
