---
description: Create a new Drizzle migration with sequential numbering
argument-hint: "<migration-name>"
---

Create a new database migration file.

1. List existing migrations: `Get-ChildItem db-schema/migrations -Filter "*.sql" | Sort-Object Name | Select-Object -Last 3 Name`
2. Determine next sequential number (pad to 4 digits).
3. Create `db-schema/migrations/NNNN_<migration-name>.sql` with `-- migration` header.
4. Run `pnpm db:migrate` to verify it applies cleanly.
5. If migration has DROP operations, warn about two-phase requirement (deprecate now, drop in next migration — Hard Rule #4).

Use `$ARGUMENTS` for the migration name.
