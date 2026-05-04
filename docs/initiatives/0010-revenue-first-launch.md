# 0010 — Revenue-first launch: ship paid, freeze scope, focus wedge

> **Last validated:** 2026-05-04 by @sonher468. **Next review:** 2026-08-02.
> **Status:** Proposed (план PR-ів; перший PR — цей документ + аудит-сорс)
> **Priority:** P0 (Sprint 1–4)
> **Owner:** `@Skords-01`
> **ETA:** 4 тижні (фаза 0 — поточний PR; фази 1–6 — 4 спринти по 1 тижню)
> **Sources:** [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md), [`docs/launch/01-monetization-and-pricing.md`](../launch/01-monetization-and-pricing.md), [`docs/launch/02-go-to-market.md`](../launch/02-go-to-market.md), [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md), [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../audits/2026-05-03-ftux-onboarding-roast.md)

## TL;DR

Sergeant має 0 paying users, 0 ₴ MRR, 0 рядків білінг-коду — і 7 467 рядків плану монетизації. Ця ініціатива зупиняє інші front-и розширення скоупу (новий модуль, OpenClaw, мульти-mobile) і фокусує всі найближчі 4 тижні на **shipping реального білінгу + одного wedge-позиціонування + одного публічного landing-у**. Перший PR (цей) — docs-only: фіксує decision-baseline (нова pricing-модель, scope-freeze) і реєструє PR-план. Наступні PR-и реалізовують білінг від міграцій до Customer Portal-у.

## Чому зараз

- **Ризик зволікання — death by 1000 docs.** За останні 90 днів злито 3 479 комітів і написано 56 466 рядків docs; жоден з них не приніс ₴1 виручки.
- **Конкуренти живі і ростуть.** personalEverything, LifeShift 360, Phaseo вже у проді з тим самим «all-in-one» value-prop. Кожен тиждень без launch — це CAC, який доведеться платити, щоб відіграти share.
- **Pricing-модель v1 економічно нежиттєздатна.** ₴99/міс при ≈$5/користувача API costs (Anthropic) = негативна gross margin на Pro tier. Це треба виправити **до** першого Stripe-чека, не після.
- **Технічний skeleton монетизації** [(`docs/launch/06-monetization-architecture.md`)](../launch/06-monetization-architecture.md) розписаний на 691 рядок без жодного рядка `subscriptions` SQL у `apps/server/src/migrations/`. Час перейти від v2-плану до коду.
- **Tech-debt + scope expansion блокують velocity.** OpenClaw (573 рядки roadmap), `apps/console`, paralleled mobile (Capacitor + Expo) — все це додає maintenance burden, але не виручку. Фрізимо.

## Скоуп

**In:**

1. Зафіксувати рішення про pricing v3 (Free + Pro tier, $7/міс / $49/рік, видалити Plus + Lifetime + pay-per-feature).
2. Заморозити OpenClaw v0, `apps/console` як прод-фічу, і вибрати один mobile стек (Expo або Capacitor — рішення в окремому PR на основі `0002-mobile-platform-decision`).
3. Реалізувати реальний білінг: `subscriptions` + Stripe webhook events table, Stripe SDK, `getUserPlan()` + `requirePlan()`, paywall UI, Stripe Checkout CTA, Customer Portal redirect.
4. Pivot activation metric і onboarding на Mono-led wedge (FTUX S5 carry-over).
5. Реальний публічний лендинг (mini-product page + email capture) з трекінгом у PostHog + EN-локаль на pricing.
6. Public metrics dashboard (MRR/WAU/D7/activation) — single source of truth для build-in-public.

**Out:**

- LiqPay/Paddle/Fondy інтеграції — слідують за Stripe MVP (фаза 7+, не в скоупі цієї ініціативи).
- Реалізація cross-module AI-інсайтів — окрема ініціатива пост-launch.
- Бренд-зміна / rename з «Sergeant» — потребує user-research, окрема ініціатива.
- B2B / corporate / marketplace треки — out, не зараз.
- Mass-видалення docs / playbooks — окремий cleanup, не блокуючий launch.
- Apple App Store / Play Store submission — слідує за веб-launch + 100 paid (наступна ініціатива).

## План змін

### Фаза 0 — decision-baseline (1 PR — цей)

**PR `docs-revenue-first-launch-baseline` (scope: `docs`):**

- `docs/audits/2026-05-04-revenue-and-marketing-roast.md` — аудит-сорс цієї ініціативи (~440 рядків).
- `docs/initiatives/0010-revenue-first-launch.md` — цей документ.
- Оновити `docs/initiatives/README.md` — додати рядок 0010 у таблицю активних ініціатив.

**Acceptance:**

- `pnpm lint:governance-sync` зелений (freshness header + Status badge на двох нових файлах).
- `pnpm docs:check-links` зелений (усі cross-refs резолвляться).
- Жодного функціонального коду не торкаємось — це pure-docs delivery.

**LOC бюджет:** ≤ 700 LOC docs (під PR-cap 300 LOC коду — для docs allowлив, перевіряти не кодом, а оглядом).

---

### Фаза 1 — pricing & scope ADR-и (3 PR)

#### PR 1.1 `docs-adr-pricing-v3` (scope: `docs`)

- `docs/adr/0045-pricing-v3-single-tier.md` — ADR про перехід на 2-тірну модель (Free + Pro $7/міс / $49/рік).
- Оновити `docs/launch/01-monetization-and-pricing.md` — додати «Update 2026-05-XX: pricing v3 затверджено» зі статусом «Superseded by ADR-0045» на застарілих секціях.
- Додати freshness-update header.

**Залежить від:** Фаза 0.

**Acceptance:** ADR-0045 з `Status: Accepted`, lint:governance-sync зелений, governance-matrix оновлено.

#### PR 1.2 `docs-adr-openclaw-park` (scope: `docs`)

- `docs/adr/0046-openclaw-park-until-100-paid.md` — ADR про заморозку OpenClaw v0.
- Оновити `docs/launch/openclaw-roadmap.md` — `Status: Parked` + посилання на ADR.
- Оновити `docs/initiatives/` README — якщо OpenClaw має ініціативу, переводимо в `Parked`.

**Залежить від:** Фаза 0.

**Acceptance:** ADR-0046 з `Status: Accepted`, openclaw-roadmap.md явно `Parked`.

#### PR 1.3 `docs-adr-mobile-pick` (scope: `docs`)

- `docs/adr/0047-mobile-stack-final-pick.md` — фіналізація `0002-mobile-platform-decision`: один stack залишається, інший — deprecated до видалення (T-30 / T-7 / T-1 cadence уже шипнутий у [#1633](https://github.com/Skords-01/Sergeant/pull/1633)).
- Оновити `docs/initiatives/0002-mobile-platform-decision.md` — phase 3 closure plan.

**Залежить від:** Фаза 0.

**Acceptance:** ADR-0047 з `Status: Accepted`, deprecation календар у readme `apps/<deprecated>`.

---

### Фаза 2 — billing data layer (2 PR)

#### PR 2.1 `feat-migrations-subscriptions-and-stripe-events` (scope: `migrations`)

- `apps/server/src/migrations/<039_subscriptions>.sql` (новий):
  ```sql
  CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    provider TEXT NOT NULL DEFAULT 'manual',
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    current_period_end TIMESTAMPTZ,  -- NULL = безстроково / free
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX subscriptions_user_active_idx
    ON subscriptions(user_id) WHERE status IN ('active', 'trialing', 'past_due');
  ```
- `apps/server/src/migrations/<040_stripe_webhook_events>.sql` (новий):
  ```sql
  CREATE TABLE stripe_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL
  );
  ```
  (idempotency store — Stripe гарантує at-least-once delivery, не exactly-once).

**Залежить від:** PR 1.1.

**Acceptance:**

- `pnpm db:up && pnpm db:migrate` локально проходить.
- Snapshot тест у `apps/server/src/__tests__/<migrations>.test.ts` оновлено.
- `pnpm lint:migrations` зелений (sequential, no gaps).

#### PR 2.2 `feat-server-billing-core` (scope: `server`)

- `apps/server/src/modules/billing/<getUserPlan>.ts` — читає з `subscriptions`, повертає `'free' | 'pro'` + `currentPeriodEnd`.
- `apps/server/src/modules/billing/<requirePlan>.ts` — Express middleware, повертає 402 Payment Required для locked routes.
- `apps/server/src/modules/billing/<effectiveLimits>.ts` — динамічні квоти (AI requests, CloudSync) на основі плану.
- `apps/server/src/modules/billing/__tests__/` — Vitest + Testcontainers тести (real Postgres).
- ENV: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ENABLED` flag (default `false` до фази 3).

**Залежить від:** PR 2.1.

**Acceptance:**

- 100% test coverage на нових модулях.
- Жоден існуючий route не змінив поведінку (всі pass через `provider: 'manual'` і `plan: 'free'` для всіх юзерів).
- `pnpm typecheck` + `pnpm test --filter @sergeant/server` зелені.

---

### Фаза 3 — Stripe integration end-to-end (3 PR)

#### PR 3.1 `feat-server-stripe-checkout-and-portal` (scope: `server`)

- `apps/server/src/modules/billing/<stripe>.ts` — Stripe SDK init (`@stripe/stripe-node`), feature-flagged за `STRIPE_ENABLED`.
- `POST /api/billing/checkout` — створює Checkout Session, повертає URL.
- `POST /api/billing/portal` — створює Customer Portal Session, повертає URL.
- Tests: integration з Stripe test mode (записаний `nock` cassette).

**Залежить від:** PR 2.2.

**Acceptance:** запит `POST /api/billing/checkout` з тестового користувача повертає валідний `checkout.stripe.com` URL у dev mode.

#### PR 3.2 `feat-server-stripe-webhook` (scope: `server`)

- `POST /api/billing/webhook` — verify signature → idempotency check проти `stripe_webhook_events` → upsert у `subscriptions`.
- Handlers: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.disputed`.
- Postgres `LISTEN/NOTIFY` для cache-invalidation у RQ (`subscription_changed` channel).
- Edge-case tests: replay (idempotency), out-of-order events, signature mismatch.

**Залежить від:** PR 3.1.

**Acceptance:**

- `stripe trigger invoice.paid` локально оновлює `subscriptions.current_period_end`.
- Replay того ж event-id не змінює рядок повторно.

#### PR 3.3 `feat-api-client-billing-types` (scope: `api-client`)

- `packages/api-client/src/endpoints/<billing>.ts` — типи + клієнт-функції: `createCheckoutSession`, `openCustomerPortal`, `getPlan`.
- Snapshot-тести.

**Залежить від:** PR 3.2.

**Acceptance:** `pnpm test --filter @sergeant/api-client` зелений; web може імпортувати без `as any`.

---

### Фаза 4 — paywall UI + замінити static pricing (2 PR)

#### PR 4.1 `feat-web-paywall-and-plan-hooks` (scope: `web`)

- `apps/web/src/core/billing/<usePlan>.ts` — RQ hook через `billingKeys.plan()` (новий factory у `queryKeys.ts`).
- `apps/web/src/core/billing/<PaywallModal>.tsx` — generic paywall, locked feature → CTA → Checkout.
- Інтеграція у 1–2 локед-routes (наприклад, `>5 AI requests/day` → paywall).
- A11y + dark-mode pass per `.agents/skills/sergeant-web-ui/SKILL.md`.

**Залежить від:** PR 3.3.

**Acceptance:**

- RTL-тести: free user → paywall з'являється; pro user → проходить.
- `usePlan()` invalidate-ається на `subscription_changed` SSE/poll.

#### PR 4.2 `feat-web-pricing-page-real` (scope: `web`)

- Замінити статичний `apps/web/src/core/PricingPage.tsx` на 2-тірну модель з реальним CTA → `POST /api/billing/checkout`.
- Видалити waitlist-форму (карається за окремим path `/waitlist` як legacy 3 місяці).
- Customer Portal link для існуючих Pro юзерів.
- USD/EUR auto-detect через Stripe price localization.
- PostHog події: `PRICING_VIEWED`, `PRICING_CTA_CLICKED`, `CHECKOUT_OPENED`.

**Залежить від:** PR 4.1.

**Acceptance:**

- E2E happy-path: visit /pricing → click CTA → land on Stripe Checkout (test mode) → return → plan = pro.
- a11y axe-core зелений.

---

### Фаза 5 — activation pivot до Mono-wedge (2 PR)

#### PR 5.1 `feat-insights-activation-v2` (scope: `insights`)

- Нова метрика `activation_v2` = `Mono connected ≥1 + ≥5 transactions categorized + ≥1 budget set ≤72h`.
- Pure-function в `packages/insights/src/<activation>.ts` + tests.

**Залежить від:** Фаза 0 (можна паралельно з фазою 2).

#### PR 5.2 `feat-web-onboarding-goal-first` (scope: `web`)

- Замінити `vibe_picks` UI на goal-first single-screen wizard: «Я хочу контролювати витрати» → одразу Mono OAuth + 5 categorize.
- Перенести fitness/nutrition/routine модулі в «cross-sell» картки на dashboard.
- PostHog події: `ACTIVATION_V2_HIT`, `ONBOARDING_GOAL_PICKED`.
- Carry-over від [`docs/launch/ftux-sprint-plan.md`](../launch/ftux-sprint-plan.md) S5.

**Залежить від:** PR 5.1.

**Acceptance:** E2E: новий юзер може досягти `activation_v2` за 4 хвилини (рекординг tester-сесії).

---

### Фаза 6 — публічний лендинг + EN locale + public metrics (2 PR)

#### PR 6.1 `feat-web-landing-and-en-locale` (scope: `web`)

- `apps/web/src/core/<Landing>.tsx` (route `/`, новий) — hero «Український Mono + AI = персональний фінансовий сержант» + 1 demo GIF + email capture (PostHog).
- EN-локаль для `/`, `/pricing`, paywall — мінімальний i18n setup (react-i18next або lingui — рішення в окремому ADR-0048 у скоупі цього PR).
- Sitemap + robots.txt + OG-image.

**Залежить від:** PR 4.2.

**Acceptance:**

- Lighthouse ≥ 90 у performance/a11y/SEO.
- `lang="uk"` / `lang="en"` коректно підтягуються.
- Email capture → PostHog `LANDING_EMAIL_CAPTURED` event.

#### PR 6.2 `feat-server-public-metrics-dashboard` (scope: `server`)

- `GET /api/public/metrics` — повертає cached MRR, WAU, D7 retention, activation rate. Cache 1 година.
- Public Notion-style page на `/metrics` (web) — пов'язує build-in-public з реальними цифрами.

**Залежить від:** PR 5.1, PR 4.2.

**Acceptance:** `/api/public/metrics` повертає фактичні (не stub) числа з Postgres.

---

## Критерії DONE (вся ініціатива)

- [ ] PR-и фази 0 (цей PR) + фази 1–6 змерджені.
- [ ] Перший Stripe webhook у проді записаний у `stripe_webhook_events`.
- [ ] Перший платний користувач: `subscriptions.plan = 'pro'` AND `subscriptions.provider = 'stripe'` AND `subscriptions.current_period_end > NOW()`.
- [ ] `/pricing` показує реальні CTA → Stripe Checkout (не waitlist), test mode + live mode обидва зелені у smoke-e2e.
- [ ] OpenClaw roadmap явно `Parked` через ADR.
- [ ] Один mobile-stack deprecated через ADR з конкретним deletion-датою.
- [ ] `activation_v2` доступна як метрика у PostHog dashboard.
- [ ] Public metrics endpoint живий, перший публічний build-in-public пост відсилається на `/metrics`.
- [ ] EN-локаль працює на `/` і `/pricing`.
- [ ] Усі PR-и пройшли CI зелено + a11y axe-core + Lighthouse budget.
- [ ] Усі нові docs мають freshness header + Status badge (Hard Rule #10).
- [ ] `docs/launch/01-monetization-and-pricing.md` оновлено: pricing v3 — current state, не план.

## Метрики успіху (вимірюються через 30 днів після фази 6)

| Метрика                                     | Поріг go/no-go | Target | Джерело                       |
| ------------------------------------------- | -------------- | ------ | ----------------------------- |
| Перший платний (`provider='stripe'`)        | ≥ 1            | ≥ 10   | SQL `subscriptions`           |
| Activation rate (v2)                        | ≥ 15 %         | ≥ 30 % | PostHog funnel                |
| Days to first paid                          | ≤ 28           | ≤ 14   | calendar                      |
| `/pricing` → checkout open conversion       | ≥ 5 %          | ≥ 12 % | PostHog                       |
| Stripe webhook idempotency violations       | 0              | 0      | `stripe_webhook_events` audit |
| Cross-stack mobile maintenance hours / week | < 2 h          | 0 h    | `docs/diagnostics/`           |

## Ризики та митиґація

| Ризик                                                                      | Мітигація                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founder заперечує pricing v3 ($7/міс) як «занадто дорого для UA»           | ADR-0045 містить кваліф-бенчмарки (Stripe / Apple IAP / global B2C SaaS). Якщо not approved — пропустити фазу 1.1 і shipити з ₴99 (відомо що неекономічно). |
| Stripe / LiqPay не доступні для UA-юрособи                                 | Stripe Atlas (Delaware LLC) — стандарт для UA founders. Окрема legal-track ADR-0049 (out of scope цієї ініціативи, але блокер на фазу 3).                   |
| Webhook delivery flakey у тесті                                            | `stripe trigger` локально + nock cassettes у CI. Production — exponential backoff на own retry queue.                                                       |
| OpenClaw freeze викликає frustration у founder                             | Frame як «pause for 90 днів», не «delete». Roadmap залишається у репо, просто `Status: Parked`. Розблокується автоматично після `100 paying users`.         |
| Goal-first onboarding знижує initial engagement metric (D1 active modules) | A/B флаг `onboarding_v2` на 50% / 50% перші 2 тижні; rollback якщо `activation_v2` < `activation_v1` × 1.2.                                                 |
| EN-локаль ламає UA copy                                                    | i18n setup тільки для `/` + `/pricing` + paywall — НЕ для всього застосунку. Інші сторінки залишаються UA-only до окремої i18n-ініціативи.                  |
| Public metrics endpoint показує 0 / погані числа і шкодить бренду          | Дозволити `metrics.publicVisible = false` через env-flag; паблікувати тільки коли founder вирішить.                                                         |

## Фази та залежності (граф)

```
Фаза 0 (docs)
   │
   ├─→ Фаза 1.1 (ADR pricing) ─┐
   ├─→ Фаза 1.2 (ADR openclaw) │
   └─→ Фаза 1.3 (ADR mobile)   │
                               ↓
                          Фаза 2 (data layer)
                               │
                               ↓
                          Фаза 3 (stripe e2e)
                               │
                               ↓
                          Фаза 4 (paywall UI)
                               │
   Фаза 5.1 (activation v2) ───┤
                               ↓
                          Фаза 5.2 (onboarding pivot)
                               │
                               ↓
                          Фаза 6 (landing + metrics)
```

## Власник / ETA

- **Власник:** `@Skords-01`.
- **ETA:** 4 тижні (фаза 0 — поточний PR; фази 1–6 — 4 спринти по 1 тижню).
- **Sprint-cadence:** 1 спринт = 1 тиждень = ~3–4 PR-и (з cap 300 LOC коду на PR, окрім міграцій).

## Посилання

- **Аудит-сорс:** [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md).
- **Поточна pricing-модель (буде оновлена):** [`docs/launch/01-monetization-and-pricing.md`](../launch/01-monetization-and-pricing.md).
- **GTM (буде звужений):** [`docs/launch/02-go-to-market.md`](../launch/02-go-to-market.md).
- **Технічний skeleton білінгу:** [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md).
- **FTUX carry-over:** [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../audits/2026-05-03-ftux-onboarding-roast.md), [`docs/launch/ftux-sprint-plan.md`](../launch/ftux-sprint-plan.md).
- **Mobile picks:** [`docs/initiatives/0002-mobile-platform-decision.md`](./0002-mobile-platform-decision.md).
- **OpenClaw roadmap:** [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md).
- **Releases register (буде заповнюватись по PR):** TBD.
