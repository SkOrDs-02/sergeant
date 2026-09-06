# ADR-0001: Архітектура монетизації

- **Status:** Accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 by Codex against the codebase graph. **Next review:** 2026-12-20.
- **Supersedes:** —
- **Related:** [ADR-0022](./0022-atomic-sql-quotas.md), [ADR-0051](./0051-pricing-v3-single-tier.md), [ADR-0068](./0068-pricing-v4-uah-reverse-trial.md), [ADR-0016](./0016-user-deletion-and-pii-handling.md).

## Контекст

Монетизація потребує одного джерела entitlement, а не перевірок оплати, розкиданих по фічах. Первинний ADR змішував архітектурне рішення з фазовими планами, припущеннями про провайдерів, цінами, trial, податковою політикою й операційними цілями. Такі плани не є доказом, що шлях поставлений.

## Рішення

1. `subscriptions` — поточне джерело entitlement. `getUserPlan()` обирає не прострочений рядок у `active`, `trialing` або `past_due`; за відсутності такого рядка діє Free. Founder bypass синтетичний і не створює рядок підписки.
2. Ліміти централізовані в `effectiveLimits()`. На момент валідації Free має 5 AI-запитів на добу, 2 cloud-sync пристрої та вимкнений Monobank auto-sync; Pro не має ліміту для перших двох полів і вмикає auto-sync. `null` у цьому контракті означає unlimited.
3. Billing проходить через provider abstraction. Для країни UA resolver повертає лише ввімкнені LiqPay та/або Plata; поза UA — Stripe. Увімкнення UA-провайдера потребує merchant credentials і feature flag. Код у репозиторії не доводить, що будь-який провайдер увімкнений у production.
4. Webhook handlers дедуплікують provider deliveries у `billing_webhook_events` і зберігають поточний entitlement у `subscriptions`. Скасування у провайдера — best-effort external operation з локальним `cancel_at_period_end`, де він підтриманий.
5. Поточний committed monthly UAH default — `PRO_MONTHLY_UAH_KOPIYKAS=19900`. Це конфігурація, не доказ опублікованої пропозиції. Annual-price configuration та annual checkout flow у коді відсутні.

## Наслідки

- HTTP handlers і AI gates використовують один contract плану та лімітів.
- Активація payment provider лишається operations-рішенням: merchant account, secrets, flag, production verification і support process мають бути готові разом.
- Ціни, feature packaging і trial rules змінюються наступним accepted decision та відповідною реалізацією, а не виводяться зі старого copy чи environment default.

## Pending work і policy choices

- Reverse-trial issuance, expiry, downgrade і notifications не реалізовані. `trial_ends_at` існує у схемі, але немає верифікованого registration або expiry path, який видає reverse trial.
- Annual plans, proration, dunning/grace automation, client idempotency keys, billing cache invalidation, tax handling, refund/dispute automation і billing-specific SLO/alert policy — pending. Їх не можна називати shipped.
- Фактичний production provider set і customer-facing price потребують операційної перевірки поза репозиторієм.
