---
title: Find Slow Queries with pg_stat_statements
impact: MEDIUM
impactDescription: Optimizing by guesswork wastes effort on queries that are already fast. pg_stat_statements ranks real production queries by cumulative and mean time so you fix what actually hurts.
tags: [postgres, monitoring, pg-stat-statements, query-performance]
---

# Find Slow Queries with pg_stat_statements

`pg_stat_statements` aggregates execution stats per normalized query. Use it to find the queries worth optimizing instead of guessing.

## Rank by where the time actually goes

**Incorrect — pick a query to optimize by intuition:**

```text
"The transactions list feels slow, let me add some indexes there."
-- May already be index-served; the real cost is elsewhere.
```

**Correct — let the stats name the offenders:**

```sql
-- Highest cumulative time (frequent + slowish queries dominate load):
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Slowest per call (individually expensive queries):
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE calls > 50
ORDER BY mean_exec_time DESC
LIMIT 20;
```

## Sergeant-specific note

Production Postgres runs on Railway (`sergeant-db`). Sort by `total_exec_time` to find the cumulative load drivers (a fast query called millions of times often beats one slow report), and by `mean_exec_time` for individually heavy queries. Once a hot query is identified, confirm the fix locally with `EXPLAIN ANALYZE` (see `query-missing-indexes.md`) before shipping an index in a sequential migration.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
