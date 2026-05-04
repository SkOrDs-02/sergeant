-- Rollback for 037_rate_limit_buckets.sql (renamed from 035 to dedupe with
-- 035_nutrition_tables.sql; see 038_rename_035_rate_limit_buckets.sql).
--
-- DBA-runnable manual rollback: the runner in `apps/server/src/db.ts`
-- ignores `*.down.sql` files. Drops the bucket table; running this
-- after a release that used the Postgres rate-limit path will fall
-- the limiter back to in-memory immediately on the next request
-- (the application detects the missing relation via SQLSTATE 42P01).

DROP INDEX IF EXISTS rate_limit_buckets_started_at_idx;
DROP TABLE IF EXISTS rate_limit_buckets;
