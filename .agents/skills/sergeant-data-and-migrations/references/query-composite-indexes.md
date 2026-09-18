---
title: Composite Index Column Order
impact: HIGH
impactDescription: A multi-column index only helps if its column order matches the query's equality-then-range/sort shape. Wrong order means the index is ignored or only partially used.
tags: [postgres, indexes, composite, query-performance, ordering]
---

# Composite Index Column Order

A composite index follows the **leftmost-prefix** rule: it can serve queries that use its columns left-to-right. Put equality predicates first, then the range or sort column.

## Equality first, range/sort last

**Incorrect — two single-column indexes for a combined filter+sort:**

```sql
CREATE INDEX transactions_user_idx ON transactions (user_id);
CREATE INDEX transactions_created_idx ON transactions (created_at);

-- The planner can only use one; the ORDER BY still needs a sort step.
SELECT * FROM transactions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

**Correct — one composite index matching the query shape:**

```sql
CREATE INDEX transactions_user_created_idx
  ON transactions (user_id, created_at DESC);

-- Index Scan satisfies both the equality filter and the ordered LIMIT,
-- with no separate Sort node.
SELECT * FROM transactions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

## Sergeant-specific note

Feed-style reads ("this user's rows, newest first, paged") are everywhere in Sergeant — transaction lists, nutrition logs, hub messages. The canonical index is `(user_id, created_at DESC)`. Matching the `DESC` in the index lets a backward scan serve `ORDER BY created_at DESC` directly. Pair this with keyset pagination (see `data-pagination.md`) rather than `OFFSET`.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
