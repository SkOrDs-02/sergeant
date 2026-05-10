---
name: sergeant-server-api
description: Use when editing Sergeant server routes, serializers, modules, api-client types, React Query server hooks, or time-sensitive logic; also for middleware or env changes; UA: правиш роути/серіалізатори/RQ-хуки.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Server API у Sergeant

Робота на сервері в Sergeant — це робота з контрактом. API правильний лише тоді, коли серіалізатори, клієнтські типи, тести і time-правила йдуть разом.

## Що покриває

- `apps/server/src/modules/**`, `apps/server/src/routes/**`, `apps/server/src/http/**`
- `packages/api-client/**`
- web query-hook-и, що залежать від server-відповідей

## Жорсткі правила

- Coerce кожне `bigint`-поле у `number` всередині серіалізатора.
- Якщо змінюється форма відповіді — онови server-серіалізатор, `packages/api-client` і contract-тест в одному PR.
- Використовуй `Europe/Kyiv` day boundaries; не деривуй day-ключі raw UTC ISO-нарізкою.
- Better Auth user-id-и — непрозорі рядки.

## Розміщення

- Route-обвʼязка живе у `apps/server/src/routes/**`.
- Domain-логіка — у `apps/server/src/modules/<domain>/**`.
- Спільні wire-типи живуть у `packages/api-client/**`, а спільні схеми — під `packages/shared/**`.

## Очікування з тестування

- Server-модулі: Vitest + Testcontainers, коли важлива реальна поведінка Postgres.
- Зміни форми відповіді: inline-snapshot або еквівалентні contract-перевірки.
- Оновлення query-hook-ів: використовуй наявні web key-фабрики, ніколи — інлайн-масиви.

## Куди роутити далі

- auth/session/cookies → `better-auth-best-practices`
- SQL-схема або rollout-послідовність → `sergeant-data-and-migrations`
- інтеграція HubChat-tool-у → `sergeant-hubchat`

## Playbooks

- `docs/playbooks/add-api-endpoint.md` — handler + route + api-client + тести синхронно.
- `docs/playbooks/add-sql-migration.md` — коли endpoint потребує schema-змін.
- `docs/playbooks/release.md` — canonical release-playbook (секція web + API).
- Каталог: `docs/agents/agent-skills-catalog.md`.
