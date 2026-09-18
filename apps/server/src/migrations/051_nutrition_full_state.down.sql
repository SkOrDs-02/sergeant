-- Rollback for migration 051_nutrition_full_state.sql
-- (Stage 11 / PR #070n-schema in `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`).
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Each statement is `IF EXISTS`-guarded so the file stays
-- idempotent (rule #4 re-application invariant — the
-- `rollback-sanity` round-trip harness asserts this).

DROP TABLE IF EXISTS nutrition_shopping_list;
DROP TABLE IF EXISTS nutrition_water_log;
