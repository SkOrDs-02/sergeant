-- Rollback for migration 052_fizruk_full_state.sql
-- (Stage 12 / PR #070f-schema in `docs/planning/storage-roadmap.md`).
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Each statement is `IF EXISTS`-guarded so the file stays
-- idempotent (rule #4 re-application invariant — the
-- `rollback-sanity` round-trip harness asserts this).

DROP TABLE IF EXISTS fizruk_workout_templates;
DROP TABLE IF EXISTS fizruk_wellbeing;
DROP TABLE IF EXISTS fizruk_programs;
DROP TABLE IF EXISTS fizruk_plan_templates;
DROP TABLE IF EXISTS fizruk_monthly_plan;
DROP TABLE IF EXISTS fizruk_daily_log;
