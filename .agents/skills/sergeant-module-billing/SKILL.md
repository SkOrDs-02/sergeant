---
name: sergeant-module-billing
description: "Use when the task touches billing — plans, quotas, limits, LiqPay payments, pricing, trial logic; UA: задача про billing/тарифи/квоти/оплату/LiqPay."
lang: uk
lang-reason: "Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар."
---

# Billing — власник інфра-модуля

Інфра-модуль без продуктового канону: контекст і журнал рішень живуть прямо тут (рішення 6 [спеки agent-module-owners](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/90-work/planning/specs/archive/agent-module-owners.md), архів старого репо). Роутинг двовимірний: технічні правила поверхні бере surface-скіл.

## Контекст

- Модуль тарифів і оплат: план і стан доступу (`getUserPlan.ts`, `accessStateOf`: free / trial / pro / grace), знімок для `/api/billing/status` (`accessSnapshot.ts`), reverse trial (`reverseTrial.ts`), платіжний провайдер LiqPay (`liqpay.ts`).
- Що в якому плані — **лише** реєстр `packages/shared/src/billing/entitlements.ts` (`FEATURES`, `weeklyLimit`, `weekStartKyiv`). Сервер гейтить за ним (`requireFeature`, тижневі відра в `modules/chat/aiQuotaWeekly.ts`), web читає знімок `access` через `usePlan` / `useFeatureGate`, `/pricing` будується з нього. Нову Premium-фічу додають рядком у реєстр, а не константою в коді поверхні.
- Скасування й заміна рекурентки: віддалені виклики провайдерів живуть у листках `plataRemote.ts` / `liqpayRemote.ts` / `stripeRemote.ts` (успіх або `throw`, тіло відповіді не логуємо), заміну старої підписки новою робить `supersede.ts` (outbox): `findSupersededRecurrence` до upsert-а, `recordSupersededRecurrence` у тій самій транзакції (запис у `billing_pending_cancellation`), `settleSupersededRecurrence` ПІСЛЯ COMMIT (ніколи не кидає; невдачі добиває `SupersedeRetryPoller`). Скасування старої не відкочує активацію нової: оплачена підписка має активуватись, навіть якщо стара вже мертва. Термінальні події (Stripe `deleted`, LiqPay `unsubscribe`/`reversed`/`failure`) скоуплюй по id підписки, інакше подія замінених гасить нову. Гейт checkout-у – `checkoutGuard.ts`. Нову гілку активації завершуй цими трьома кроками; без цього друга рекурентка знову стане нескасовуваною.
- Новий бакет квоти потребує міграції, що розширює CHECK `ai_usage_daily_bucket_format`: інакше вставка падає, а `assertAiQuota` пропускає запит без ліміту. Звірку тримає `modules/chat/aiQuotaBucketCheck.test.ts`.
- Чинний прайсинг — v4: ₴199/міс, зворотній trial, уточнені ліміти Free/Pro ([ADR-0068](../../../docs/governance/adr/0068-pricing-v4-uah-reverse-trial.md)); архітектурна основа монетизації — ADR-0001.
- Денні квоти — атомарний SQL (`INSERT ... ON CONFLICT DO UPDATE WHERE`, [ADR-0022](../../../docs/governance/adr/0022-atomic-sql-quotas.md)); тижневі AI-квоти Free і реєстр доступу — [ADR-0100](../../../docs/governance/adr/0100-free-premium-weekly-quotas-registry.md) (заміщує ADR-0085); спека `docs/work/specs/access-tiers.md`.

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
| 2026-10-10 | Скасування однакове для всіх провайдерів: відмова monobank/LiqPay/Stripe = 502 `PROVIDER_CANCEL_FAILED`, `cancel_at_period_end` не ставиться; новий `provider_subscription_id` скидає прапорець; checkout 409 `ALREADY_SUBSCRIBED` / `CHECKOUT_PENDING`; `plata_subscription` 1:N; активація другої рекурентки ставить скасування попередньої в чергу в тій самій транзакції, виклик провайдера після коміту й не відкочує активацію (аудит data-20/21) | [access-tiers.md](../../../docs/work/specs/access-tiers.md), міграція 154 |
| 2026-09-28 | Free: 20 AI-дій, 3 фото, 5 сканів Фініка на ISO-тиждень; реєстр доступу; trial за прапорцем; grace 3 дні | [ADR-0100](../../../docs/governance/adr/0100-free-premium-weekly-quotas-registry.md) |
| 2026-06-27 | Pricing v4 — ₴199/міс, зворотній trial, ліміти Free/Pro       | [ADR-0068](../../../docs/governance/adr/0068-pricing-v4-uah-reverse-trial.md) |
| 2026-04-27 | Денні квоти — атомарний SQL upsert, без app-level лічильників | [ADR-0022](../../../docs/governance/adr/0022-atomic-sql-quotas.md)           |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api` / `sergeant-data-and-migrations`.
- Каталог: [docs/start/agents/agent-skills-catalog.md](../../../docs/start/agents/agent-skills-catalog.md).
