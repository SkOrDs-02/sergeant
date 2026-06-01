# 0010 — Revenue-first launch: ship paid, focus wedge

> **Last validated:** 2026-06-01 by @Skords-01. **Next review:** 2026-08-30.
> **Status:** In progress — Phases 0+1+2+3+4.1+4.2+4.3+5.1+5.2+6(partial) done; Apple Sign-In + PricingPage portal link landed 2026-05-24 (this branch). Pending: founder adds APPLE\_\* env vars in Railway/local, EN locale (6)
> **Priority:** P0 (Sprint 1–4)
> **Owner:** `@Skords-01`
> **ETA:** 4 тижні (фаза 0 — поточний PR; фази 1–6 — 4 спринти по 1 тижню)
> **Sources:** [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md), [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md), [`docs/launch/business/02-go-to-market.md`](../launch/business/02-go-to-market.md), [`docs/launch/business/06-monetization-architecture.md`](../launch/business/06-monetization-architecture.md), [`docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`](../audits/archive/2026-05-03-ftux-onboarding-roast.md)
> **Canonical delivery owner:** [`docs/planning/pr-plan-revenue-2026-05.md`](../planning/pr-plan-revenue-2026-05.md). This initiative stays as decision frame/reference, not the live PR tracker.

## TL;DR

Sergeant має 0 paying users, 0 ₴ MRR, 0 рядків білінг-коду — і 7 467 рядків плану монетизації. Ця ініціатива фокусує наступні 4 тижні на **shipping реального білінгу (Stripe + Apple/Google/Email auth) + activation v2 (Mono-wedge) + публічного landing-у з EN-локаллю**. OpenClaw і `tools/openclaw` лишаються активними паралельно; mobile-strategy — Capacitor primary, Expo довершуємо нативку, обидва підтримуються. Перший PR (цей) — docs-only: фіксує decision-baseline (pricing v3, mobile-strategy ADR, ФОП-track, scope hero/insights як open-questions) і реєструє PR-план. Наступні PR-и реалізовують білінг від міграцій до Customer Portal-у і Apple/Google sign-in.

## Чому зараз

- **Ризик зволікання — death by 1000 docs.** За останні 90 днів злито 3 479 комітів і написано 56 466 рядків docs; жоден з них не приніс ₴1 виручки.
- **Конкуренти живі і ростуть.** personalEverything, LifeShift 360, Phaseo вже у проді з тим самим «all-in-one» value-prop. Кожен тиждень без launch — це CAC, який доведеться платити, щоб відіграти share.
- **Pricing-модель v1 економічно нежиттєздатна.** ₴99/міс при ≈$5/користувача API costs (Anthropic) = негативна gross margin на Pro tier. Це треба виправити **до** першого Stripe-чека, не після.
- **Технічний skeleton монетизації** [(`docs/launch/business/06-monetization-architecture.md`)](../launch/business/06-monetization-architecture.md) розписаний на 691 рядок без жодного рядка `subscriptions` SQL у `apps/server/src/migrations/`. Час перейти від v2-плану до коду.
- **High-friction signup.** Email + password + verify email — це 4 кроки, що дають ~30–50% drop-off на signup-екрані (industry baseline). Apple + Google sign-in (через Better Auth) знизять friction до ≤10%.
- **OpenClaw і `tools/openclaw` лишаються активними паралельно** до фази 6 — owner ухвалив, що NOT freeze. Просто не блокують revenue track. Mobile: Capacitor залишається primary до завершення Expo-нативки; обидва стеки підтримуються паралельно (рішення зафіксовано в ADR-0052 — фаза 1.2).

## Скоуп

**In:**

1. Зафіксувати рішення про pricing v3 (Free + Pro tier, **$7/міс / $49/рік, ₴ UA-only на старті**, видалити Plus + Lifetime + pay-per-feature; trial безкоштовний без прив'язки картки).
2. Зафіксувати mobile-strategy ADR: **Capacitor primary** до завершення Expo-нативки, обидва підтримуються паралельно (продовжує `0002-mobile-platform-decision`).
3. Реалізувати реальний білінг: `subscriptions` + Stripe webhook events table, Stripe SDK, `getUserPlan()` + `requirePlan()`, paywall UI, Stripe Checkout CTA, Customer Portal redirect. ФОП-оформлення — у планах власника, **готуємо інтеграцію припускаючи що ФОП буде до фази 3.1** (T-7 deadline у §Ризики).
4. Auth multi-provider: **Apple + Google + Email/password fallback** через Better Auth (фаза 4.3) — щоб мінімізувати signup friction перед launch-ем.
5. Activation v2 metric (Mono+5cat+1budget ≤72h) і **A/B тест** goal-first onboarding vs `vibe_picks` 2 тижні; переможений лишаємо у проді.
6. Реальний публічний лендинг (mini-product page + email capture) з трекінгом у PostHog + EN-локаль на `/` і `/pricing`.
7. Перенос `apps/console` → `tools/openclaw/` (ankle-PR scope `chore`, поза фазами 1–6) — щоб `apps/` чітко означало «product».

**Out:**

- **OpenClaw freeze / deprecate** — out of scope, працюємо паралельно (owner decision 2026-05-04).
- **Public metrics dashboard** (`/api/public/metrics`, MRR/WAU/D7) — out, відкладено до окремого decision власника.
- **Hero copy / positioning final pick** — out, винесено як [OPEN] у §Ризики; copy для лендингу формулюємо placeholder-ами в фазі 6.1, підставляємо фінальний варіант перед merge.
- **3 cross-module AI insights pick** — out, винесено як [OPEN] у §Ризики (брейншторм окремо, кандидати в audit-сорсі).
- **Бренд-зміна / rename з «Sergeant»** — out, окрема ініціатива (винесено як [OPEN] у §Ризики).
- LiqPay/Paddle/Fondy інтеграції — слідують за Stripe MVP (наступна ініціатива).
- B2B / corporate / marketplace треки — out, не зараз.
- Mass-видалення docs / playbooks — окремий cleanup, не блокуючий launch.
- Apple App Store / Play Store submission — слідує за веб-launch + 50 paid (наступна ініціатива).
- Mobile-stack deprecate — Capacitor + Expo обидва живуть до окремого decision (NOT в цій ініціативі).

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

### Фаза 1 — pricing & mobile ADR-и (2 PR)

#### PR 1.1 `docs-adr-pricing-v3` (scope: `docs`)

- [`docs/adr/0051-pricing-v3-single-tier.md`](../adr/0051-pricing-v3-single-tier.md) — ADR про перехід на 2-тірну модель: **Free + Pro $7/міс / $49/рік, ₴ UA-only на старті, trial безкоштовний без прив'язки картки.**
- Оновити `docs/launch/business/01-monetization-and-pricing.md` — додати «Update 2026-05-XX: pricing v3 затверджено» зі статусом «Superseded by ADR-0051» на застарілих секціях (Plus tier, Lifetime ₴2999, pay-per-feature).
- Додати freshness-update header.

**Залежить від:** Фаза 0.

**Acceptance:** ADR-0051 з `Status: Accepted`, lint:governance-sync зелений, governance-matrix оновлено.

#### PR 1.2 `docs-adr-mobile-strategy` (scope: `docs`)

- [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../adr/0052-mobile-strategy-capacitor-primary.md) — продовжує `0002-mobile-platform-decision`: **Capacitor — primary** mobile-shell до завершення Expo-нативки; **обидва стеки підтримуються паралельно**, deprecate жодного. Конкретний рішення «коли Expo стане primary» — окремий ADR пізніше (триггер: Expo має feature parity з web).
- Оновити `docs/initiatives/archive/_0002-mobile-platform-decision.md` — додати «Update 2026-05-04: рішення владника не deprecate, а підтримувати обидва паралельно. Capacitor primary до Expo feature-parity.»

**Залежить від:** Фаза 0.

**Acceptance:** ADR-0052 з `Status: Accepted`, `apps/mobile/README.md` і `apps/mobile-shell/README.md` мають freshness-header з рішенням.

> **Зняте з фази 1:** ADR про OpenClaw park (раніше зарезервований у драфті як 0046, але цей номер тепер зайнятий ADR-0046 «Storybook visual regression scope») — owner ухвалив працювати паралельно. Якщо в майбутньому стане очевидним, що OpenClaw блокує revenue, переоцінимо окремою ініціативою (новий ADR-номер виділимо тоді ж через `pnpm gen:adr`).

#### Ankle-PR (поза фазою 1, scope: `chore`)

`chore-console-move-to-tools` — переніс `apps/console/` → `tools/openclaw/`. Сигналізує «це internal tool, не product». Maintenance — той самий. ~1 година роботи.

**Status:** `done` — реалізовано у [#1792](https://github.com/Skords-01/Sergeant/pull/1792) (`856ea440 chore(root): move apps/console to tools/openclaw (0010 ankle-PR)`). `apps/console/` зник з `apps/`, `tools/openclaw/` додано до `pnpm-workspace.yaml`, `.github/CODEOWNERS` оновлено (`/apps/console/src/agents/` → `/tools/openclaw/src/agents/`). NPM-package name (`@sergeant/openclaw`) НЕ змінювався — лише monorepo placement. Railway service був перейменований `sergeant-hubchat` → `sergeant-openclaw` пізніше у PR-47 (Pain P10, telegram-improvements-roadmap §C.5). Локальна верифікація з PR-опису: `pnpm typecheck` (root, `turbo run typecheck`) — 16/16 task-ів, 0 errors.

**Acceptance:** `apps/console/` зник, `tools/openclaw/` працює (CI зелений), CODEOWNERS оновлено.

---

### Фаза 2 — billing data layer (2 PR)

#### PR 2.1 `feat-migrations-subscriptions-and-stripe-events` (scope: `migrations`)

- `apps/server/src/migrations/<047_subscriptions>.sql` (новий):
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
- `apps/server/src/migrations/<048_stripe_webhook_events>.sql` (новий):
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

### Фаза 4 — paywall UI + Pricing + Auth multi-provider (3 PR)

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
- **Pricing — ₴ UA-only на старті (без USD/EUR auto-detect — out of scope для MVP).**
- PostHog події: `PRICING_VIEWED`, `PRICING_CTA_CLICKED`, `CHECKOUT_OPENED`.

**Залежить від:** PR 4.1.

**Acceptance:**

- E2E happy-path: visit /pricing → click CTA → land on Stripe Checkout (test mode) → return → plan = pro.
- a11y axe-core зелений.

#### PR 4.3 `feat-web-auth-multi-provider` (scope: `web`)

- Better Auth wiring: **Apple Sign-In + Google Sign-In + Email/password fallback** на `/sign-in` і `/sign-up`.
  - Apple: native `Sign in with Apple` (web + mobile-shell).
  - Google: OAuth one-click.
  - Email/password: лишається як fallback для юзерів без Apple/Google.
- ENV: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_PRIVATE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Better Auth playbook: `.agents/skills/better-auth-best-practices/SKILL.md` (canonical recipe — слідуємо точно).
- PostHog події: `SIGNUP_PROVIDER_SELECTED`, `SIGNUP_COMPLETED` з `provider` dimension.

**Залежить від:** PR 4.2 (можна паралельно, мінімум).

**Acceptance:**

- 3 sign-in кнопки на `/sign-in`, активна перша яку вибирає юзер.
- E2E: новий юзер може sign-up через Google за ≤3 кліки і потрапити на dashboard < 5 секунд.
- Drop-off на signup ≤15% (PostHog funnel — measure 7 днів після production rollout).
- Better Auth migrations застосовані (Apple/Google provider tables).

---

### Фаза 5 — activation pivot до Mono-wedge (2 PR)

#### PR 5.1 `feat-insights-activation-v2` (scope: `insights`)

- Нова метрика `activation_v2` = `Mono connected ≥1 + ≥5 transactions categorized + ≥1 budget set ≤72h`.
- Pure-function в `packages/insights/src/<activation>.ts` + tests.

**Залежить від:** Фаза 0 (можна паралельно з фазою 2).

#### PR 5.2 `feat-web-onboarding-goal-first-ab-test` (scope: `web`)

- **A/B тест 50/50** через PostHog feature flag `onboarding_v2`:
  - **Variant A (control):** поточний `vibe_picks` flow (без змін).
  - **Variant B (test):** goal-first single-screen wizard: «Яку фінансову мету хочете досягти?» (3 варіанти: «Зекономити ₴X», «Стати фінансово грамотним», «Контролювати витрати») → одразу Mono OAuth + 5 categorize → dashboard.
- Перенести fitness/nutrition/routine модулі в «cross-sell» картки на dashboard (для обох variants).
- PostHog події: `ACTIVATION_V2_HIT`, `ONBOARDING_GOAL_PICKED`, `ONBOARDING_VIBE_PICKED` з dimension `variant`.
- Carry-over від [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) S5.
- **Decision rule (через 2 тижні після rollout):** залишити variant з вищим `activation_v2` rate. Втрачений variant видалити окремим cleanup-PR.

**Залежить від:** PR 5.1.

**Acceptance:**

- E2E (для variant B): новий юзер може досягти `activation_v2` за ≤4 хвилини (рекординг tester-сесії).
- A/B feature flag активний; PostHog dashboard показує обидва flows.

---

### Фаза 6 — публічний лендинг + EN locale (1 PR)

#### PR 6.1 `feat-web-landing-and-en-locale` (scope: `web`)

- `apps/web/src/core/<Landing>.tsx` (route `/`, новий) — hero **{HERO_PLACEHOLDER}** (фінальний copy — open question, обираємо перед merge: див. §Ризики «Hero positioning»). Кандидати: «Український Mono + AI fin-coach», «AI-щоденник, який знає вашу мету», «Mono → інсайти за 30 секунд», «Замініть 5 додатків одним». До фінального вибору shipимо placeholder + email capture.
- 1 demo GIF + email capture → PostHog `LANDING_EMAIL_CAPTURED`.
- EN-локаль для `/`, `/pricing`, paywall — мінімальний i18n setup (react-i18next або lingui — рішення в окремому ADR-0053 у скоупі цього PR).
- Sitemap + robots.txt + OG-image.

**Залежить від:** PR 4.2.

**Acceptance:**

- Lighthouse ≥ 90 у performance/a11y/SEO.
- `lang="uk"` / `lang="en"` коректно підтягуються.
- Email capture → PostHog `LANDING_EMAIL_CAPTURED` event.
- Hero copy фіналізований owner-ом перед merge (без placeholder-у).

> **Знято з фази 6:** PR 6.2 (public metrics dashboard) — owner ухвалив відкласти. Endpoint може бути додано окремою ініціативою пізніше.

---

## Критерії DONE (вся ініціатива)

- [x] PR-и фази 0 і фази 1 змерджені ([#2080](https://github.com/Skords-01/Sergeant/pull/2080)).
- [ ] PR-и фаз 2–6 змерджені.
- [ ] Перший Stripe webhook у проді записаний у `webhook_events` (source='stripe').
- [ ] Перший платний користувач: `subscriptions.plan = 'pro'` AND `subscriptions.status IN ('active','trialing')` AND `subscriptions.current_period_end > NOW()`. (Canonical table — m056; legacy `billing_subscriptions` (m047) — orphan, без writers, не використовуй у verification queries.)
- [ ] `/pricing` показує реальні CTA → Stripe Checkout (не waitlist), test mode + live mode обидва зелені у smoke-e2e. **₴ UA-only.**
- [x] Google + Email + Apple sign-in реалізовані: `GoogleSignInButton.tsx` + `AppleSignInButton.tsx` + Better Auth providers. Apple provider **є** у `auth.ts` (`generateAppleClientSecret()` ES256 + `getSocialProviders()` реєструє `config.apple` за наявності `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`, `appleid.apple.com` у `trustedOrigins`). Лишається тільки **операційна** дія founder-а — APPLE\_\* env vars у Railway (не код).
- [x] Mobile-strategy ADR-0052 із `Status: Accepted` (Capacitor primary, Expo paralleled, обидва підтримуються).
- [x] `activation_v2` доступна: `evaluateActivationV2()` у `packages/insights/src/activation.ts` + PostHog wire у Phase 5.2.
- [x] A/B тест goal-first vs `vibe_picks` реалізовано: `GoalFirstScreen.tsx` (49 рядків), `onboardingGoalFirst.ts` (50/50 PostHog experiment), events `ONBOARDING_GOAL_FIRST_SHOWN`/`ONBOARDING_GOAL_FIRST_PICKED`/`ONBOARDING_VIBE_PICKED`. Rollout + decision pending.
- [~] Лендинг `LandingPage.tsx` (260 рядків) виконує маршрут `/` для неавторизованих users. **Sitemap/robots.txt — shipped** (`apps/web/public/sitemap.xml` + `apps/web/public/robots.txt`). i18n foundation теж є (`shared/i18n/en.ts` + `useLocale.ts` + resolver), але **сам LandingPage ще не зведено на `useLocale`** (hardcoded `uk`) — це лишається єдиним відкритим Phase 6 пунктом.
- [ ] Усі PR-и пройшли CI зелено + a11y axe-core + Lighthouse budget.
- [x] Нові docs (ADR-0051, ADR-0052, initiative, mobile READMEs) мають freshness header + Status badge.
- [x] `docs/launch/business/01-monetization-and-pricing.md` оновлено: §2.2/§2.3 Superseded by ADR-0051; pricing v3 зафіксовано.
- [x] Ankle-PR `chore-console-move-to-tools` змерджено (`apps/console/` → `tools/openclaw/`).

## Метрики успіху (вимірюються через 30 днів після фази 6)

| Метрика                                | Поріг go/no-go         | Target | Джерело                       |
| -------------------------------------- | ---------------------- | ------ | ----------------------------- |
| Перший платний (`provider='stripe'`)   | ≥ 1                    | ≥ 10   | SQL `subscriptions`           |
| Activation rate (v2)                   | ≥ 15 %                 | ≥ 30 % | PostHog funnel                |
| Days to first paid                     | ≤ 28                   | ≤ 14   | calendar                      |
| `/pricing` → checkout open conversion  | ≥ 5 %                  | ≥ 12 % | PostHog                       |
| Stripe webhook idempotency violations  | 0                      | 0      | `stripe_webhook_events` audit |
| Signup drop-off (Apple/Google/Email)   | ≤ 15 %                 | ≤ 8 %  | PostHog funnel                |
| PH-launch readiness (paying + reviews) | 50 paying + 20 reviews | —      | manual audit pre-launch       |

## Ризики та мітигація

| Ризик                                                                                                       | Owner        | Мітигація                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[BLOCKER ФАЗИ 3]** ФОП ще не оформлений, Stripe потребує юрособу                                          | `@Skords-01` | Готуємо інтеграцію припускаючи що ФОП буде до фази 3.1 (deadline T-7 від merge PR 2.2). Owner відкриває ФОП паралельно. Якщо не встигаємо — фази 3+ затримуються до оформлення.                                                                                                                                                                                                                                                                                                 |
| Webhook delivery flakey у тесті                                                                             | dev          | `stripe trigger` локально + nock cassettes у CI. Production — exponential backoff на own retry queue.                                                                                                                                                                                                                                                                                                                                                                           |
| Apple/Google sign-in потребує developer accounts + verification                                             | `@Skords-01` | Apple Developer ($99/рік) + Google Cloud Console (free) — оформляємо паралельно з фазою 3. Без цього фаза 4.3 не може shipитись у production (можна shipити email-only first).                                                                                                                                                                                                                                                                                                  |
| Goal-first onboarding знижує initial engagement metric (D1 active modules)                                  | dev          | A/B флаг `onboarding_v2` на 50% / 50% перші 2 тижні; rollback якщо `activation_v2` < `activation_v1` × 1.2.                                                                                                                                                                                                                                                                                                                                                                     |
| EN-локаль ламає UA copy                                                                                     | dev          | i18n setup тільки для `/` + `/pricing` + paywall — НЕ для всього застосунку. Інші сторінки залишаються UA-only до окремої i18n-ініціативи.                                                                                                                                                                                                                                                                                                                                      |
| **[OPEN]** Hero positioning final pick (Mono+AI / goal-first / 5-apps-in-one ...)                           | `@Skords-01` | Placeholder copy у фазі 6.1 PR; final copy обирається owner перед merge. Якщо не вирішено — лишаємо «Український Mono + AI fin-coach» як safe default.                                                                                                                                                                                                                                                                                                                          |
| **[OPEN]** Назва «Sergeant» rename track                                                                    | `@Skords-01` | Open question, не блокує цю ініціативу. Пропозиції в audit-сорсі (Tracker, Compass, Anchor, Cabinet, etc.). Окрема ініціатива в Q4 2026 (за бажанням).                                                                                                                                                                                                                                                                                                                          |
| **[OPEN]** 3 cross-module AI insights pick                                                                  | `@Skords-01` | Брейншторм окремо post-launch. Кандидати в audit-сорсі. Не блокує фази 1–6.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **[DEFERRED]** Public metrics dashboard (`/api/public/metrics`)                                             | `@Skords-01` | Out of scope цієї ініціативи. Окрема decision коли і чи публікувати MRR/WAU/D7. Endpoint може бути доданий пізніше.                                                                                                                                                                                                                                                                                                                                                             |
| **[DEFERRED]** Mobile-stack deprecate (Capacitor vs Expo final pick)                                        | `@Skords-01` | Обидва підтримуються паралельно у цій ініціативі. Окремий decision коли Expo матиме feature parity з web (триггер: `apps/mobile` MAU > `apps/mobile-shell` MAU 30 днів поспіль).                                                                                                                                                                                                                                                                                                |
| **[ACTIVE PARALLEL]** OpenClaw v0 / `tools/openclaw` як Telegram bot                                        | `@Skords-01` | NOT freeze. Працює паралельно з revenue track. Не блокує фази 1–6, але і не in-scope (developer time на нього не з cap-у цих 4 тижнів).                                                                                                                                                                                                                                                                                                                                         |
| **[HYGIENE]** Orphan billing table `billing_subscriptions` (m047)                                           | dev          | Audit-verified 2026-05-25 (#3109): m047 — orphan (0 writers, 0 readers у production code). Все billing йде через m056 `subscriptions` (canonical, multi-provider, `plan IN ('free','pro')`). Жодного functional hazard-у — paid user НЕ може silently виглядати free бо writer-ів m047 не існує. M070 enum patch що BA-council радив — НЕ потрібен (m056 уже має `'free'`). Лишається тільки technical debt cleanup: двофазовий DROP m047 — пост-launch ADR (не блокує launch). |
| **[CONVERSION]** Stripe Checkout / email receipts за замовчуванням англійською, ADR-0051 фіксує UA-only MVP | dev          | Перевірити Stripe Dashboard → Settings → Branding → Localization до Фази 3.1: чи `locale: 'uk'` підтримується в Checkout Session (per [Stripe locales doc](https://docs.stripe.com/api/checkout/sessions/create)). Якщо ні — або примусово EN на Checkout (плюс UA-помітка на /pricing що checkout англійською), або відкласти EN-locale launch і shipити з EN checkout. Гірше за все: випустити UA-only landing з EN-only checkout без явного попередження юзера.              |

## Фази та залежності (граф)

```
Фаза 0 (docs — цей PR)
   │
   ├─→ Фаза 1.1 (ADR pricing v3)         ─┐
   └─→ Фаза 1.2 (ADR mobile-strategy)     │
                                          ↓
                                     Фаза 2 (data layer)
                                          │
                                          ↓
                                     Фаза 3 (stripe e2e)
                                          │
                                          ├─→ Фаза 4.1 (paywall + plan hooks)
                                          ├─→ Фаза 4.2 (real /pricing)
                                          └─→ Фаза 4.3 (Apple/Google/Email auth) ──┐
                                                                                  │
   Фаза 5.1 (activation v2 metric) ─────────────────────────────────────┐         │
                                                                        ↓         ↓
                                                                  Фаза 5.2 (A/B onboarding)
                                                                        │
                                                                        ↓
                                                                  Фаза 6 (landing + EN)

Ankle-PR (поза фазами 1–6, scope: chore):
   chore-console-move-to-tools  ←  apps/console/ → tools/openclaw/
```

## Власник / ETA

- **Власник:** `@Skords-01`.
- **ETA:** 4 тижні (фаза 0 — поточний PR; фази 1–6 — 4 спринти по 1 тижню).
- **Sprint-cadence:** 1 спринт = 1 тиждень = ~3–4 PR-и (з cap 300 LOC коду на PR, окрім міграцій).

## Посилання

- **Аудит-сорс:** [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md).
- **Поточна pricing-модель (буде оновлена):** [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md).
- **GTM (буде звужений):** [`docs/launch/business/02-go-to-market.md`](../launch/business/02-go-to-market.md).
- **Технічний skeleton білінгу:** [`docs/launch/business/06-monetization-architecture.md`](../launch/business/06-monetization-architecture.md).
- **FTUX carry-over:** [`docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`](../audits/archive/2026-05-03-ftux-onboarding-roast.md), [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md).
- **Mobile picks:** [`docs/initiatives/archive/_0002-mobile-platform-decision.md`](./archive/_0002-mobile-platform-decision.md).
- **Better Auth playbook:** [`.agents/skills/better-auth-best-practices/SKILL.md`](../../.agents/skills/better-auth-best-practices/SKILL.md).
- **OpenClaw roadmap (active parallel, not in scope):** [`docs/launch/tech/openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md).
- **Releases register (буде заповнюватись по PR):** TBD.

---

## Outcome (поточний стан — оновлюється по мірі merge)

### Phase 0 + Phase 1 + Phase 5.1 — DONE (2026-05-06)

**PR:** [#2080](https://github.com/Skords-01/Sergeant/pull/2080) `feat(docs): phase 0+1 revenue launch — ADR-0051 pricing v3, ADR-0052 mobile strategy, activation_v2`

Що зроблено:

- **ADR-0051** ([`docs/adr/0051-pricing-v3-single-tier.md`](../adr/0051-pricing-v3-single-tier.md)) — `Status: Accepted`. Free + Pro $7/міс / $49/рік, ₴ UA-only на старті, trial 7 днів без картки. Plus tier / Lifetime / pay-per-feature — out of scope MVP.
- **ADR-0052** ([`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../adr/0052-mobile-strategy-capacitor-primary.md)) — `Status: Accepted`. Capacitor primary до Expo feature parity; обидва стеки паралельно; sunset T₀/T₁/T₂ — не active commitments. Тригер наступного ADR: ≥18/22 рядків матриці `docs/architecture/platforms.md` = ✅.
- `docs/launch/business/01-monetization-and-pricing.md` — Update header: §2.2 і §2.3 позначено «Superseded by ADR-0051».
- `docs/initiatives/archive/_0002-mobile-platform-decision.md` — owner decision note, ADR-0052 supersedes sunset-direction.
- `apps/mobile/README.md`, `apps/mobile-shell/README.md` — freshness headers + посилання на ADR-0052.
- **`packages/insights/src/activation.ts`** — `evaluateActivationV2()` pure function (Phase 5.1). Умови: Mono ≥1 + ≥5 categorized txn + ≥1 budget ≤72h від signup. 10 unit-тестів, 80/80 passed.

---

### Phase 2 + Phase 3 (backend) — PARTIAL (2026-05-07)

Billing backend реалізовано поза plan-документом; код у репо випереджає описану тут фазу 2.

Що є в коді:

- `apps/server/src/migrations/047_billing_subscriptions.sql` — таблиця `billing_subscriptions` (schema: `billing_subscriptions`, не `subscriptions` як у plan — backward-compatible, webhook idempotency через існуючу `webhook_events` з migration 011).
- `apps/server/src/modules/billing/stripe.ts` — `createCheckoutSession`, `getSubscriptionStatus`, `processStripeWebhook`, `verifyStripeSignature`.
- `apps/server/src/routes/billing.ts` — `POST /api/billing/checkout`, `GET /api/billing/status`, `POST /api/billing/stripe-webhook`.
- `apps/server/src/routes/internal/billing.ts` — `POST /api/internal/billing/upgrade`, `POST /api/internal/billing/downgrade`.
- `packages/api-client/src/endpoints/billing.ts` — `createCheckout`, `status`.
- `apps/server/src/modules/billing/requirePlan.ts` — Express middleware, 402 на locked routes (bypassed поки `STRIPE_ENABLED !== "true"`).
- `apps/server/src/modules/billing/effectiveLimits.ts` — квоти per plan (free: 5 AI req/day; pro: unlimited).

Що відсутнє з фаз 2–3:

- `POST /api/billing/portal` (Customer Portal) — Phase 3.1.
- `openCustomerPortal` в api-client — Phase 3.3.

### PricingPage — оновлено (2026-05-07)

- `apps/web/src/core/PricingPage.tsx` — ADR-0051 2-тір: Free + Pro ($7/міс, $49/рік, 7-денний trial). Plus tier прибрано. `CHECKOUT_OPENED` PostHog-event додано.
- `packages/shared/src/lib/analyticsEvents.ts` — `CHECKOUT_OPENED` зареєстровано.

### Trial-banner ✅ (2026-05-13)

- `apps/web/src/core/billing/TrialBanner.tsx` (new) — читає `usePlan()`, рендерить інлайн-банер для `subscription.status === 'trialing'` коли `daysLeft ≤ 7`; ≤ 1 день → sticky-варіант з акцентом. CTA → `/pricing?source=trial_banner`. A11y `role="status"` + `aria-live="polite"`. Touch-target 44×44 через `<Button size="sm">`. Mounted у `HubMainContent` banner stack за існуючим `!inFtuxSession`-гейтом.
- Тести: `apps/web/src/core/billing/TrialBanner.test.tsx` (8 тестів — loading / free / active / >7d / 3d inline / 1d sticky / 0d past-due / CTA navigation).
- Закриває audit-item `P1-9` у [`docs/audits/2026-05-13-revenue-monetization-roast.md`](../audits/2026-05-13-revenue-monetization-roast.md).

**Наступний крок:** `POST /api/billing/portal` (Phase 3.1) → `usePlan()` + `PaywallModal` (Phase 4.1) → real `/pricing` з portal link (Phase 4.2).

### Phase 2 + Phase 3 (backend) — COMPLETE (2026-05-18)

Доповнення до PARTIAL статусу від 2026-05-07:

- `POST /api/billing/portal` — реалізовано у `apps/server/src/routes/billing.ts` (rate-limited, requireSession, `NoBillingCustomerError` → 409, `BillingConfigurationError` → 503).
- `createCustomerPortalSession` у `apps/server/src/modules/billing/stripe.ts` — lookup по `provider_customer_id` з `subscriptions` WHERE status IN ('active','trialing','past_due'), створює Stripe Portal Session, return_url → `/settings?billing=portal-return`.
- `createPortal` у `packages/api-client/src/endpoints/billing.ts` — `POST /api/billing/portal`, schema-validated via `BillingPortalResponseBodySchema`.

### Phase 4.1 — usePlan + PaywallModal ✅ (2026-05-18)

- `apps/web/src/core/billing/usePlan.ts` — RQ hook через `billingKeys.plan()`.
- `apps/web/src/core/billing/PaywallModal.tsx` — generic paywall з CTA → Checkout.
- Tests: `usePlan.test.tsx`, `PaywallModal.test.tsx`.

### Phase 4.3 (partial) — Google Sign-In ✅ (2026-05-18)

- `apps/web/src/core/auth/GoogleSignInButton.tsx` — "Увійти через Google" (SVG icon, Ukrainian copy).
- `apps/server/src/auth.ts` — `getSocialProviders()` conditionally registers Google via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Graceful fallback if env vars missing.
- Apple Sign-In — **pending** (немає `APPLE_CLIENT_ID` у env schema, немає Apple provider у `auth.ts`).

### Phase 5.2 — A/B goal-first onboarding ✅ (2026-05-18)

- `packages/shared/src/lib/onboardingGoalFirst.ts` — `ONBOARDING_GOAL_FIRST_EXPERIMENT` (50/50, variants `["control", "goal_first"]`). Assignment у `useOnboardingWizardState.ts`.
- `apps/web/src/core/onboarding/GoalFirstScreen.tsx` — 4-outcome grid (finyk / fizruk / routine / nutrition). Fires `ONBOARDING_GOAL_FIRST_SHOWN` + `ONBOARDING_GOAL_FIRST_PICKED`.
- Control flow: `vibe_picks` → `ONBOARDING_VIBE_PICKED` (існуючий flow, незмінений).
- Tests: `OnboardingWizard.goalFirst.test.tsx` — confirm experiment assignment via `overrideVariant()`.
- **Наступний крок:** моніторинг `activation_v2` rate по variants у PostHog, decision rule через 2 тижні після production rollout.

### Phase 4.2 residual — PricingPage Customer Portal link ✅ (2026-05-24)

- `apps/web/src/core/PricingPage.tsx` — для активного Premium-підписника Premium-CTA тепер веде у Stripe Customer Portal через `billingApi.createPortal()` → `window.location.assign(url)`. CTA-label switch: `Спробувати Premium` (free) → `Керувати підпискою` (subscriber). `PRICING_CTA_CLICKED` event отримав варіант `{ cta: "stripe_portal" }`. 409 `NO_BILLING_CUSTOMER` → message «Не знайдено платіжний профіль Stripe…»; 503 `BILLING_UNAVAILABLE` → нейтральний fallback.
- `apps/web/src/core/PricingPage.test.tsx` — `+3 тести` (renders 'Керувати підпискою' for active subscriber / opens portal on click / 409 specific message). Mock-и розширені на `billingApi.createPortal` + parameterized `billingApi.status`.

### Phase 4.3 (complete) — Apple Sign-In ✅ (2026-05-24)

- `apps/server/src/auth.ts` — `getSocialProviders()` async; додано Apple provider config з runtime-генерацією JWT `client_secret` (ES256, 180-day expiry, через `jose.importPKCS8` + `SignJWT`). Вмикається коли всі 4 env-и задані; misformatted `.p8` → `logger.error("auth.apple.client_secret.generate_failed")` + fail-open (Google + email продовжують працювати). `https://appleid.apple.com` доданий у `trustedOrigins` (Apple form-posts callback з цього origin).
- `apps/web/src/core/auth/AppleSignInButton.tsx` (new) — дзеркалить `GoogleSignInButton.tsx` shape (variant=secondary, size=lg, w-full).
- `apps/web/src/core/auth/AuthContext.tsx` — `loginWithApple()` (mirrors `loginWithGoogle`); `AuthContextValue` extended.
- `apps/web/src/core/auth/AuthPage.tsx` — Apple-кнопка під Google у `space-y-3` stack; `handleGoogleSignIn` + `handleAppleSignIn` тепер обидва fire `SIGNUP_PROVIDER_SELECTED` з `provider + surface` payload перед редіректом (drop-off split per provider у PostHog).
- Tests: `AuthContext.test.tsx` +2 (delegates / error), `AuthPage.test.tsx` mock extended, `auth.test.ts` +3 (Apple вимкнений без full quartet / fail-open on bad key / trustedOrigins).

**Founder action — Apple env vars** (потрібні в Railway + локально у `.env`):

| Env var                       | Source                                                                                                      | Required                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `APPLE_CLIENT_ID`             | Apple Developer → Certificates, Identifiers & Profiles → **Services ID** (наприклад `com.sergeant.app.web`) | yes                                     |
| `APPLE_TEAM_ID`               | Apple Developer → Membership → **Team ID** (10 символів)                                                    | yes                                     |
| `APPLE_KEY_ID`                | Apple Developer → Keys → **Sign In with Apple key** → 10-символьний Key ID                                  | yes                                     |
| `APPLE_PRIVATE_KEY`           | Зміст `.p8` файлу (PEM, з `-----BEGIN PRIVATE KEY-----` headers, реальні `\n` newlines)                     | yes                                     |
| `APPLE_APP_BUNDLE_IDENTIFIER` | Bundle ID iOS app (`com.sergeant.app`)                                                                      | only for native Capacitor ID-token flow |

**Apple Developer Console setup** (одноразово):

1. Apple Developer Program — $99/рік (вже зафіксовано в §Ризики).
2. Identifiers → + → **Services IDs** → registry `com.sergeant.app.web` → enable «Sign In with Apple» → configure: Primary App ID = bundle id; Domains = `<prod-API-domain>`; Return URLs = `https://<api-domain>/api/auth/callback/apple` (+ `http://localhost:5000/api/auth/callback/apple` для dev).
3. Keys → + → enable «Sign In with Apple» → download `.p8` (один раз!). Зберегти Key ID.
4. Railway → service `sergeant-api` → Variables → додати 4 env-и (для multi-line `.p8`: paste з реальними newlines).

Without env vars: сервер логує warn-free start (Apple branch silently skipped), фронт-кнопка "Увійти через Apple" летить у `PROVIDER_NOT_FOUND` → перекладений `authError` «Цей спосіб входу не підключено».

### Phase 6 (partial) — Landing page ✅ / EN locale + sitemap ❌ (2026-05-18)

- `apps/web/src/core/LandingPage.tsx` — 260 рядків. Hero section, 3-feature grid, waitlist email capture (source=landing), pricing CTA. Fires `LANDING_VIEWED` + `LANDING_EMAIL_CAPTURED`. `locale: "uk"` hardcoded.
- Route `/`: authenticated users → Hub; non-auth → LandingPage (gated у `StandaloneRoutes.tsx`).
- **Pending:** EN-локаль (uk.ts існує, i18n config відсутній); sitemap.xml + robots.txt (тільки security.txt у apps/web/public/); Customer Portal link у PricingPage для Pro users.
