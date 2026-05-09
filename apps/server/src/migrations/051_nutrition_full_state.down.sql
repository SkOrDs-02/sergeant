-- Rollback for migration 051_nutrition_full_state.sql
-- (Stage 11 / PR #070n-schema in `docs/planning/storage-roadmap.md`).
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Each statement is `IF EXISTS`-guarded so the file stays
-- idempotent (rule #4 re-application invariant — the
-- `rollback-sanity` round-trip harness asserts this).

DROP TABLE IF EXISTS nutrition_shopping_list;
DROP TABLE IF EXISTS nutrition_water_log;
