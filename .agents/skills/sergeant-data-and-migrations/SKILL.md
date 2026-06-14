---
name: sergeant-data-and-migrations
description: Use when changing Sergeant SQL, Postgres schema, query behavior, migration numbering, or Railway pre-deploy data paths; also when adding indexes or fixing query perf; UA: правиш SQL, схему БД, міграції, rollout даних.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Дані і міграції в Sergeant

Sergeant використовує raw `pg` плюс послідовні SQL-міграції. Зміни в БД мають бути безпечними для Railway pre-deploy і для старої версії app-у, яка ще може коротко обслуговувати трафік.

## Що покриває

- `apps/server/src/migrations/**`
- `packages/db-schema/**` (Drizzle ORM схеми + migration runner, спільний з `apps/server`)
- SQL у серверних модулях
- дизайн запитів, індексація, порядок rollout-у, локальна верифікація БД

## Жорсткі правила

- Створюй міграції через `pnpm gen migration --name <description>`.
- Тримай нумерацію послідовною, без пропусків.
- Додавай колонки як `NULL`-able або з `DEFAULT`, якщо не запланований жорсткіший rollout.
- Для DROP або rename — двофазно: спершу додай/backfill/пиши в обидві колонки, видаляй пізніше окремим деплоєм.
- Прод НІКОЛИ не покладається на `down.sql`.

## Postgres-правила

- Параметризуй запити.
- Coerce `bigint` у серіалізаторах після виконання запиту.
- Використовуй Kyiv-local day bucketing при репортингу по даті.

## Performance, indexing, locking — `references/`

Для query/index/lock-питань читай детальні reference-файли (формат `agentskills.io`: `impact:` + Incorrect/Correct SQL + Sergeant-нотатка):

- **Indexing.** [`references/schema-foreign-key-indexes.md`](references/schema-foreign-key-indexes.md) (Postgres не індексує FK автоматично), [`references/query-missing-indexes.md`](references/query-missing-indexes.md), [`references/query-composite-indexes.md`](references/query-composite-indexes.md) (порядок колонок), [`references/query-partial-indexes.md`](references/query-partial-indexes.md).
- **Query/data shape.** [`references/data-n-plus-one.md`](references/data-n-plus-one.md), [`references/data-batch-inserts.md`](references/data-batch-inserts.md), [`references/data-pagination.md`](references/data-pagination.md) (keyset, не OFFSET).
- **Locking / monitoring.** [`references/lock-skip-locked.md`](references/lock-skip-locked.md) (job queue), [`references/monitor-pg-stat-statements.md`](references/monitor-pg-stat-statements.md).

## Верифікація

- `pnpm db:up` для локального Postgres, якщо потрібно.
- `pnpm db:migrate` після додавання або правки migration-файлів.
- Перевір контракт API на drift через `sergeant-server-api`.

## Корисні доки

- [docs/00-start/playbooks/add-sql-migration.md](../../../docs/00-start/playbooks/add-sql-migration.md)
- [docs/00-start/playbooks/pre-merge-migration-checklist.md](../../../docs/00-start/playbooks/pre-merge-migration-checklist.md)
- [docs/02-engineering/integrations/railway-vercel.md](../../../docs/02-engineering/integrations/railway-vercel.md)
