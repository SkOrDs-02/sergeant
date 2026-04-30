---
name: sergeant-postgres
description: "PostgreSQL best practices for the Sergeant project using the raw pg driver. Use when writing SQL queries, optimizing database performance, designing schemas, or troubleshooting Postgres issues. Replaces the generic Supabase skill with project-specific patterns."
---

# Sergeant PostgreSQL Patterns

Sergeant uses the raw `pg` (node-postgres) driver with a connection pool — not an ORM, not Supabase. All queries are hand-written SQL.

## Connection Setup

- **Local:** `postgresql://hub:hub@localhost:5432/hub` (via `pnpm db:up` Docker)
- **Production:** Railway-managed Postgres. `DATABASE_URL` env var.
- **Migrations:** `MIGRATE_DATABASE_URL` (public DB URL for pre-deploy step).

## Query Patterns

### Parameterized Queries (always)

```ts
// ❌ BAD — SQL injection
const result = await pool.query(`SELECT * FROM users WHERE id = '${userId}'`);

// ✅ GOOD — parameterized
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### Bigint Coercion (Hard Rule #1)

`pg` returns `bigint` as string. Always coerce in serializers:

```ts
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));
```

### Timestamps — Kyiv Timezone

```sql
-- ❌ BAD — UTC day boundary
SELECT DATE(created_at) AS day, COUNT(*) FROM transactions GROUP BY 1;

-- ✅ GOOD — Kyiv day boundary
SELECT DATE(created_at AT TIME ZONE 'Europe/Kyiv') AS day, COUNT(*)
FROM transactions
GROUP BY 1;
```

### Money in Minor Units

All monetary values stored as `BIGINT` in kopiykas (UAH × 100). Conversion to hryvnias happens only at the UI layer.

## Index Best Practices

- Add indexes for frequently filtered columns (WHERE, JOIN ON)
- Use partial indexes when queries filter on a constant condition:
  ```sql
  CREATE INDEX idx_active_users ON users (email) WHERE deleted_at IS NULL;
  ```
- Use `EXPLAIN ANALYZE` to verify index usage before shipping

## Migration Patterns

See the `sergeant-sql-migrations` skill for full details. Key points:
- Sequential `NNN_*.sql` numbering (use `pnpm gen migration`)
- Two-phase DROP for column removal
- NULL-able or DEFAULT for new columns

## Connection Pool

- Pool size is managed by `pg.Pool` defaults
- Railway Postgres has connection limits — do not open multiple pools
- Use `pool.query()` for single queries (auto-acquires and releases)
- Use `pool.connect()` + `client.release()` for transactions:

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO ...', [...]);
  await client.query('UPDATE ...', [...]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## Testing with Testcontainers

Server tests use Testcontainers for a real Postgres instance:

```ts
// apps/server tests spin up a real Postgres container
// No mocking of DB queries — tests run against actual Postgres
```

This catches real SQL errors, type mismatches, and migration issues that mocks would miss.

## Performance Checklist

- [ ] Parameterized queries (no string interpolation)
- [ ] Bigint coercion in serializers
- [ ] Kyiv timezone for day-bucketing
- [ ] Indexes for filtered/joined columns
- [ ] `EXPLAIN ANALYZE` for complex queries
- [ ] Connection pool — single instance, proper release
- [ ] Transactions for multi-statement writes
