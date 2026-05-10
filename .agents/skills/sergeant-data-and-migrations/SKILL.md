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

## Верифікація

- `pnpm db:up` для локального Postgres, якщо потрібно.
- `pnpm db:migrate` після додавання або правки migration-файлів.
- Перевір контракт API на drift через `sergeant-server-api`.

## Корисні доки

- [docs/playbooks/add-sql-migration.md](../../../docs/playbooks/add-sql-migration.md)
- [docs/playbooks/pre-merge-migration-checklist.md](../../../docs/playbooks/pre-merge-migration-checklist.md)
- [docs/integrations/railway-vercel.md](../../../docs/integrations/railway-vercel.md)
