# Playbook: Pre-Merge Migration Checklist

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-06-26.
> **Status:** Active

**Trigger:** PR містить файли в `apps/server/src/migrations/` (новий `NNN_*.sql` або зміна існуючого `*.down.sql`).

> Призначення цього playbook-у — це **обов'язковий чек-лист**, який має бути скопійований у PR description і відмічений до merge. Закриває аудитний пункт `PR-5.C` (`docs/audits/2026-04-26-sergeant-audit-devin.md`).

> **Чому окремий чек-лист?** `add-sql-migration.md` описує авторинг (як написати міграцію). Цей playbook — про **review-фазу**: рев'юер та автор разом перевіряють, що міграція безпечно піде у production без 5-ти типових мисталок (DROP без grace, gaps у номерах, відсутній `down.sql`, забутий bigint-coercion, drift у `api-client`).

---

## Checklist (скопіюй у PR description)

````markdown
## Pre-merge migration checklist (docs/playbooks/pre-merge-migration-checklist.md)

### A. Numbering & file structure

- [ ] **Sequential**: новий файл — `(N+1)_<desc>.sql` де N = max(існуючі номери). Без пропусків.
- [ ] **No duplicate prefix**: жодного існуючого `NNN_*.sql` з тим самим номером.
- [ ] **Naming**: `NNN_<short_snake_case_desc>.sql` (≤ 5 слів у `desc`).
- [ ] **Companion `down.sql`** (опціонально, але рекомендовано): `NNN_<desc>.down.sql` для локального rollback. Production ніколи його не виконує.

### B. AGENTS.md rule #4 — DROP-safety (two-phase)

- [ ] Якщо міграція містить `DROP COLUMN` / `DROP TABLE` / `DROP CONSTRAINT`: **колонка/таблиця/constraint вже не використовуються у коді** з попереднього merged PR (NOT у цьому самому PR).
- [ ] Якщо потрібен legitimate DROP — додано escape-hatch коментар:
  ```sql
  -- ALLOW_DROP: column unused since PR #NNN (due: YYYY-MM-DD)
  ```
````

з `due:` ≈ 30 днів вперед.

- [ ] Якщо це **rename** колонки/таблиці: розбито на 2 PR-и:
  1. Phase 1 (цей PR або попередній): `ADD COLUMN new_name` + код пише в обидві колонки + читає `new_name`.
  2. Phase 2 (наступний PR, **після production-deploy phase 1**): `DROP COLUMN old_name`.

### C. AGENTS.md rule #1 — bigint coercion

- [ ] Якщо міграція додає колонку з типом `BIGINT` / `BIGSERIAL` / `numeric` (cents): serializer у `apps/server/src/modules/<module>/*.ts` коерсить через `Number(...)` перед поверненням клієнту.
- [ ] Snapshot тест у `apps/server/src/modules/<module>/*.test.ts` оновлено: bigint поле фігурує як `number`, не `"string"`.

### D. AGENTS.md rule #3 — API contract sync

- [ ] Якщо response shape міняється: типи в `packages/api-client/src/endpoints/*.ts` оновлено в **тому самому PR**.
- [ ] Inline-snapshot або вiтест-asserт у `apps/server/src/modules/<module>/*.test.ts` показує новий shape.

### E. Idempotency & defaults

- [ ] `IF NOT EXISTS` / `IF EXISTS` де можливо (`CREATE TABLE`, `CREATE INDEX`, `DROP COLUMN`).
- [ ] Нові колонки — `NULL`-able або з `DEFAULT` (старий код, що ще не знає про колонку, не має падати на INSERT).
- [ ] `TIMESTAMPTZ` замість `TIMESTAMP` (з timezone).
- [ ] Foreign keys мають `ON DELETE`-стратегію (`CASCADE` / `SET NULL` / `RESTRICT`) — НЕ default `NO ACTION`.

### F. Performance & locks

- [ ] Якщо `ALTER TABLE` на великій таблиці (`finyk_transactions`, `fizruk_sets`): додано `CREATE INDEX CONCURRENTLY` (не `CREATE INDEX`) або міграція виконається < 1 секунди.
- [ ] Якщо `UPDATE` на існуючих рядках: батчinг (`LIMIT` / `OFFSET`) для таблиць > 100k рядків. Інакше — Railway pre-deploy таймаут.
- [ ] Жодного `LOCK TABLE` без явної необхідності (блокує всі read/write на час міграції).

### G. RLS (Row-Level Security)

- [ ] Якщо нова таблиця — додано RLS-policy у тій самій міграції або в окремому follow-up з посиланням на цю.
- [ ] Якщо є `user_id` колонка, але RLS-policy відсутня — `-- TODO(rls): policy in NNN_+1_*.sql` коментар І issue з лейблом `security`.

### H. Local verification (автор)

- [ ] `pnpm db:migrate` локально пройшов (CONNECTION_STRING на локальний Postgres).
- [ ] Якщо є `down.sql`: `psql -f NNN_*.down.sql && psql -f NNN_*.sql` пройшов (sanity).
- [ ] `pnpm --filter @sergeant/server exec vitest run` — green (включно з testcontainers, які реально запускають міграції на тимчасовому Postgres).

### I. CI verification (автор)

- [ ] `pnpm lint:migrations` — green локально.
- [ ] У PR-checks `migration-lint` job — green.
- [ ] `Test coverage (vitest)` — green (rollback-sanity test #918 ловить broken `down.sql`).

### J. Rollout-readiness

- [ ] Pre-deploy команда Railway: автоматичний `pnpm db:migrate` перед стартом нового релізу — готовий до цієї міграції (немає кращого моменту для break-y migrations).
- [ ] Якщо це **breaking** для running код-у (наприклад, видалення колонки, на яку ще пише чинна версія): двофазний deploy (див. розділ B).
- [ ] У `docs/tech-debt/backend.md` оновлено секцію "Database & migrations" якщо міграція змінює invariant-и (індекси, foreign keys, нові таблиці-домени).

```

---

## Reviewer's responsibility

Рев'юер PR-у відповідає **разом із автором** за:

1. **Перевірити кожен пункт A-J у PR description** — checkboxes мають бути відмічені автором, а рев'юер їх валідує (не просто візьме на віру).
2. **Запитати про phase-2 PR**, якщо є TODO-rename / TODO-drop. Без явного follow-up issue — request changes.
3. **Заблокувати merge**, якщо `migration-lint` CI fail, навіть з escape-hatch — спочатку перевірити, що `due:` дата у майбутньому, і tracking issue існує.

---

## Common mistakes (не повторюй)

| Помилка                                           | Симптом у production                                          | Як уникнути                                       |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `DROP COLUMN amount` у тому самому PR, що `ADD COLUMN amount_minor` | На pre-deploy stage 1 (стара версія сервера) Read падає 500 | Two-phase deploy (B-секція)                       |
| `BIGINT` без `Number()` coercion у serializer     | Клієнт бачить `"42"` замість `42`, арифметика мовчки ламається | Snapshot test (C-секція)                           |
| `CREATE INDEX` без `CONCURRENTLY` на таблиці > 1M рядків | Railway pre-deploy timeout (>10 хв) → rollback           | `CONCURRENTLY` + перевірка таблиці > 100k          |
| Відсутній `RLS`-policy на новій user-scoped таблиці | Один user через model-hallucination бачить чужі дані         | G-секція + automated test (planned, not yet implemented) |
| Numbering `008` після `008_*` (duplicate)         | `pnpm db:migrate` падає з `migration already applied`         | A-секція + `migration-lint` CI                    |
| Drift `api-client` types після server-shape зміни | TypeScript у `apps/web` компилиться, але runtime — `undefined` | D-секція + inline-snapshot                         |

---

## See also

- [`add-sql-migration.md`](add-sql-migration.md) — як написати нову міграцію (authoring side).
- [`AGENTS.md`](../../AGENTS.md) — hard rules #1 (bigint), #3 (API contract), #4 (migrations).
- [`scripts/lint-migrations.mjs`](../../scripts/lint-migrations.mjs) — CI-script для `migration-lint` job-у.
- [`apps/server/src/migrations/__tests__/rollback-sanity.test.ts`](../../apps/server/src/migrations/__tests__/rollback-sanity.test.ts) — auto-test, що `down.sql` принаймні виконується (PR #918).
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — Database & migrations review.
```
