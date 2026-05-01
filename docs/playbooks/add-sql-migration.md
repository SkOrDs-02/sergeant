# Playbook: Add SQL Migration

> **Last validated:** 2026-05-01 by @devin-ai. **Next review:** 2026-07-30.
> **Status:** Active

**Trigger:** "Додати нове поле / таблицю в БД" / зміна схеми PostgreSQL / нова колонка для існуючої таблиці.

---

## Steps

### 1. Визначити поточний номер міграції

```bash
ls apps/server/src/migrations/
# Наприклад: 001_noop.sql, 002_ai_usage_daily.sql, ..., 021_governance_audit.sql
# Наступний файл — 022_*.sql
```

Номер має бути **sequential, без gaps** (AGENTS.md rule #4).

### 2. Створити файл міграції

```bash
touch apps/server/src/migrations/NNN_<short_desc>.sql
```

Правила для SQL:

- Використовувати `IF NOT EXISTS` / `IF EXISTS` де можливо (ідемпотентність).
- `TIMESTAMPTZ` замість `TIMESTAMP` (з timezone).
- Foreign keys з `ON DELETE CASCADE` якщо логічно.
- Індекси для полів які будуть в `WHERE` / `JOIN`.

### 3. Оновити серверний код

- Оновити типи в `apps/server/src/modules/<module>/types.ts`.
- Оновити serializer — **обов'язково** коерсити bigint→number (AGENTS.md rule #1, [#708](https://github.com/Skords-01/Sergeant/issues/708)).
- Оновити handler якщо новий endpoint або змінений response shape.

### 4. Оновити `packages/api-client`

Якщо змінюється response shape — оновити типи в `packages/api-client/src/endpoints/*` (AGENTS.md rule #3).

### 5. Тести

```bash
# Запустити тести сервера
pnpm --filter @sergeant/server exec vitest run

# Snapshot-тест на serializer (якщо є)
pnpm --filter @sergeant/server exec vitest run apps/server/src/modules/<module>/
```

Перевірити:

- Bigint поля повертаються як `number`, не як `string`.
- Нові поля присутні у response.
- Міграція виконується без помилок.

### 6. Перевірити локально

```bash
# Запустити міграцію локально
pnpm db:migrate
```

### 7. Створити PR

- Branch: `devin/<unix-ts>-feat-<desc>`
- Commit: `feat(server): add migration NNN — <what changed>`
- PR description: що змінилось в схемі, які endpoint-и зачеплено.

---

## Verification

- [ ] Номер міграції sequential, без gaps
- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] Тести сервера — green
- [ ] Bigint→number coercion у serializer (rule #1)
- [ ] Типи в `packages/api-client` оновлені (rule #3)
- [ ] `pnpm db:migrate` працює локально
- [ ] `pnpm lint:migrations` — green (CI: `migration-lint` job)

## CI: Migration lint (`migration-lint` job)

The `migration-lint` CI job (runs on every PR) enforces AGENTS.md rule #4 automatically:

1. **No unguarded `DROP COLUMN` / `DROP TABLE`** in new or changed `*.sql` files (`.down.sql` is exempt).
2. **Sequential numbering** — no gaps, no duplicates across all migration files.

If the job fails because your migration contains a legitimate DROP:

- Ensure the column/table is already unused in code (deployed in a **previous, merged** PR).
- Add an escape-hatch comment anywhere in the migration file:
  ```sql
  -- ALLOW_DROP: column unused since PR #NNN (due: YYYY-MM-DD)
  ```
  The `due:` date is an audit reminder — choose a date ~30 days out.

Run locally:

```bash
pnpm lint:migrations
# or directly:
BASE_REF=main node scripts/lint-migrations.mjs
```

Script: [`scripts/lint-migrations.mjs`](../../scripts/lint-migrations.mjs) | Tests: `node --test scripts/__tests__/lint-migrations.test.mjs`

## Notes

- Pre-deploy job на Railway автоматично запускає `pnpm db:migrate`.
- Міграції копіюються через `apps/server/build.mjs` (виправлено в [#704](https://github.com/Skords-01/Sergeant/issues/704)).
- `MIGRATE_DATABASE_URL` env потрібен для міграцій (= public DB URL).
- **Ніколи** не видаляй колонки в тій самій міграції що додає нові — це окремий крок після деплою нового коду.

## See also

- [pre-merge-migration-checklist.md](pre-merge-migration-checklist.md) — **обов'язковий чек-лист** для рев'ю PR-у з міграцією перед merge.
- [AGENTS.md](../../AGENTS.md) — rule #1 (bigint), rule #3 (API contract), rule #4 (migrations)
- [monobank-roadmap.md](../integrations/monobank-roadmap.md) — приклад великої міграції (Monobank 008)
- [backend-tech-debt.md](../tech-debt/backend.md) — §Database & migrations review
