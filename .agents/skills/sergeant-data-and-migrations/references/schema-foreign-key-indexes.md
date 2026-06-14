---
title: Index Every Foreign Key Column
impact: CRITICAL
impactDescription: Postgres indexes PRIMARY KEY and UNIQUE columns automatically, but never foreign-key columns. An unindexed FK turns every join and every parent-row DELETE into a sequential scan of the child table.
tags: [postgres, schema, indexes, foreign-keys, migrations]
---

# Index Every Foreign Key Column

Postgres auto-creates an index for `PRIMARY KEY` and `UNIQUE` constraints, but **not** for `REFERENCES` (foreign-key) columns. The planner then seq-scans the child table on every join, and — worse — every `DELETE`/`UPDATE` on the parent row re-checks the FK by scanning the whole child table.

## Add the index in the same migration as the FK

**Incorrect — FK with no supporting index:**

```sql
CREATE TABLE transactions (
  id          bigserial PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts (id),
  user_id     text   NOT NULL,
  amount      bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Joins on account_id and DELETEs on accounts both seq-scan transactions.
```

**Correct — index the FK column explicitly:**

```sql
CREATE TABLE transactions (
  id          bigserial PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts (id),
  user_id     text   NOT NULL,
  amount      bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_account_id_idx ON transactions (account_id);
```

## Backfilling an index on a large existing table

A plain `CREATE INDEX` takes a lock that blocks writes (and the FK check) for the whole build. On a table that is already large in production, use `CONCURRENTLY` so writes keep flowing:

```sql
CREATE INDEX CONCURRENTLY transactions_account_id_idx ON transactions (account_id);
-- Runs outside a transaction block; cannot be wrapped in BEGIN/COMMIT.
-- On failure it leaves an INVALID index — DROP it and retry.
```

For a brand-new table in the same migration, a plain `CREATE INDEX` is fine (the table is empty).

## Sergeant-specific note

Every per-user table carries a Better Auth `user_id` (opaque `text`, **not** a UUID) and most child tables carry an `account_id`. Both are foreign-key-shaped access paths — index them. When a migration adds a `REFERENCES` column, add the matching `CREATE INDEX` in the **same** sequential migration file (Hard Rule #4) so the FK never ships unindexed. Monetary columns like `amount` are `bigint` kopiykas — coerce to `number` in the serializer (Hard Rule #1); indexing is unaffected.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
