---
name: sergeant-module-billing
description: Use when the task touches billing — plans, quotas, limits, LiqPay payments, pricing, trial logic; UA: задача про billing/тарифи/квоти/оплату/LiqPay.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Billing — власник інфра-модуля

Інфра-модуль без продуктового канону: контекст і журнал рішень живуть прямо тут (рішення 6 спеки `docs/90-work/planning/specs/archive/agent-module-owners.md`). Роутинг двовимірний: технічні правила поверхні бере surface-скіл.

## Контекст

- Модуль тарифів і оплат: план користувача (`getUserPlan.ts`), ефективні ліміти (`effectiveLimits.ts`), платіжний провайдер LiqPay (`liqpay.ts`).
- Чинний прайсинг — v4: ₴199/міс, зворотній trial, уточнені ліміти Free/Pro ([ADR-0068](../../../docs/04-governance/adr/0068-pricing-v4-uah-reverse-trial.md)); архітектурна основа монетизації — ADR-0001.
- Денні квоти — атомарний SQL (`INSERT ... ON CONFLICT DO UPDATE WHERE`, [ADR-0022](../../../docs/04-governance/adr/0022-atomic-sql-quotas.md)); AI-квоти Free — [ADR-0085](../../../docs/04-governance/adr/0085-free-ai-quota-five-per-day.md).

## Мапа файлів

- Server: `apps/server/src/modules/billing/`.
- Web-клієнт: RQ-ключі `billingKeys` з `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2).

## Інваріанти модуля

- Гроші — копійки (minor units) як `number` (`AGENTS.md § Domain invariants`); `bigint` → `Number()` у серіалізаторах (Hard Rule #1).
- Квоти інкрементуються атомарно в SQL — жодних read-modify-write у застосунку (ADR-0022).
- Зміна цін/лімітів — це продуктове рішення founder-а (ADR-and-journal-first), не побічний ефект PR.

## Журнал рішень

| Дата       | Рішення                                                       | Джерело/ADR                                                                     |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-06-27 | Pricing v4 — ₴199/міс, зворотній trial, ліміти Free/Pro       | [ADR-0068](../../../docs/04-governance/adr/0068-pricing-v4-uah-reverse-trial.md) |
| 2026-04-27 | Денні квоти — атомарний SQL upsert, без app-level лічильників | [ADR-0022](../../../docs/04-governance/adr/0022-atomic-sql-quotas.md)           |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api` / `sergeant-data-and-migrations`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
