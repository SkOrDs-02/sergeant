# @sergeant/db-schema

> **Last touched:** 2026-09-01 by @claude. **Next review:** 2026-12-01.
> **Status:** Active

Drizzle-схеми обох баз і раннер міграцій. Єдине місце, де описано форму таблиць — сервер (`pg`) і клієнтський локальний стор (`sqlite`) читають її звідси.

## Що всередині

- **`src/pg/`** — Postgres-схеми (Drizzle `pgTable`) для `apps/server`.
- **`src/sqlite/`** — SQLite-схеми (Drizzle `sqliteTable`) для локального стору `apps/web` / `apps/mobile`.
- **`src/shared/`** — константи, спільні для обох сторін (напр. курсор `SYNC_OP_CURSOR_PULL_SINCE`). Окремий вхід `@sergeant/db-schema/shared`, щоб не тягнути `drizzle-orm` у eager-бандл web (див. `AGENTS.md § Performance budgets`).
- **`src/migrate/`** — раннер SQL-міграцій, який запускає `apps/server` (`node dist-server/migrate.js` у pre-deploy Coolify). Самі файли міграцій живуть у `apps/server/src/migrations/`.

## Інваріанти

- **Hard Rule #4** — міграції послідовні, без прогалин; `DROP` двофазний. Гейт: `pnpm lint:migrations`, дриф схеми: `node scripts/check-schema-drift.mjs`.
- **Hard Rule #1** — `bigint` → `number` у серіалізаторах, не в схемі.
- Специалист-скіл: `sergeant-data-and-migrations`; sub-tree нотатки — [`CLAUDE.md`](./CLAUDE.md).

## Тести

```bash
pnpm --filter @sergeant/db-schema test
pnpm --filter @sergeant/db-schema typecheck
```
