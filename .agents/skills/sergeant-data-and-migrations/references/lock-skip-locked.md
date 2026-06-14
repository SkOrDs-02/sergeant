---
title: FOR UPDATE SKIP LOCKED for Job Queues
impact: MEDIUM
impactDescription: Without row locking, two workers can pick the same job and process it twice. A naive FOR UPDATE serializes workers; SKIP LOCKED lets them pull disjoint jobs concurrently.
tags: [postgres, locking, concurrency, queue, skip-locked]
---

# FOR UPDATE SKIP LOCKED for Job Queues

When multiple workers poll the same table for work, you need each row claimed by exactly one worker. `SELECT … FOR UPDATE SKIP LOCKED` makes each worker grab rows no one else has locked, with no contention.

## Claim disjoint rows across concurrent workers

**Incorrect — select then update, with a race window:**

```sql
-- Worker A and Worker B can both read the same 'pending' row
-- before either updates it → the job runs twice.
SELECT id FROM sync_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1;
UPDATE sync_jobs SET status = 'running' WHERE id = $1;
```

**Correct — lock and skip already-locked rows atomically:**

```sql
UPDATE sync_jobs
SET status = 'running'
WHERE id = (
  SELECT id FROM sync_jobs
  WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id;
```

## Sergeant-specific note

Sync drain and push-delivery workers can run on more than one Railway instance (multi-instance fan-out). `SKIP LOCKED` is what keeps two instances from draining the same job. Back the predicate with a partial index `WHERE status = 'pending'` (see `query-partial-indexes.md`). Be deliberate about the SQLite-vs-Postgres partition on the client side — server-side queue claims belong in Postgres, not the local SQLite mirror.

> Adapted from [supabase/agent-skills](https://github.com/supabase/agent-skills) (MIT).
