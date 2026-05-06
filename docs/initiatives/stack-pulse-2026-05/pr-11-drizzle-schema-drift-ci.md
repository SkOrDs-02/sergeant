# PR-11: Drizzle schema ↔ SQL drift CI gate

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Closed — drift CI gate landed (`scripts/check-schema-drift.mjs` + `packages/db-schema/src/__tests__/drift.test.ts`); ROOT-path fix in [#2089](https://github.com/Skords-01/Sergeant/pull/2089)

|              |                                               |
| ------------ | --------------------------------------------- |
| **Severity** | High (H5)                                     |
| **Owner**    | TBD                                           |
| **Effort**   | 1–2 дні                                       |
| **Risk**     | Low (CI-only, нічого runtime не міняє)        |
| **Touches**  | CI workflow, `scripts/check-schema-drift.mjs` |

## Контекст

Sergeant має дві паралельні truth-sources про схему БД:

1. `apps/server/src/migrations/*.sql` — 34 SQL файли (sequential 001..034).
2. `packages/db-schema/src/pg/*.ts` — Drizzle schema typed.

Ці два потоки **не синхронізуються автоматично**. Якщо хтось додасть колонку у new SQL міграцію без оновлення Drizzle schema — типи не відображають реальність. Запит `db.select().from(users).fields({ favoriteColor })` буде compile-clean, але runtime крашне з `column "favoriteColor" does not exist`.

Поточний підхід: автор вручну дотримується. Working — поки 1 person-team. Не масштабується.

## Scope

### 1. CI script `scripts/check-schema-drift.mjs`

- Розгорнути ephemeral Postgres (Testcontainers або docker-compose service).
- Виконати всі `.sql` файли в order.
- Запустити `drizzle-kit introspect` → отримати introspected `schema.ts`.
- Diff проти `packages/db-schema/src/pg/*.ts` → fail PR якщо різниця.
- Whitelist `db-schema/internal-only/*.ts` для cases де Drizzle schema свідомо ширша/вужча.

### 2. Tests на schema drift

- `packages/db-schema/__tests__/drift.test.ts` — runs introspection + diff during regular `pnpm test`.

### 3. Documentation

- `docs/playbooks/add-sql-migration.md` оновити: explicitly note «після SQL — оновити `db-schema/`».

## Out of scope

- Перейти на Drizzle migrations engine (втратимо `down.sql` + advisory-lock — це суттєво).

## Acceptance criteria (DoD)

- [ ] `scripts/check-schema-drift.mjs` виконується у `ci.yml` як required check.
- [ ] При додаванні колонки тільки в SQL → CI red.
- [ ] При додаванні колонки тільки в Drizzle → CI red.
- [ ] При синхронному додаванні → CI green.
- [ ] Whitelist mechanism documented.

## Тести

- `packages/db-schema/__tests__/drift.test.ts` — three scenarios (sync, sql-only, drizzle-only).
- CI smoke на test-PR що навмисне ламає schema → перевірити що CI red.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                           | Mitigation                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `drizzle-kit introspect` має різну repr формат | Use canonical-format diff (alphabetize columns, strip whitespace) |
| Testcontainers slow → CI час додасть           | Cache image; running only on PR-shopa-changing-DB (path-trigger)  |

## Touchpoints (file:line)

- `apps/server/src/migrations/` — 34 SQL files
- `packages/db-schema/src/pg/` — Drizzle schema
- `scripts/check-schema-drift.mjs` — новий
- `.github/workflows/ci.yml` — додати step
- `docs/playbooks/add-sql-migration.md` — оновити

## Refs

- [Drizzle Kit introspect docs](https://orm.drizzle.team/kit-docs/commands)
- ADR (якщо є) на migration strategy
