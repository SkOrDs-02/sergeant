-- 066 down: drop ai_memory_ingest_failed DLQ.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo indexes (last_attempt, source, active_uniq) живуть на цій
-- таблиці, без зовнішніх FK.

DROP TABLE IF EXISTS ai_memory_ingest_failed CASCADE;
