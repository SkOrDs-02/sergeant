---
name: sergeant-data-and-migrations
description: Use when changing Sergeant SQL, Postgres schema, query behavior, migration numbering, or Coolify pre-deploy data paths; also when adding indexes or fixing query perf; UA: правиш SQL, схему БД, міграції, rollout даних.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Дані і міграції в Sergeant

Sergeant використовує **два шляхи до БД поверх одного `pg` Pool** — raw parameterized `pg` (`db.ts`, більшість модулів) і Drizzle ORM (`drizzle.ts`, waitlist / auth-суміжні таблиці, типізовані читання) — плюс послідовні SQL-міграції як єдине джерело істини для схеми. Обидва шляхи легітимні; новий код тримається стилю сусідніх файлів модуля. Для аудиту це означає, що перевіряти треба **обидві** поверхні (те саме формулювання — у `sergeant-security-audit` і `sergeant-backend-architecture`).

Зміни в БД мають бути безпечними для Coolify pre-deploy (`pre_deployment_command = node dist-server/migrate.js`, ADR-0074) і для старої версії app-у, яка ще може коротко обслуговувати трафік.

## Що покриває

- `apps/server/src/migrations/**`
- `packages/db-schema/**` (Drizzle ORM схеми + migration runner, спільний з `apps/server`)
- SQL у серверних модулях
- дизайн запитів, індексація, порядок rollout-у, локальна верифікація БД

## Жорсткі правила

- Створюй міграції через `pnpm gen migration --name <description>` (plop-генератор проставляє номер і створює `.down.sql`-компаньйон). Якщо генератор недоступний — ручний порядок із [`add-sql-migration.md`](../../../docs/00-start/playbooks/add-sql-migration.md): знайди поточний максимум, +1, zero-pad. Обидва шляхи дають той самий результат; playbook — канон нумерації.
- Тримай нумерацію послідовною, без пропусків.
- **Ніколи не перейменовуй міграцію, яка вже є на `main`.** Раннер трекає застосовані міграції за іменем файлу, тож під новим іменем той самий SQL виконається в проді вдруге, а старий запис лишиться сиротою в `schema_migrations` (це вже сталося тричі). Колізію номерів на ребейзі розв'язують перенумеруванням свого, ще не змердженого файлу; дубль, що вже на `main`, лишають як є і вносять до `APPLIED_DUPLICATE_FILENAMES` у `scripts/lint-migrations.mjs`. Розбір: [Rule #4 § Перейменування вже застосованої міграції](../../../docs/04-governance/governance/rules/04-sql-migrations-sequential-two-phase.md).
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
- [docs/04-governance/adr/0074-hosting-hetzner-coolify.md](../../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md) — актуальний backend-хостинг (Hetzner + Coolify), pre-deploy міграції
