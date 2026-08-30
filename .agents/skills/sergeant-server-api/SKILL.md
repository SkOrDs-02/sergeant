---
name: sergeant-server-api
description: Use when editing Sergeant server routes, serializers, modules, api-client types, React Query server hooks, or time-sensitive logic; also for middleware or env changes; UA: правиш роути/серіалізатори/RQ-хуки.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Server API у Sergeant

Робота на сервері в Sergeant — це робота з контрактом. API правильний лише тоді, коли серіалізатори, клієнтські типи, тести і time-правила йдуть разом.

Задача в межах модуля (`apps/server/src/modules/*` — finyk, nutrition, AI-шар, sync, billing, integrations, push)? Спершу завантаж його `sergeant-module-*` скіл — контекст, журнал рішень і модульні інваріанти; цей скіл дає лише технічні правила поверхні (роутинг — `sergeant-start-here` § «Роутся одразу»).

## Що покриває

- `apps/server/src/modules/**`, `apps/server/src/routes/**`, `apps/server/src/http/**`
- `packages/api-client/**`
- web query-hook-и, що залежать від server-відповідей

## Жорсткі правила

- Coerce кожне `bigint`-поле у `number` всередині серіалізатора — канонічне формулювання і BAD/GOOD у [Rule #1](../../../docs/04-governance/governance/rules/01-db-types-coerce-bigint-to-number.md); тут не переказуй, лінкуй.
- Якщо змінюється форма відповіді — онови server-серіалізатор, `packages/api-client` і contract-тест в одному PR.
- **Межа доби — два режими (ADR-0078), не одне загальне правило.** Особисті сутності (відмітка звички, лог їжі, денний запис) мають **device-local** day-ключ: клієнт надсилає ключ, сервер йому довіряє і **не** передеривовує. `Europe/Kyiv` лишається для серверних звітів, фінансових періодів і **відображення** часу — там day-bucketing через `timezone('Europe/Kyiv', ts)`. Day-ключ входить у первинний ключ відмітки (`habitId:YYYY-MM-DD`), тому помилка режиму незворотна. Канонічні хелпери — [`packages/routine-domain/src/dateKeys.ts`](../../../packages/routine-domain/src/dateKeys.ts). Ніколи не деривуй ключ raw UTC ISO-нарізкою — це хибно в **обох** режимах. Деталі: [ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md).
- Better Auth user-id-и — непрозорі рядки.
- **Білінг (ADR-0068):** активна модель — Free + Pro ₴199/міс / ₴1 490/рік, reverse trial 7 днів (автоматичний Pro → downgrade). `plan: 'free' | 'pro'` тільки. Plus tier видалено зі scope. Enum живе у `apps/server/src/modules/billing/`. Деталі цін і лімітів — у [ADR-0068](../../../docs/04-governance/adr/0068-pricing-v4-uah-reverse-trial.md).
- **Логування (Hard Rule #21):** нові поверхні логування мають відповідати Pino redaction policy — PII не потрапляє в логи. Перевірка: [`docs/04-governance/security/logging-redaction-policy.md`](../../../docs/04-governance/security/logging-redaction-policy.md).

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
- інтеграція HubChat-tool-у → `sergeant-module-ai`

## Playbooks

- `docs/00-start/playbooks/add-api-endpoint.md` — handler + route + api-client + тести синхронно.
- `docs/00-start/playbooks/add-sql-migration.md` — коли endpoint потребує schema-змін.
- `docs/00-start/playbooks/release.md` — canonical release-playbook (секція web + API).
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
