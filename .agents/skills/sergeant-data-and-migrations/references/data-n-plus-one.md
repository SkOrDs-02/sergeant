---
title: Eliminate N+1 Query Loops
impact: HIGH
impactDescription: Issuing one query per item in a loop turns a single logical read into N round-trips. With raw pg it is easy to write accidentally and invisible until the collection grows.
tags: [postgres, n-plus-one, query-performance, pg, joins]
---

# Eliminate N+1 Query Loops

An N+1 happens when you fetch a list, then issue one extra query per element. Each query is a network round-trip plus planning overhead. Collapse it into a single set-based query.

## One query for the whole set

**Incorrect — a query per account in a JS loop:**

```typescript
const accounts = await pg.query(
  `SELECT id FROM accounts WHERE user_id = $1`, [userId],
);
for (const acc of accounts.rows) {
  // N extra round-trips
  const txns = await pg.query(
    `SELECT * FROM transactions WHERE account_id = $1`, [acc.id],
  );
}
```

**Correct — gather the ids, then one set query with `= ANY`:**

```typescript
const accounts = await pg.query(
  `SELECT id FROM accounts WHERE user_id = $1`, [userId],
);
const accountIds = accounts.rows.map((r) => r.id);

const txns = await pg.query(
  `SELECT * FROM transactions WHERE account_id = ANY($1::bigint[])`,
  [accountIds],
);
// Group in application code by account_id, or use a JOIN if you need a single shape.
```

## Sergeant-specific note

Sergeant uses raw `pg`, so there is no ORM eager-loading to save you — N+1s are introduced by hand in `for`/`await` loops. Prefer `= ANY($1::bigint[])` for id sets, or a `JOIN` when you need a flat result. Remember `noUncheckedIndexedAccess` is on: `accounts.rows[0]` is `T | undefined`, so guard the empty-list branch.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
