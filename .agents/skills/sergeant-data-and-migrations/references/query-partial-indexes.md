---
title: Partial Indexes for Hot Subsets
impact: MEDIUM-HIGH
impactDescription: When queries always target a small subset of a large table, a partial index covering only that subset is far smaller, faster to scan, and cheaper to maintain than a full index.
tags: [postgres, indexes, partial, query-performance]
---

# Partial Indexes for Hot Subsets

A partial index includes only rows matching a `WHERE` predicate. If reads always filter to the same small slice (pending jobs, unsynced rows, active records), index just that slice.

## Index only the rows you query

**Incorrect — full index on a column that is almost always the same value:**

```sql
CREATE INDEX sync_outbox_status_idx ON sync_outbox (status);

-- 99% of rows are status = 'done'; the index is mostly dead weight,
-- yet every INSERT/UPDATE still pays to maintain it.
SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at;
```

**Correct — partial index over the hot subset:**

```sql
CREATE INDEX sync_outbox_pending_idx
  ON sync_outbox (created_at)
  WHERE status = 'pending';

-- Tiny index: only pending rows. Fast to scan, cheap to maintain.
SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at;
```

## Sergeant-specific note

Queue-shaped tables (sync outbox, push delivery, pending imports) keep a small active head and a large processed tail. A partial index `WHERE status = 'pending'` stays small even as the processed tail grows unbounded. The predicate in the index must match the query predicate exactly for the planner to use it.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
