---
title: Keyset Pagination over OFFSET
impact: MEDIUM-HIGH
impactDescription: OFFSET scans and discards every skipped row, so deep pages get linearly slower. Keyset (seek) pagination stays constant-time regardless of how deep the user pages.
tags: [postgres, pagination, keyset, query-performance, indexes]
---

# Keyset Pagination over OFFSET

`OFFSET n` makes Postgres read and throw away `n` rows before returning the page. Page 1 is instant; page 500 reads half a million rows. Keyset pagination seeks straight to the cursor instead.

## Seek by the last row's sort key

**Incorrect — OFFSET grows slower with every page:**

```sql
SELECT id, amount, created_at
FROM transactions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 50 OFFSET 10000;   -- reads 10050 rows to return 50
```

**Correct — carry the cursor and seek past it:**

```sql
SELECT id, amount, created_at
FROM transactions
WHERE user_id = $1
  AND (created_at, id) < ($2, $3)   -- last row of the previous page
ORDER BY created_at DESC, id DESC
LIMIT 50;                            -- constant cost at any depth
```

## Sergeant-specific note

Transaction and activity feeds are the deep-paging surfaces. Use a `(created_at, id)` tuple cursor so ties on `created_at` stay deterministic, backed by the `(user_id, created_at DESC)` composite index (see `query-composite-indexes.md`). When grouping a feed by day, bucket on **Europe/Kyiv** local date, not UTC — a UTC day boundary shifts the grouping and silently breaks streak logic.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
