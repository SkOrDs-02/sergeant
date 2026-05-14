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
4. ~~**Customer Portal endpoint відсутній** — self-serve cancel / update payment — лише Stripe Dashboard.~~ → Closed: `POST /api/billing/portal` shipped (P0-6 follow-up PR); UI-кнопка в `PlanSection` чекає P1-6.
5. **Analytics event registry неповний** — initiative 0010 Phases 4–6 потребує ACTIVATION_V2_HIT, LANDING_VIEWED, LANDING_EMAIL_CAPTURED, SIGNUP_PROVIDER_SELECTED — жодного не було в canonical registry.
6. **billingKeys factory пропущена** — Hard Rule #2 compliance gap для billing domain RQ queries.
7. **Landing page (Phase 6.1) — 0 LOC** — публічний `/` для SEO/paid-acquisition не існує.
8. **EN locale (Phase 6.2) — 0 progress** — i18n framework не інтегрований; hero copy тільки uk.
9. **LiqPay placeholder — відсутній** — UA-локальний платіжний шлюз не scaffolded.
10. **Activation v2 web-side capture — wired ✅** — `evaluateActivationV2()` тепер кличеться з `apps/web/src/core/activation/useActivationV2.ts`; Boot-адаптер агрегує snapshot з Auth + finyk RQ-кешу і запускає `ACTIVATION_V2_HIT` одноразово (`sergeant.activation_v2_fired` localStorage-флаг). Будж-фіксація через React Query — наступний крок (TODO у `useActivationV2Boot.ts`).

## P0 — Blocker (без цього launch неможливий)

| #    | Item                                             | Дія     | Файл / шлях                                        | Статус        |
| ---- | ------------------------------------------------ | ------- | -------------------------------------------------- | ------------- |
| P0-1 | `usePlan` hook (web billing skeleton)            | **Add** | `apps/web/src/core/billing/usePlan.ts`             | **Done (PR)** |
| P0-2 | PaywallModal (fires PAYWALL_VIEWED)              | **Add** | `apps/web/src/core/billing/PaywallModal.tsx`       | **Done (PR)** |
| P0-3 | billingKeys factory (Hard Rule #2)               | **Add** | `apps/web/src/shared/lib/api/queryKeys.ts:101–111` | **Done (PR)** |
| P0-4 | Webhook: subscription_renewed emit               | **Add** | `apps/server/src/modules/billing/stripe.ts`        | **Done (PR)** |
| P0-5 | Webhook: subscription_canceled emit              | **Add** | `apps/server/src/modules/billing/stripe.ts`        | **Done (PR)** |
| P0-6 | Customer Portal endpoint (`/api/billing/portal`) | **Add** | `apps/server/src/routes/billing.ts`                | **Done (PR)** |
| P0-7 | Stripe price_id env-config + validation          | **Add** | `apps/server/src/config/env.ts` (schema)           | Outstanding   |

## P1 — High (launch quality / funnel completeness)

| #    | Item                                                       | Дія        | Файл / шлях                                                         | Статус        |
| ---- | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------- | ------------- |
| P1-1 | Analytics events: init 0010 Phase 4–6 constants            | **Add**    | `packages/shared/src/lib/analyticsEvents.ts:218–259`                | **Done (PR)** |
| P1-2 | Activation v2 web-side capture (call evaluateActivationV2) | **Add**    | `apps/web/src/core/activation/` (нова директорія)                   | **Done (PR)** |
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

Закрито **6 items** з P0/P1 у попередньому PR + **1 follow-up item** (P1-2) у поточному:

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

### P1-2 · Activation v2 web-side capture ✅ Closed in #2756

- **Файли:** `apps/web/src/core/activation/useActivationV2.ts` (core hook), `apps/web/src/core/activation/useActivationV2Boot.ts` (RQ-cache adapter), `apps/web/src/core/activation/index.ts` (barrel), `apps/web/src/core/App.tsx` (mount-point у `AppInner`).
- **Тести:** `apps/web/src/core/activation/useActivationV2.test.tsx` (5 кейсів — happy path, null input, not-activated, persisted fire-flag, A/B variant payload). Mock-ане `evaluateActivationV2` + analytics-spy через `vi.mock`.
- `useActivationV2(input)` рахує `ActivationResult` через pure-fn з `@sergeant/insights` і фає `ACTIVATION_V2_HIT` рівно один раз — гард localStorage-флага `sergeant.activation_v2_fired` (контракт у `analyticsEvents.ts:222`). Payload: `time_to_activate_hours`, `mono_connected: true`, `transactions_categorized`, `budgets_set`, опціональний `variant`.
- `useActivationV2Boot()` агрегує snapshot з `useAuth().user.createdAt` (signedUpAt) + cache-prefix walk `["finyk", "mono", "webhook-tx"]` (categorized txn count з `MonoTransactionDto.categorySlug !== null`) + `finykKeys.monoWebhookAccounts.length`. Будж-кількість поки `0` (TODO: budget RQ-key зараз немає — `finyk/budgets` читає з SQLite напряму; follow-up плагне count сюди й активаційний funnel запрацює end-to-end на live data).

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

## Прогрес виконання (P0-6 follow-up PR — Customer Portal endpoint)

Закрито **1 item** з P0:

### P0-6 · Customer Portal endpoint (`POST /api/billing/portal`) ✅ Зроблено в цьому PR

- **Server:** `apps/server/src/routes/billing.ts` — додано `r.post("/api/billing/portal", requireSession(), rateLimitExpress({ key: "api:billing:portal", limit: 10, windowMs: 1h }), …)`. Помилки маплимо у `503 BILLING_UNAVAILABLE` (немає `STRIPE_SECRET_KEY`) та `409 NO_BILLING_CUSTOMER` (немає `provider_customer_id` у `subscriptions`).
- **Module:** `apps/server/src/modules/billing/stripe.ts` — нова `createCustomerPortalSession({ pool, userId })` + `NoBillingCustomerError`. Дзеркалить pattern `createCheckoutSession`: дістає `provider_customer_id` із `subscriptions WHERE status IN ('active','trialing','past_due')`, POSTить на `https://api.stripe.com/v1/billing_portal/sessions` із `return_url=${PUBLIC_WEB_BASE_URL}/settings?billing=portal-return`.
- **Contract triplet (Hard Rule #3):** `BillingPortalResponseSchema` у `packages/shared/src/schemas/api.ts` (SSOT) → OpenAPI registry/routes → `api-client` `createPortal()` + регенерований `docs/api/openapi.json` і `packages/api-client/src/generated/openapi.d.ts`.
- **Тести:** `apps/server/src/routes/billing.test.ts` — 3 нові кейси (happy path + 503 + 409), мок `globalThis.fetch`. `packages/api-client/src/endpoints/billing.test.ts` — нові unit-тести на `createPortal()` (URL, method) + schema rejection regression-guard.
- **Web:** `PlanSection` ще не існує (P1-6 outstanding) — endpoint expose-нуто в `api-client` (`http.billing.createPortal()`); UI-кнопка чекає P1-6.

## Файли змінено у P0-6 follow-up PR

| #   | Файл                                                   | Тип                 |
| --- | ------------------------------------------------------ | ------------------- |
| 1   | `packages/shared/src/schemas/api.ts`                   | Changed             |
| 2   | `packages/shared/src/openapi/registry.ts`              | Changed             |
| 3   | `packages/shared/src/openapi/routes.ts`                | Changed             |
| 4   | `apps/server/src/modules/billing/stripe.ts`            | Changed             |
| 5   | `apps/server/src/routes/billing.ts`                    | Changed             |
| 6   | `apps/server/src/routes/billing.test.ts`               | Changed             |
| 7   | `packages/api-client/src/endpoints/billing.ts`         | Changed             |
| 8   | `packages/api-client/src/endpoints/billing.test.ts`    | New                 |
| 9   | `packages/api-client/src/index.ts`                     | Changed             |
| 10  | `docs/api/openapi.json`                                | Changed (generated) |
| 11  | `packages/api-client/src/generated/openapi.d.ts`       | Changed (generated) |
| 12  | `docs/audits/2026-05-13-revenue-monetization-roast.md` | Changed             |
| 13  | `docs/audits/README.md`                                | Changed             |
