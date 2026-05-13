-- 063 down: drop ai_memory_backfill_state.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- Drop CASCADE because both indexes (started_at, active_uniq) are owned
-- by this table and no external FK references it.

DROP TABLE IF EXISTS ai_memory_backfill_state CASCADE;
