---
name: sergeant-sql-migrations
description: "SQL migration patterns for the Sergeant project. Use when creating, reviewing, or modifying database migrations in apps/server/src/migrations/. Covers sequential numbering, two-phase DROP, NULL-able columns, and Railway pre-deploy behavior."
---

# Sergeant SQL Migrations

Migrations live in `apps/server/src/migrations/` as `NNN_description.sql` files. Pre-deploy on Railway runs `pnpm db:migrate` before the new app version starts.

## Creating a Migration

Always use the generator:

```bash
pnpm gen migration --name <description>
```

This auto-numbers from the last file. Never create files manually — gaps in numbering break the migration runner.

## Rules (Hard Rule #4)

### Adding a Column

Single file. Make it `NULL`-able or `DEFAULT`-ed so old code keeps working during the deploy window.

```sql
-- NNN_add_merchant_category.sql
ALTER TABLE transactions ADD COLUMN merchant_category TEXT;
```

### Renaming or Removing a Column — Two Phases

Railway pre-deploy migrates BEFORE the new image starts. The old version briefly serves traffic. If you drop a column it still reads, the old version crashes.

**Phase 1** (deployed first — old code unaffected):

```sql
-- NNN_add_amount_minor.sql
ALTER TABLE transactions ADD COLUMN amount_minor BIGINT;
UPDATE transactions SET amount_minor = (amount * 100)::BIGINT;
```

Update code to write BOTH columns and read the new one. Deploy.

**Phase 2** (separate PR, deployed only after Phase 1 is live):

```sql
-- (N+M)_drop_old_amount.sql
ALTER TABLE transactions DROP COLUMN amount;
```

### Down Migrations

A `down.sql` companion (e.g. `008_mono_integration.down.sql`) is for local rollbacks only. Production never runs `down.sql`.

## Numbering

Files use pattern `NNN_description.sql`. Currently 001–021+. No gaps allowed. The generator handles this automatically.

## Build Pipeline

`apps/server/build.mjs` copies migration files to the dist bundle. If you change the dist layout, verify migrations still resolve at deploy time.

## Local Development

```bash
pnpm db:up        # Start Postgres via Docker
pnpm db:migrate   # Run all pending migrations
```

Local DB URL: `postgresql://hub:hub@localhost:5432/hub`

## Checklist

- [ ] Used `pnpm gen migration --name <desc>` (not manual file creation)
- [ ] Column additions are NULL-able or have DEFAULT
- [ ] Column removals use two-phase approach (separate PRs)
- [ ] No gaps in migration numbering
- [ ] Tested locally with `pnpm db:migrate`
- [ ] Updated `api-client` types if response shape changed (Hard Rule #3)

## Playbook

Full step-by-step: `docs/playbooks/add-sql-migration.md`
Pre-merge checklist: `docs/playbooks/pre-merge-migration-checklist.md`
