# Playbook: Add SQL Migration

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** "Додати нове поле або таблицю в БД" / зміна PostgreSQL schema / новий індекс, constraint або rollout, що вимагає migration file.

## Owner surface

- Primary surface: `apps/server/src/migrations`
- Governing skill: `sergeant-data-and-migrations`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-data-and-migrations`.
- Звір hard rules #1, #3 і #4 в [AGENTS.md](../../AGENTS.md).
- Якщо schema change обслуговує новий API behavior, далі виконай [`add-api-endpoint.md`](./add-api-endpoint.md).

## Steps

### 1. Спроєктуй safe rollout

- Чітко відділи add/backfill/read-switch/drop stages.
- Для `DROP COLUMN`, `DROP TABLE` або destructive rewrite використовуй two-phase rollout.
- Визнач, які app surfaces залежать від нового поля чи таблиці.

### 2. Створи migration file

- Візьми наступний sequential номер `NNN_*.sql`.
- Не роби gaps і не перейменовуй уже випущені migration files.
- Для potentially destructive operations додай audit note або `ALLOW_DROP` escape hatch там, де це вимагає lint.

### 3. Онови Drizzle schema (обов'язково)

Якщо міграція додає або видаляє таблицю / колонку, що моделюється в Drizzle:

- Відкрий відповідний файл у `packages/db-schema/src/pg/`.
- Дзеркально відобрази зміну: нова колонка → новий Drizzle field; DROP COLUMN → видали field.
- Запусти `node scripts/check-schema-drift.mjs` локально — він повинен завершитись з кодом 0.
- Якщо Drizzle навмисно не моделює цю таблицю/колонку (аналітика, observability, etc.) — додай запис до `WHITELIST` в `scripts/check-schema-drift.mjs` з коментарем-причиною.

> **CI gate (PR-11):** крок «Drizzle schema ↔ SQL migration drift» в `ci.yml` провалить PR, якщо ця синхронізація пропущена.

### 4. Онови server/app code

- Додай нові поля в SQL queries, types і serializers.
- Якщо response shape змінюється, синхронізуй `packages/api-client`.
- Не завершуй роботу лише migration file'ом, якщо код ще не готовий читати нову схему.

### 4. Перевір local execution path

- Запусти локальну міграцію на чистій або актуальній БД.
- Переконайся, що код стартує після міграції без ручних правок.
- За потреби зафіксуй deploy order у PR.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm lint:migrations`
- [ ] `pnpm db:migrate`
- [ ] `node scripts/check-schema-drift.mjs` — виходить з кодом 0
- [ ] Sequential numbering без gaps
- [ ] Для destructive change описано two-phase rollout
- [ ] Drizzle schema (`packages/db-schema/src/pg/`) оновлена або додано запис у whitelist

## When not to use this playbook

- Потрібен лише data backfill script без schema change.
- Змінюється тільки API/client type без дотику до БД.

## Related playbooks and skills

- [add-api-endpoint.md](./add-api-endpoint.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-data-and-migrations`
- Skill: `sergeant-server-api`
