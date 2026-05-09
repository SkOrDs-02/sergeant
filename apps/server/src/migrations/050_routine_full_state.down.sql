-- Rollback for migration 050_routine_full_state.sql
-- (Stage 10 / PR #070r-schema in `docs/planning/storage-roadmap.md`).
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Order: indexes first, then tables. Each statement is
-- `IF EXISTS`-guarded so the file stays idempotent (rule #4
-- re-application invariant — the `rollback-sanity` round-trip
-- harness asserts this).

DROP INDEX IF EXISTS routine_habits_user_active_idx;
DROP INDEX IF EXISTS routine_tags_user_active_idx;
DROP INDEX IF EXISTS routine_categories_user_active_idx;
DROP INDEX IF EXISTS routine_completion_notes_user_active_idx;

DROP TABLE IF EXISTS routine_completion_notes;
DROP TABLE IF EXISTS routine_habit_order;
DROP TABLE IF EXISTS routine_pushups;
DROP TABLE IF EXISTS routine_prefs;
DROP TABLE IF EXISTS routine_categories;
DROP TABLE IF EXISTS routine_tags;
DROP TABLE IF EXISTS routine_habits;
