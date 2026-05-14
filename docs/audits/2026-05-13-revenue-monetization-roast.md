# Revenue, Monetization & Marketing Roast (2026-05-13)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active
>
> _Update 2026-05-13: P1-9 closed — `apps/web/src/core/billing/TrialBanner.tsx` scaffolded + mounted in `HubMainContent` banner stack._

## Cross-refs

- Попередня прожарка цієї теми: [`2026-05-04-revenue-and-marketing-roast.md`](./2026-05-04-revenue-and-marketing-roast.md) — перша «нульова» ревізія, що констатувала «56 k LOC docs / 0 paying users».
- Ініціатива: [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md) — 6-фазний plan Phase 0–5.1 done; Phase 2/3 active.
- ADR-0051: [`docs/adr/0051-pricing-v3-single-tier.md`](../adr/0051-pricing-v3-single-tier.md) — Free + Pro ($7/мес), ₴ для UA, 7-day trial.
- ADR-0052: [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../adr/0052-mobile-strategy-capacitor-primary.md) — Capacitor primary, Expo parallel.
- Бізнес-стратегія: [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md), [`02-go-to-market.md`](../launch/business/02-go-to-market.md), [`06-monetization-architecture.md`](../launch/business/06-monetization-architecture.md).

## TL;DR

Стан на 2026-05-13: **billing skeleton (server + API-client + DB migrations) — shipped і тестований** (≈1 100 LOC). Stripe checkout + webhook + subscription upsert працюють. PricingPage (2-tier, PostHog instrumented) готовий. **Залишаються суттєві дірки:**

1. **Paywall modal відсутній** — PAYWALL_VIEWED оголошений, але ніде не емітиться; Pro-gate UI не існує → free users бачать Pro-фічі без обмежень.
2. **`usePlan` hook не існує** — web-сторона не знає план користувача; downstream (paywall, settings, AI-ліміти) не може gate-ити.
3. **Webhook lifecycle неповний** — `subscription_started` emit працює, але `subscription_renewed` і `subscription_canceled` — ні. MRR / churn dashboards PostHog неможливі.
4. **Customer Portal endpoint відсутній** — self-serve cancel / update payment — лише Stripe Dashboard.
5. **Analytics event registry неповний** — initiative 0010 Phases 4–6 потребує ACTIVATION_V2_HIT, LANDING_VIEWED, LANDING_EMAIL_CAPTURED, SIGNUP_PROVIDER_SELECTED — жодного не було в canonical registry.
6. **billingKeys factory пропущена** — Hard Rule #2 compliance gap для billing domain RQ queries.
7. **Landing page (Phase 6.1) — 0 LOC** — публічний `/` для SEO/paid-acquisition не існує.
8. **EN locale (Phase 6.2) — 0 progress** — i18n framework не інтегрований; hero copy тільки uk.
9. **LiqPay placeholder — відсутній** — UA-локальний платіжний шлюз не scaffolded.
10. **Activation v2 web-side capture — не wired** — `evaluateActivationV2()` pure function існує в packages/insights, але ніхто її не викликає на client.

## P0 — Blocker (без цього launch неможливий)

| #    | Item                                             | Дія     | Файл / шлях                                        | Статус        |
| ---- | ------------------------------------------------ | ------- | -------------------------------------------------- | ------------- |
| P0-1 | `usePlan` hook (web billing skeleton)            | **Add** | `apps/web/src/core/billing/usePlan.ts`             | **Done (PR)** |
| P0-2 | PaywallModal (fires PAYWALL_VIEWED)              | **Add** | `apps/web/src/core/billing/PaywallModal.tsx`       | **Done (PR)** |
| P0-3 | billingKeys factory (Hard Rule #2)               | **Add** | `apps/web/src/shared/lib/api/queryKeys.ts:101–111` | **Done (PR)** |
| P0-4 | Webhook: subscription_renewed emit               | **Add** | `apps/server/src/modules/billing/stripe.ts`        | **Done (PR)** |
| P0-5 | Webhook: subscription_canceled emit              | **Add** | `apps/server/src/modules/billing/stripe.ts`        | **Done (PR)** |
| P0-6 | Customer Portal endpoint (`/api/billing/portal`) | **Add** | `apps/server/src/routes/billing.ts`                | Outstanding   |
| P0-7 | Stripe price_id env-config + validation          | **Add** | `apps/server/src/config/env.ts` (schema)           | Outstanding   |

## P1 — High (launch quality / funnel completeness)

| #    | Item                                                       | Дія        | Файл / шлях                                                         | Статус        |
| ---- | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------- | ------------- |
| P1-1 | Analytics events: init 0010 Phase 4–6 constants            | **Add**    | `packages/shared/src/lib/analyticsEvents.ts:218–259`                | **Done (PR)** |
| P1-2 | Activation v2 web-side capture (call evaluateActivationV2) | **Add**    | `apps/web/src/core/activation/` (нова директорія)                   | Outstanding   |
| P1-3 | Landing page scaffold (Phase 6.1 — `/`)                    | **Add**    | `apps/web/src/core/LandingPage.tsx` + route                         | Outstanding   |
| P1-4 | EN locale integration (Phase 6.2 — i18next або подібне)    | **Add**    | `packages/shared/src/i18n/` + `apps/web/` wiring                    | Outstanding   |
| P1-5 | LiqPay payment gateway placeholder                         | **Add**    | `apps/server/src/modules/billing/liqpay.ts` (scaffold)              | Outstanding   |
| P1-6 | Pro plan limits UI in Settings (show plan + manage sub)    | **Add**    | `apps/web/src/core/settings/PlanSection.tsx`                        | Outstanding   |
| P1-7 | Paywall integration points (AI chat, Mono auto-sync)       | **Change** | `apps/web/src/core/chat/ChatInput.tsx`, finyk hooks                 | Outstanding   |
| P1-8 | PricingPage: handle `?checkout=success` return URL         | **Change** | `apps/web/src/core/PricingPage.tsx` (invalidate billingKeys.status) | Outstanding   |
| P1-9 | Trial expiry banner / notification                         | **Add**    | `apps/web/src/core/billing/TrialBanner.tsx`                         | **Done (PR)** |

## P2 — Nice-to-have (post-launch polish)

| #    | Item                                                   | Дія     | Файл / шлях                                                   | Статус      |
| ---- | ------------------------------------------------------ | ------- | ------------------------------------------------------------- | ----------- |
| P2-1 | GTM hero copy A/B test (PostHog feature flag)          | **Add** | `apps/web/src/core/LandingPage.tsx` + PostHog FF              | Outstanding |
| P2-2 | Revenue dashboards in admin panel                      | **Add** | `apps/web/src/core/admin/RevenueDashboard.tsx`                | Outstanding |
| P2-3 | Subscription change proration (upgrade/downgrade path) | **Add** | `apps/server/src/modules/billing/stripe.ts` (proration logic) | Outstanding |
| P2-4 | Invoice PDF generation + email                         | **Add** | `apps/server/src/modules/billing/invoices.ts`                 | Outstanding |
| P2-5 | Referral / promo code system                           | **Add** | `apps/server/src/modules/billing/promotions.ts`               | Outstanding |
| P2-6 | Annual billing option (ADR-0051 mentions only monthly) | **Add** | ADR amendment + Stripe Price + UI toggle                      | Outstanding |

## Прогрес виконання (цей PR)

Закрито **6 items** з P0/P1 у цьому PR:

## Прогрес виконання — follow-up PR (2026-05-13, P1-9)

### P1-9 · `TrialBanner` scaffold — trial-expiry banner

- **Файл:** `apps/web/src/core/billing/TrialBanner.tsx` (new)
- **Тест:** `apps/web/src/core/billing/TrialBanner.test.tsx` (new, 8 tests)
- **Mount:** `apps/web/src/core/app/HubMainContent.tsx` — у chrome banner stack, перед `showUpdate`, гейтиться `!inFtuxSession` (узгоджено з install / iOS банерами).
- **Контракт:** читає `usePlan()` (P0-1); рендериться лише коли `subscription.status === 'trialing'` та `daysLeft ≤ 7`. ≤ 1 день → sticky-варіант з акцентом (`shadow-sm` + сильніший `border-warning/40`). CTA `Перейти на Pro` → `/pricing?source=trial_banner`.
- **A11y:** `role="status"` + `aria-live="polite"`; CTA через `Button size="sm"` (touch-target 44×44 на coarse pointers); кольори через `text-warning-strong` / `bg-warning-soft` (Hard Rule #11 без arbitrary hex).
- **Barrel:** `apps/web/src/core/billing/index.ts` — реекспорт `TrialBanner` + `TrialBannerProps`.
- **i18n:** copy винесена у локальний `COPY` const (Phase 6.2 migration-ready — без inline cyrillic JSX literals, `sergeant-design/no-cyrillic-jsx-literal` чистий).

### P0-1 · `usePlan` hook — web billing skeleton

- **Файл:** `apps/web/src/core/billing/usePlan.ts` (new, 65 LOC)
- **Тест:** `apps/web/src/core/billing/usePlan.test.tsx` (new, 4 tests)
- `useQuery` з `billingKeys.status` (Hard Rule #2 ✓), `billingApi.status()`. Повертає `{ plan, isPro, isLoading, subscription }`. Fallback на `"free"` під час loading / error.

### P0-2 · PaywallModal — Pro-gate UI

- **Файл:** `apps/web/src/core/billing/PaywallModal.tsx` (new, 109 LOC)
- **Тест:** `apps/web/src/core/billing/PaywallModal.test.tsx` (new, 3 tests)
- Fires `PAYWALL_VIEWED` з `{ surface }` при open. CTA → `/pricing?source=paywall`. Customizable headline/body/features.

### P0-3 · billingKeys factory

- **Файл:** `apps/web/src/shared/lib/api/queryKeys.ts` (lines 101–111 added)
- `billingKeys.all`, `billingKeys.status` — Hard Rule #2 compliance для billing domain.

### P0-4 + P0-5 · Webhook lifecycle: subscription_renewed + subscription_canceled

- **Файл:** `apps/server/src/modules/billing/stripe.ts` — refactored `emitSubscriptionStarted` → generic `captureLifecycle` + new `emitSubscriptionRenewed` / `emitSubscriptionCanceled`.
- `subscription_renewed` carries `$revenue` for MRR dashboards; `subscription_canceled` skips `$revenue` + adds `{ reason: "user" | "billing" | "expired" }`.
- **Тест:** `apps/server/src/modules/billing/stripe.test.ts` — updated: added 2 new test cases (renewed + canceled), replaced old "does NOT fire on updated" test.

### P1-1 · Analytics events: initiative 0010 Phase 4–6 constants

- **Файл:** `packages/shared/src/lib/analyticsEvents.ts` (lines 218–259 added)
- 4 нових events: `ACTIVATION_V2_HIT`, `LANDING_VIEWED`, `LANDING_EMAIL_CAPTURED`, `SIGNUP_PROVIDER_SELECTED`.
- Inline payload contracts з типами + зв'язки з ініціативою 0010.
- **Тест:** `packages/shared/src/lib/analyticsEvents.test.ts` (lines 57–76 added) — stability guard on canonical names.

### Barrel export

- **Файл:** `apps/web/src/core/billing/index.ts` — re-exports `usePlan`, `PaywallModal` + types.

## Файли змінено у цьому PR

| #   | Файл                                                   | Тип     |
| --- | ------------------------------------------------------ | ------- |
| 1   | `packages/shared/src/lib/analyticsEvents.ts`           | Changed |
| 2   | `packages/shared/src/lib/analyticsEvents.test.ts`      | Changed |
| 3   | `apps/web/src/shared/lib/api/queryKeys.ts`             | Changed |
| 4   | `apps/web/src/core/billing/usePlan.ts`                 | New     |
| 5   | `apps/web/src/core/billing/usePlan.test.tsx`           | New     |
| 6   | `apps/web/src/core/billing/PaywallModal.tsx`           | New     |
| 7   | `apps/web/src/core/billing/PaywallModal.test.tsx`      | New     |
| 8   | `apps/web/src/core/billing/index.ts`                   | New     |
| 9   | `apps/server/src/modules/billing/stripe.ts`            | Changed |
| 10  | `apps/server/src/modules/billing/stripe.test.ts`       | Changed |
| 11  | `docs/audits/2026-05-13-revenue-monetization-roast.md` | New     |
| 12  | `docs/audits/README.md`                                | Changed |
