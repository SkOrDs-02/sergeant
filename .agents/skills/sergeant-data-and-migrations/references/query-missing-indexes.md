---
title: Detect and Fix Missing Indexes
impact: HIGH
impactDescription: A WHERE/ORDER BY on an unindexed column forces a sequential scan that grows linearly with table size — fine in dev with 100 rows, a production incident at 10M.
tags: [postgres, indexes, query-performance, explain]
---

# Detect and Fix Missing Indexes

A filter or sort on a column with no index makes the planner read every row (`Seq Scan`). The cost is invisible locally and catastrophic in production.

## Confirm with EXPLAIN ANALYZE before adding an index

**Incorrect — assume the query is fine because it returns fast in dev:**

```sql
SELECT id, amount, created_at
FROM transactions
WHERE user_id = $1;        -- Seq Scan on a table that only grows
```

**Correct — measure, then index the access path:**

```sql
EXPLAIN ANALYZE
SELECT id, amount, created_at
FROM transactions
WHERE user_id = $1;        -- look for "Seq Scan on transactions"

CREATE INDEX transactions_user_id_idx ON transactions (user_id);
-- Re-run EXPLAIN ANALYZE: the node should become "Index Scan".
```

## Sergeant-specific note

`user_id` is the most-filtered column across the schema (every per-user read scopes by it). Treat an unindexed `user_id` predicate as a bug. Run `pnpm db:up` for a local Postgres and `EXPLAIN ANALYZE` the real query before and after — don't guess. Add the index in a sequential migration (`pnpm gen migration`), never ad-hoc against prod.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
