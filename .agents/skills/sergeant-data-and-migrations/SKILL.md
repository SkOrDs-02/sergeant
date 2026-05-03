---
name: sergeant-data-and-migrations
description: Use when changing Sergeant SQL, Postgres schema, query behavior, migration numbering, database rollout safety, or Railway pre-deploy data paths in apps/server/src/migrations and related server modules.
---

# Sergeant Data and Migrations

Sergeant uses raw `pg` plus sequential SQL migrations. Database changes must be safe for Railway pre-deploys and for the old app version that may still serve traffic briefly.

## Covers

- `apps/server/src/migrations/**`
- `packages/db-schema/**` (Drizzle ORM schemas + migration runner shared with `apps/server`)
- SQL in server modules
- query design, indexing, rollout order, local DB verification

## Hard Rules

- Create migrations with `pnpm gen migration --name <description>`.
- Keep numbering sequential with no gaps.
- Add columns as `NULL`-able or `DEFAULT`-ed unless a stricter rollout is already staged.
- Use two-phase DROP or rename: add/backfill/write-both first, remove later in a separate deploy.
- Production never relies on `down.sql`.

## Postgres Rules

- Parameterize queries.
- Coerce `bigint` in serializers after query execution.
- Use Kyiv-local day bucketing when reporting by date.

## Verify

- `pnpm db:up` for local Postgres if needed.
- `pnpm db:migrate` after adding or editing migration files.
- Re-check any API contract drift with `sergeant-server-api`.

## Useful Docs

- [docs/playbooks/add-sql-migration.md](../../../docs/playbooks/add-sql-migration.md)
- [docs/playbooks/pre-merge-migration-checklist.md](../../../docs/playbooks/pre-merge-migration-checklist.md)
- [docs/integrations/railway-vercel.md](../../../docs/integrations/railway-vercel.md)
