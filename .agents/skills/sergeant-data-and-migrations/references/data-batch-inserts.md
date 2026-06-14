---
title: Batch Inserts Instead of Row-by-Row
impact: MEDIUM-HIGH
impactDescription: Inserting rows one statement at a time multiplies round-trips and transaction overhead. A single multi-row INSERT is often an order of magnitude faster.
tags: [postgres, inserts, batch, query-performance, pg]
---

# Batch Inserts Instead of Row-by-Row

Each `INSERT` statement is a round-trip and a planning cycle. For bulk loads (imports, backfills), send one multi-row statement instead of a loop.

## Multi-row VALUES or unnest

**Incorrect — one INSERT per row in a loop:**

```typescript
for (const t of imported) {
  await pg.query(
    `INSERT INTO transactions (account_id, user_id, amount, created_at)
     VALUES ($1, $2, $3, $4)`,
    [t.accountId, t.userId, t.amount, t.createdAt],
  );
}
```

**Correct — a single statement with `unnest` for a clean parameter list:**

```typescript
await pg.query(
  `INSERT INTO transactions (account_id, user_id, amount, created_at)
   SELECT * FROM unnest(
     $1::bigint[], $2::text[], $3::bigint[], $4::timestamptz[]
   )`,
  [
    imported.map((t) => t.accountId),
    imported.map((t) => t.userId),
    imported.map((t) => t.amount),
    imported.map((t) => t.createdAt),
  ],
);
```

## Sergeant-specific note

Monobank statement imports arrive as batches — insert them in one `unnest` statement, not a per-transaction loop. `amount` is `bigint` kopiykas; keep it `bigint` end-to-end and coerce to `number` only at the serializer boundary (Hard Rule #1). For very large loads, chunk into batches of a few thousand rows to keep parameter arrays and memory bounded.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
