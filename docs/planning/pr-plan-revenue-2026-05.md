# PR-план revenue + monetization (2026-05)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

PR-план виконавчих кроків, що закриває outstanding-items з двох прожарок revenue + monetization. Скоуп — `apps/web` paywall/billing surface, `apps/server` billing module, лендинг і pricing-experimentation guardrails. Цей файл не дублює існуючий 48-PR ops-план у [`pr-plan-2026-05.md`](./pr-plan-2026-05.md) — він фокусується вузько на revenue surface (Stripe checkout/webhook lifecycle, paywall gates, plan-aware UI, landing/EN, A/B harness).

## Cross-refs

- **Source roast (поточна):** [`docs/audits/2026-05-13-revenue-monetization-roast.md`](../audits/2026-05-13-revenue-monetization-roast.md) — viewer-facing inventory P0/P1/P2 з 6 closed-у-PR і 16 outstanding-items.
- **Source roast (попередня, baseline):** [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md) — «56 k LOC docs / 0 paying users», wedge-позиціонування, owner-decisions (pricing v3, Apple+Google+Email auth, activation v2, no OpenClaw freeze).
- **Initiative tracker:** [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md) — 6-фазний план; Phase 0–5.1 done, Phase 2/3 active.
- **ADR-0001:** [`docs/adr/0001-monetization-architecture.md`](../adr/0001-monetization-architecture.md) — 16 архітектурних рішень (Stripe primary, single-row-per-user `subscriptions`, RQ `staleTime: 60s`, idempotency keys, webhook retention, dunning, proration, observability/SLO).
- **ADR-0051:** [`docs/adr/0051-pricing-v3-single-tier.md`](../adr/0051-pricing-v3-single-tier.md) — Free + Pro, $7/міс або $49/рік, ₴ UA-only на старті, 7-day trial без картки.
- **apps/web paywall/billing surface (статус 2026-05-13):**
  - `apps/web/src/core/billing/usePlan.ts` (shipped) — `useQuery(billingKeys.status)` → `{ plan, isPro, isLoading, subscription }`.
  - `apps/web/src/core/billing/PaywallModal.tsx` (shipped) — fires `PAYWALL_VIEWED`, CTA → `/pricing?source=paywall`.
  - `apps/web/src/core/billing/index.ts` (shipped) — barrel re-exports.
  - `apps/web/src/shared/lib/api/queryKeys.ts` (`billingKeys` factory, lines 101–111) — Hard Rule #2 ✓.
  - `apps/web/src/core/PricingPage.tsx` — 2-tier UI, PostHog `PRICING_VIEWED` instrumented, `WaitlistForm` ще присутній (тимчасово до P1-8 PR-3 нижче).
  - **Gaps:** немає `TrialBanner`, немає `PlanSection` у Settings, немає paywall-integration points у `core/chat/ChatInput.tsx` / finyk Mono hooks, немає Customer Portal endpoint, немає `?checkout=success` обробки.
- **apps/server billing surface (статус 2026-05-13):**
  - `apps/server/src/modules/billing/stripe.ts` (shipped) — checkout, webhook (`subscription_started` / `subscription_renewed` / `subscription_canceled` lifecycle ✓).
  - `apps/server/src/modules/billing/getUserPlan.ts`, `requirePlan.ts`, `effectiveLimits.ts` (shipped).
  - `apps/server/src/routes/billing.ts` — `POST /api/billing/checkout`, `POST /api/billing/webhook`. **Gap:** немає `POST /api/billing/portal`.
  - `apps/server/src/config/env.ts` — Stripe `secret_key` ✓, але `price_id` ще ad-hoc (P0-7 gap).

## TL;DR

10 PR-карток (1 XS quick-win + 4 P0 + 4 P1 + 2 P2), які закривають **усі outstanding P0/P1-items** з [`2026-05-13-revenue-monetization-roast.md`](../audits/2026-05-13-revenue-monetization-roast.md) і **bridge-items** з [`2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md), які лишилися як `[OPEN]` після owner-decisions. P0 — funnel hard-fails (Customer Portal, env-validation, paywall-gates, `?checkout=success`). P1 — funnel quality (activation v2 capture, landing, EN locale, LiqPay placeholder, TrialBanner full). P2 — post-launch polish (Revenue dashboards, annual billing toggle).

Targeted impact (за PR-2 ... PR-10, після baseline-instrumentation з XS PR-1):

- **Trial → paid conversion baseline → +X%** через TrialBanner (PR-1), checkout-return-handler (PR-3), paywall-integration points (PR-4) і landing-page email-capture funnel (PR-6).
- **ARPU baseline → +Y%** через annual-billing toggle (PR-10, після PR-8 LiqPay scaffold для UA-ринку).
- **Churn baseline → -Z%** через Customer Portal self-serve cancel (PR-2) — знижує chargeback-rate і скорочує час «soft-cancel before pay-period» recovery flow.

> Конкретні X/Y/Z — fill-in після pre-test baseline measurement (див. §Pricing experimentation guardrails нижче). До launch-у baseline ≈ 0 paying users — числа тримаємо як placeholders, замінюємо на реальні значення у Phase 1 (перші 10 paying).

## Конвенції

- Гілки: `devin/$(date +%s)-<short-name>` (AGENTS.md).
- RQ-ключі — лише через `billingKeys` factory (Hard Rule #2).
- Кожен PR оновлює `apps/web/src/shared/i18n/uk.ts`, якщо додає UA-літерали (Hard Rule #15 + ESLint `sergeant-design/no-cyrillic-jsx-literal`).
- Розмір (XS/S/M/L/XL): XS = ½ дня, S = 1 день, M = 2–3 дні, L = 4–7 днів, XL = тиждень+.
- Owner: **`@Skords-01`** (єдиний owner до моменту делегування — AGENTS.md `Secondary: TBD`). Per-PR placeholder нижче — у разі делегування заміни на реальний handle.
- Pre-commit: Husky + `lint-staged` обовʼязковий; **не пропускати `--no-verify`** (Hard Rule #7).
- Pre-PR check: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (= `pnpm check`).
- Кожна PR-картка нижче декларує очікуваний impact на **trial→paid conversion / ARPU / churn**, де релевантно. Без impact-line PR не йде у sequencing-черговість.

---

## PR-1 · XS quick-win: TrialBanner + pricing CTA copy

- **Priority:** P0 (quick-win, окремий PR за вимогою прожарки)
- **Size:** XS (½ дня)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** часткове **P1-9** (TrialBanner — static-копірайт лейер, без countdown-logic; повна логіка у PR-9) + cosmetic copy/CTA tweaks з §3 прожарки 2026-05-04 («Pricing-сторінка — статична декорація»).

### Scope

- `apps/web/src/core/billing/TrialBanner.tsx` (new) — статичний компонент. Reads `usePlan()`, рендериться лише якщо `subscription?.status === "trialing"`. Показує hard-coded copy: «Trial — 7 днів. Платний план — $7/міс або $49/рік». CTA → `/pricing?source=trial_banner`. **Без countdown-logic, без `subscription.currentPeriodEnd` math** — це лишається у PR-9.
- `apps/web/src/core/billing/index.ts` — re-export `TrialBanner`.
- `apps/web/src/core/PricingPage.tsx` — copy tweak: hero-заголовок коротше («Sergeant Pro»), CTA-кнопка читабельніша («Спробувати 7 днів безкоштовно»). Зберігаємо існуючі `PRICING_VIEWED` події.
- `apps/web/src/core/billing/PaywallModal.tsx` — copy tweak: видалити «7 днів trial без прив'язки картки» з features-list і перенести у sub-headline (DRY із PricingPage trial-badge).
- i18n: ~6 нових ключів у `messages.billing.trial_banner.*`.

### Acceptance

- `TrialBanner` рендериться у `apps/web/src/core/app/HubHeader.tsx` нижче sync-status row (mounted point — `<AppShell>` chrome, не модальний).
- Vitest test `TrialBanner.test.tsx` — 3 cases (free → hidden, active → hidden, trialing → visible + correct CTA).
- Snapshot test для PricingPage не падає (новий copy у hero / CTA).
- `PRICING_VIEWED` event з `{ source: "trial_banner" }` ловиться у PostHog dev-проєкті.

### Impact

- **Trial → paid conversion:** +1–3 pp (industry baseline: візуальний trial-reminder підвищує self-initiated checkout на 15–25% у перші 7 днів trial-у).
- **ARPU:** N/A (без впливу на пакет).
- **Churn:** N/A.

---

## PR-2 · P0 · Customer Portal endpoint + Settings PlanSection

- **Priority:** P0 (funnel hard-fail — без self-serve cancel юзер шукає Stripe Dashboard support email).
- **Size:** M (2–3 дні)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** **P0-6** (Customer Portal endpoint) + **P1-6** (Pro plan limits UI у Settings).

### Scope

**Server (`apps/server`):**

- `apps/server/src/routes/billing.ts` — `POST /api/billing/portal`: `requireSession() → stripe.billingPortal.sessions.create({ customer, return_url })` → respond `{ url }`. Rate-limit: same bucket як checkout (5 req/hour per user).
- `apps/server/src/modules/billing/stripe.ts` — нова функція `createPortalSession({ userId }: { userId: string }): Promise<{ url: string }>`. Idempotency: ні (Stripe сам генерує single-use URL).
- API contract: `BillingPortalResponseSchema = { url: string }` у `packages/api-client/src/billing.ts` (Hard Rule #3).
- Webhook: ні (Customer Portal сам публікує `customer.subscription.updated` → вже handled).

**Web (`apps/web`):**

- `apps/web/src/core/settings/PlanSection.tsx` (new) — Settings → Subscription section. Реад `usePlan()`. Показує:
  - Поточний план (Free / Pro), `subscription.status` (active / trialing / past_due / canceled).
  - `subscription.currentPeriodEnd` (formatted via existing date-fns Kyiv locale).
  - CTA: «Керувати підпискою» (active/trialing/past_due) → `POST /api/billing/portal` → `window.location.assign(url)`.
  - CTA: «Оновити до Pro» (free) → `/pricing?source=settings`.
- `apps/web/src/shared/api/billingApi.ts` — додати `billingApi.portal()`.
- `apps/web/src/core/settings/SettingsPage.tsx` — wire `PlanSection` між Privacy і Sessions.
- i18n: ~10 нових ключів у `messages.settings.plan.*`.

### Acceptance

- Vitest: `PlanSection.test.tsx` — 4 cases (free → upgrade CTA, trialing → portal CTA + countdown not yet, active → portal CTA, past_due → portal CTA + warning badge).
- Server test: `billing.portal.test.ts` — happy path + 401 + 429 rate-limit + invalid customer.
- Manual: portal-URL відкриває Stripe-hosted page; cancel-from-portal → webhook → `subscription_canceled` event → `effectiveLimits()` повертає free quota після `current_period_end`.

### Impact

- **Trial → paid conversion:** neutral (post-checkout).
- **ARPU:** neutral.
- **Churn:** **-2 to -5 pp** на soft-cancel (юзери, що не знаходять cancel-flow, dispute через карту → forced refund + chargeback fee). Self-serve cancel → менше chargebacks → менше Stripe-fraud-flag → нижчий effective churn.

---

## PR-3 · P0 · Stripe env-schema validation + `?checkout=success` handler

- **Priority:** P0 (env-validation — silent failure mode у проді; checkout return — funnel hard-fail).
- **Size:** S (1 день)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** **P0-7** (Stripe `price_id` env-config + validation) + **P1-8** (`?checkout=success` return-URL handling).

### Scope

**Server:**

- `apps/server/src/config/env.ts` — Zod-schema розширити: `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_YEARLY` (обидва `z.string().startsWith("price_")`). Schema-validation на boot → fail-fast із `BillingConfigurationError` (а не runtime у `createCheckoutSession`).
- `apps/server/src/modules/billing/stripe.ts` — переключити `createCheckoutSession` з ad-hoc `process.env.STRIPE_PRICE_ID` на typed-config `env.billing.priceId.{monthly,yearly}`.
- Env-template: `.env.example` — додати закоментовані рядки + посилання на Stripe Dashboard.

**Web:**

- `apps/web/src/core/PricingPage.tsx` — `useEffect` з парсингом `URLSearchParams`. Якщо `?checkout=success`:
  - `queryClient.invalidateQueries({ queryKey: billingKeys.status })` (RQ Rule #2 ✓).
  - `trackEvent(ANALYTICS_EVENTS.CHECKOUT_RETURNED, { result: "success" })`.
  - Toast: «Підписка активна!».
  - `history.replaceState` — прибрати `?checkout=success` з URL (clean-URL convention).
  - Redirect → `/` через 1.5 сек.
- Якщо `?checkout=cancel`:
  - `trackEvent(ANALYTICS_EVENTS.CHECKOUT_RETURNED, { result: "cancel" })`.
  - Toast: «Оплату скасовано. Спробуй ще раз пізніше.» (без redirect).
- `packages/shared/src/lib/analyticsEvents.ts` — додати `CHECKOUT_RETURNED: "checkout_returned"` event-constant + inline payload contract.

### Acceptance

- Server boot з відсутнім `STRIPE_PRICE_ID_PRO_MONTHLY` → процес exit-1 з clear-error.
- Vitest: `PricingPage.test.tsx` — додати 2 cases (`?checkout=success` → invalidate + toast; `?checkout=cancel` → toast, no invalidate).
- Manual: Stripe Checkout success → redirect назад на `/pricing?checkout=success` → toast + plan-status оновлений у Settings.

### Impact

- **Trial → paid conversion:** **+3–7 pp** на post-checkout return (без цього юзер бачить старий «Upgrade» CTA після успішної оплати → confusion → support-ticket або soft-cancel).
- **ARPU:** neutral.
- **Churn:** -1 pp (зменшує post-checkout confusion-driven cancels).

---

## PR-4 · P0 · Paywall integration points: AI chat + Mono auto-sync

- **Priority:** P0 (без gate-ів free users бачать Pro-фічі без обмежень — ADR-0001 §1.6 + §1.7).
- **Size:** M (2–3 дні)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** **P1-7** (paywall integration points).

### Scope

**AI chat gate:**

- `apps/web/src/core/chat/ChatInput.tsx` (або відповідний submit-hook) — before send: read `usePlan()`. Якщо `!isPro` і daily-message-count ≥ 5 → `setPaywallOpen(true)` з `surface="ai_chat_quota"`. Existing `PaywallModal` рендериться з `<PaywallModal open={…} surface="ai_chat_quota" />`.
- `apps/web/src/core/chat/hooks/useDailyChatCount.ts` (new) — read локальний `localStorage` key з safe-wrapper. Не вигадуй inline-counter — використовуй existing infra (server-side `requireAiQuota` уже існує, web дзеркалить його). Reset на change-of-day у Kyiv-locale.

**Mono auto-sync gate:**

- `apps/web/src/core/finyk/hooks/useMonoAutoSync.ts` (або відповідний trigger-hook) — pre-trigger guard: `if (!isPro) { setPaywallOpen(true); surface = "mono_auto_sync"; return; }`. Free users — manual import тільки (існуюча UX). Pro — auto-sync trigger через існуючий server-side endpoint.
- Settings (Finyk module) → Mono row — disabled-стан із tooltip «Доступно у Pro» для free users (заміна silent-no-op).

### Acceptance

- Vitest: 2 нових test-suite (`ChatInput.paywall.test.tsx` + `useMonoAutoSync.paywall.test.ts`) — 3 cases each (free → modal opens with correct surface, pro → no modal, trialing → no modal).
- `PAYWALL_VIEWED` event з `surface: "ai_chat_quota" | "mono_auto_sync"` логуються у PostHog dev-проєкті.
- Manual: free user → 6-те AI-повідомлення за день → modal; toggle Mono auto-sync на free → modal; обидва CTA → `/pricing?source=paywall`.

### Impact

- **Trial → paid conversion:** **+5–10 pp** (paywall на high-intent action — найбільший single lever). Перший Pro-gate, який юзер бачить natively, без proactive шукання `/pricing`.
- **ARPU:** neutral (single-tier).
- **Churn:** neutral (paywall — pre-paid funnel).

---

## PR-5 · P1 · Activation v2 web-side capture

- **Priority:** P1 (без capture-у не можна виміряти conversion-correlation = blind-launch).
- **Size:** M (2 дні)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** **P1-2** (Activation v2 web-side capture).

### Scope

- `apps/web/src/core/activation/` (new directory).
  - `apps/web/src/core/activation/useActivationTracker.ts` — composes `evaluateActivationV2()` з `packages/insights` (вже існує як pure function). Subscribe to: Mono-connect event, Finyk transaction-write, budget-set. Coalesce dependencies via React Query (`finykKeys`, `nutritionKeys`).
  - `apps/web/src/core/activation/ActivationTrackerProvider.tsx` — mount у `AppShell`. Calls `evaluateActivationV2()` after each relevant write. Fires `ACTIVATION_V2_HIT` (existing event constant) once, with idempotency-key у `localStorage` (single-user-lifetime event).
- `apps/web/src/core/App.tsx` — wrap `<ActivationTrackerProvider>` around `<HubLayout>`.
- Optional: PostHog cohort — auto-create cohort «Activated v2» у dashboard після PR-merge.

### Acceptance

- Vitest: `useActivationTracker.test.ts` — 4 cases (no Mono → no event, Mono+5cat+1budget ≤72h → fires once, fires again on second session → no double-fire via localStorage flag, beyond 72h → no event).
- Integration: відкрити нову сесію → connect Mono → categorize 5 транзакцій → set 1 budget → ловимо рівно один `activation_v2_hit` event у PostHog.

### Impact

- **Trial → paid conversion:** indirect — без capture-у не можна побудувати predictive-model «activated v2 → paid». Очікувано: activated users конвертують 2–4× краще non-activated (industry benchmark) → дозволяє таргетувати retention-кампанії.
- **ARPU:** N/A.
- **Churn:** indirect (краще розуміння activation → краще onboarding → нижчий early churn).

---

## PR-6 · P1 · Landing page scaffold (Phase 6.1) + email capture

- **Priority:** P1 (без публічного `/` SEO/paid-acquisition не існує).
- **Size:** L (4–6 днів)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** PR-1 (copy tweaks — переконатись, що hero copy не конфліктує).
- **Closes items:** **P1-3** (Landing page scaffold).

### Scope

- `apps/web/src/core/LandingPage.tsx` (new) — мінімальний public-route (без auth-guard). Структура: hero + 3 cards (4 modules abstract, але без cross-module promise) + email-capture form + footer.
- `apps/web/src/core/App.tsx` (router) — добавити public-route `/` (unauthenticated) і redirect-у для authenticated → `/finyk` (existing default).
- Hero copy — **placeholder** до owner-decision (open question з 2026-05-04 roast, §2.4: «Mono + AI fin-coach» vs «all-in-one»). Default placeholder: «Sergeant — твій український фінансовий сержант» з 2-line subtitle. **TODO comment у файлі лінкує на open question.**
- Email capture:
  - `apps/web/src/core/landing/EmailCaptureForm.tsx` — single-input + submit, no validation beyond `z.string().email()`.
  - `apps/server/src/routes/marketing.ts` (new або extend existing) — `POST /api/marketing/email-capture` → upsert into `marketing_emails` table (single migration).
  - `apps/server/src/migrations/039_marketing_emails.sql` — `(email TEXT PRIMARY KEY, source TEXT, captured_at TIMESTAMPTZ DEFAULT NOW())`. Sequential (Hard Rule #4).
- Events:
  - `LANDING_VIEWED` (already exists in canonical registry) — fires on `<LandingPage>` mount.
  - `LANDING_EMAIL_CAPTURED` (already exists) — fires after server-side 2xx response.
- OG-tag + canonical-URL для SEO baseline.

### Acceptance

- Vitest: `LandingPage.test.tsx` — 3 cases (renders without auth, email-capture submits and fires event, validation error не submits).
- Server test: `marketing.email-capture.test.ts` — happy path + duplicate (idempotent upsert).
- E2E (manual): incognito → `/` → email-capture form → submit → success-toast → events у PostHog dev-проєкті.

### Impact

- **Trial → paid conversion:** indirect — landing — це top-of-funnel. Без нього CAC через paid-acquisition не вимірюється. Очікувано: 5–10% email-capture rate з cold traffic; 10–20% з email subscribers конвертують у trial.
- **ARPU:** N/A.
- **Churn:** N/A.

---

## PR-7 · P1 · EN locale integration (Phase 6.2)

- **Priority:** P1 (без EN locale UA-MVP замикається на UA-ринок; ADR-0051 заявляє USD-price у Phase 6).
- **Size:** L (5–7 днів)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** PR-6 (landing-копі — найкоштовніший дзеркало-сурс перекладу).
- **Closes items:** **P1-4** (EN locale integration).

### Scope

- `packages/shared/src/i18n/` (новий або extend existing) — реалізація i18next або similar (узгодити з owner; default — `i18next` + `react-i18next` для consistency з ES-стеком).
- Translation files: `apps/web/src/shared/i18n/uk.ts` (existing) + `apps/web/src/shared/i18n/en.ts` (новий, дзеркало).
- Locale detection: `navigator.language` fallback → `uk` (за замовчуванням). Settings → Language toggle (Pro-gated? — owner-decision, default no для inclusion).
- Initial scope translation: landing page (PR-6) + pricing page + signup + paywall modal. **Не транслюємо**: settings detail-cards, error-boundary copy, dev-only tooltips — окремий PR post-launch.
- Sergeant brand-name: лишається `Sergeant` в обох локалях.

### Acceptance

- Vitest: 1 snapshot per locale per page (`uk` + `en` × 4 pages).
- Manual: `?lang=en` query-param → інстант-switch без reload. Persist у `localStorage`.
- ESLint rule `sergeant-design/no-cyrillic-jsx-literal` — продовжує проганяти, EN-strings не блокуються.

### Impact

- **Trial → paid conversion:** indirect — відкриває non-UA addressable market. Очікувано: EN users — 20–40% з total traffic у перші 90 днів post-launch (industry benchmark для UA-first SaaS).
- **ARPU:** **+10–25%** через USD-price (Phase 7, окремий PR — ADR-0051 §Negative).
- **Churn:** N/A.

---

## PR-8 · P1 · LiqPay gateway placeholder + multi-provider abstraction

- **Priority:** P1 (UA-local payment-gateway parity з Stripe — найбільший friction-buster для UA paying users без USD-карти).
- **Size:** M (3–4 дні, skeleton; реальна live-integration — окремий PR post-launch).
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** —
- **Closes items:** **P1-5** (LiqPay payment gateway placeholder).

### Scope

- `apps/server/src/modules/billing/liqpay.ts` (new, scaffold) — placeholder module з типовою signature: `createCheckoutSession()`, `verifyWebhook()`, `processWebhook()`. Не імплементовані live (throw `NotImplementedError("LiqPay live — Phase 7")` ), але contract-types визначені.
- `apps/server/src/modules/billing/provider.ts` (new) — `BillingProvider` interface; `getProviderForCountry({ country }): BillingProvider` resolver (default `stripe`, future-shape: `country === "UA" && featureFlag.liqpay → liqpay`).
- `subscriptions` table — column `provider TEXT NOT NULL DEFAULT 'stripe'` (вже існує у схемі — підтвердити migration історію). Якщо ні — migration `040_billing_provider.sql`.
- Feature-flag: `liqpay-enabled` (default off) — Phase 7 enablement через PostHog feature-flag.
- ADR amendment: `docs/adr/0001-monetization-architecture.md` §ADR-1.1 — оновити «LiqPay Phase 2» → «LiqPay placeholder Phase 2; live Phase 7».

### Acceptance

- Vitest: `liqpay.test.ts` — 1 case `throws NotImplementedError` (proves scaffold). `provider.test.ts` — 3 cases (country=UA+flag=off → stripe, country=UA+flag=on → liqpay, country=US → stripe).
- Manual: ні (поки немає live-LiqPay).

### Impact

- **Trial → paid conversion:** **+5–15 pp** для UA-users (industry: UA SaaS втрачає 15–30% paying-rate без LiqPay/Privat24 option; UA-issued cards мають вищий 3DS-failure rate на Stripe).
- **ARPU:** neutral.
- **Churn:** -1–2 pp (renewal-success rate вищий на LiqPay для UA cards).

> Caveat: impact numbers — лише через **live** LiqPay (Phase 7). Цей PR — placeholder, що unblocks live-PR пізніше.

---

## PR-9 · P1 · TrialBanner full version (countdown + lifecycle states)

- **Priority:** P1 (повний TrialBanner — після XS quick-win-у з PR-1).
- **Size:** S (1 день)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** PR-1 (XS).
- **Closes items:** **P1-9** (Trial expiry banner / notification — full).

### Scope

- `apps/web/src/core/billing/TrialBanner.tsx` — розширити з PR-1:
  - Reads `subscription.currentPeriodEnd` → computes `daysLeft` у Kyiv-locale (Hard Rule #-on Domain Invariants).
  - Variants: `> 3 days` → info; `1–3 days` → warn (yellow/amber); `0 days / expired` → danger (red, persistent).
  - CTA: «Активувати Pro зараз» → `/pricing?source=trial_banner&days_left=N`.
  - Dismissible (`localStorage`-stored), але re-appears на entering warn / danger tier.
- Event: `TRIAL_BANNER_VIEWED { days_left, variant }` — додати у `analyticsEvents.ts`.
- Re-fetch `usePlan()` once per day (background refresh — via React Query `staleTime: 24h` для trial-status-window).

### Acceptance

- Vitest: `TrialBanner.test.tsx` — 5 cases (free → hidden, active → hidden, trialing 7d → info, trialing 1d → warn, expired → danger).
- Snapshot test для color-variants проганяється через design-tokens (Hard Rule #11).
- Manual: trialing user → банер з countdown; dismiss → ховається; через day-rollover при `days_left ≤ 3` → re-appears як warn.

### Impact

- **Trial → paid conversion:** **+2–5 pp** delta понад PR-1 (countdown urgency знаний lever — industry: trial-countdown-banner-and-warning збільшує day-7-paid-conversion на 8–15%).
- **ARPU:** neutral.
- **Churn:** N/A.

---

## PR-10 · P2 · Revenue dashboards у admin panel

- **Priority:** P2 (post-launch — потрібно лише після перших 50 paying для статистичної значущості).
- **Size:** M (3 дні)
- **Owner:** `@Skords-01` (placeholder)
- **Depends on:** PR-3, PR-4 (need stable `subscription_started/renewed/canceled` event flow).
- **Closes items:** **P2-2** (Revenue dashboards in admin panel).

### Scope

- `apps/web/src/core/admin/RevenueDashboard.tsx` (new) — admin-only route, gated existing `requireAdmin` (server-side) + `useIsAdmin()` (client-side).
- 5 charts (composed via existing observability-stack або React Query → PostHog REST):
  - MRR (sum of `$revenue` on `subscription_started` + `subscription_renewed` minus refunds).
  - Active subscriptions (count, plotted daily for 30/90/180 days).
  - Churn rate (`subscription_canceled` per week / active subs at week-start).
  - Trial → paid conversion (`SUBSCRIPTION_STARTED` / `CHECKOUT_STARTED` ratio).
  - ARPU (MRR / active-subs).
- Data-source decision: **PostHog REST** для прототипу (без додаткового SQL). Якщо потрібен точніший real-time — окремий PR з `apps/server/src/routes/admin/billing-stats.ts`.

### Acceptance

- Vitest: `RevenueDashboard.test.tsx` — renders without crash з mocked PostHog response.
- Manual: admin login → `/admin/revenue` → 5 charts з реальних PostHog data (хоча б 1 test-subscription у dev-проєкті).

### Impact

- **Trial → paid conversion:** indirect — без dashboards не виміряти. Це enabler-PR.
- **ARPU:** indirect (так само).
- **Churn:** indirect (так само).

---

## PR-карти, що НЕ увійшли (свідомо відкладено)

- **P0-1 ... P0-5, P1-1** з [`2026-05-13-revenue-monetization-roast.md`](../audits/2026-05-13-revenue-monetization-roast.md) — `usePlan`, `PaywallModal`, `billingKeys`, webhook `renewed/canceled`, analytics-events Phase 4–6. **Done у попередньому PR** (див. §Прогрес виконання у прожарці).
- **P2-1** (GTM hero copy A/B test) — залежить від PR-6 (landing) + PR-7 (EN locale). Відкладено до Phase 7.
- **P2-3** (Subscription change proration) — out-of-scope до моменту, коли є яким змінювати (single Pro tier у MVP). Відкладено до multi-tier launch (post-Phase 7).
- **P2-4** (Invoice PDF + email) — Stripe сам генерує PDF + email. Net-new infra оверкіл для перших 50 paying. Відкладено до 200+.
- **P2-5** (Referral / promo code) — окрема ініціатива у [ADR-0001 §Open questions](../adr/0001-monetization-architecture.md#open-questions). Відкладено.
- **P2-6** (Annual billing toggle) — `49/рік` цінник уже у `PricingPage` як displayed text, але без Stripe annual `Price`. ADR-amendment + Stripe annual `Price` + UI toggle — окремий PR post-launch, але `included` у спеціально нижченаведеному PR-10' (опціональний, якщо є capacity у тому ж спринті).

> Якщо приходить capacity для PR-10' (`P2-6 Annual billing`) — це M-size (2–3 дні): нова `STRIPE_PRICE_ID_PRO_YEARLY` env, UI toggle у `PricingPage`, ADR-0001 amendment. Sequencing — після PR-2 (Customer Portal), щоб annual-cancel працював.

## Wedge-related items з 2026-05-04 (НЕ blocking revenue launch)

Прожарка 2026-05-04 містить items, які owner відклав як `[OPEN]` після decisions (див. §Update 2026-05-04). Вони **НЕ** у цьому PR-плані, але трекаються тут як cross-ref:

- **Hero positioning final pick** — open до merge PR-6. Default placeholder copy у PR-6, owner-replace перед launch.
- **3 cross-module AI insights** — post-launch брейншторм. Не у цьому плані.
- **EUR/USD pricing** — після UA-MVP (~50–100 paying). Не у цьому плані (PR-7 EN locale підготовлює, але без USD price).
- **Apple + Google + Email/password fallback** — ініціатива 0010 Phase 4.3, окремий PR. Не у цьому плані (тут — billing surface, не auth).
- **OpenClaw freeze** — rejected owner-decision. Не у цьому плані.
- **Mobile deprecate** — rejected owner-decision (ADR-0052). Не у цьому плані.
- **«Назва Sergeant» rename track** — Q4 2026 окрема ініціатива.

---

## Pricing experimentation guardrails

Без experimentation-фреймворка усі impact-числа вище — guess. Цей розділ визначає, **як вимірюємо** і **що дозволено/заборонено** змінювати без А/B.

### Метрики (canonical)

| Metric                          | Definition                                                                                  | Source                                                                                 | Reporting cadence          |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| **Trial → paid conversion**     | `SUBSCRIPTION_STARTED with plan=pro / CHECKOUT_STARTED with plan=pro` за last-30-day-cohort | PostHog funnel                                                                         | Daily, weekly significance |
| **ARPU**                        | `MRR / active-subs-count` (Kyiv-end-of-month snapshot)                                      | PostHog `$revenue` (з PR-3 stable) + DB query на `subscriptions.status = active`       | Weekly                     |
| **Net churn rate**              | `(canceled - reactivated) / active-at-period-start` за 30-day rolling                       | PostHog `subscription_canceled` події (з webhook lifecycle) + DB query                 | Weekly                     |
| **Gross churn rate**            | `canceled / active-at-period-start` за 30-day rolling                                       | Same                                                                                   | Weekly                     |
| **Trial-attach rate**           | `CHECKOUT_STARTED with trial=true / PRICING_VIEWED`                                         | PostHog                                                                                | Daily                      |
| **Funnel: landing → trial**     | `LANDING_VIEWED → SIGNUP_PROVIDER_SELECTED → CHECKOUT_STARTED with trial=true`              | PostHog funnel (потребує PR-6 landing + ініціатива 0010 Phase 4.3 auth-multi-provider) | Daily                      |
| **AI-quota → paywall hit rate** | `PAYWALL_VIEWED with surface=ai_chat_quota / DAU`                                           | PostHog (потребує PR-4)                                                                | Daily                      |
| **Mono-auto-sync paywall hit**  | `PAYWALL_VIEWED with surface=mono_auto_sync / Mono-connected DAU`                           | PostHog (потребує PR-4)                                                                | Daily                      |
| **Activation v2 → paid**        | `ACTIVATION_V2_HIT → SUBSCRIPTION_STARTED with plan=pro` lag-distribution                   | PostHog funnel (потребує PR-5)                                                         | Weekly                     |

### A/B framework (механіка)

- **Provider:** PostHog feature flags (вже в стеку через `apps/web` PostHog SDK).
- **Bucketing:** `userId` (persistent через Better Auth opaque-string ID — Domain Invariants).
- **Variant types:** boolean (control / treatment) для копірайт-tweaks; multivariate (≤4 arms) для pricing-tier exp.
- **Sample-size calc:** baseline conversion rate + MDE (minimum detectable effect) → required N. Default MDE — **20% relative lift** на base conversion ≤5%. Calculator-link: `https://www.evanmiller.org/ab-testing/sample-size.html`.
- **Pre-test baseline:** **≥7 days** continuous metric capture **перед** експериментом (наразі baseline ≈ 0 paying, тому baseline-window відкривається з першого Stripe-чека = Phase 1 у ініціативі 0010).
- **Min sample per arm:** **200 conversions** або **14 днів** (whichever later). До 50 paying users — **жодних A/B на pricing-tier** (statistical power ≈ 0).
- **Sequential testing:** SPRT-style stopping rules disabled у MVP. Fixed-horizon тільки.
- **Multiple-comparison correction:** Bonferroni при ≥3 arms.

### Що дозволено А/B-тестувати (whitelist)

- **Hero copy** (PR-6 landing) — copy-only, no Stripe price change. PostHog FF `landing-hero-variant` з 2–4 arms. Decision rule: **min sample 500 LANDING_VIEWED per arm, 14 days, MDE on EMAIL_CAPTURE rate ≥20% rel**.
- **CTA microcopy** (`Спробувати безкоштовно` vs `Активувати Pro`) — copy-only. Min sample 200 conversions per arm.
- **Paywall surface copy** (PR-4 paywall modal) — copy-only. Per-surface FF; min sample 100 paywall-views per arm.
- **Trial length** (7 vs 14 днів) — ADR-0051 фіксує 7d як default. Будь-яка зміна — потребує **ADR amendment** + ≥50 paying users baseline + statistical-significance plan **до** старту експерименту.

### Що ЗАБОРОНЕНО без формального процесу (red zone)

- **Зміна `STRIPE_PRICE_ID_PRO_MONTHLY` чи `STRIPE_PRICE_ID_PRO_YEARLY` price-amount.** Це не A/B — це permanent customer-base change → **ADR-0051 amendment + grandfather-policy ADR (ADR-1.4 — withdrawn, потрібен новий)**. Old subs зберігають old price (Stripe-default), new subs — new price. Migration plan — пишемо ДО price-change-PR.
- **Видалення Pro tier або зміна features set Pro.** ADR-0051 amendment обов'язково.
- **Інтродукція 3-го tier (Plus).** Замінює ADR-0051 повністю — окремий ADR.
- **«Lifetime deal» promo.** Видалено з ADR-0051 (-LTV). Будь-яка реактивація — повний бізнес-аналіз + ADR.
- **Зміна currency (₴ → $ для UA-користувачів)** — ADR-1.9 amendment.

### Pre-experimentation checklist (PR-template addendum)

Pre-merge для будь-якого A/B-PR власник підтверджує:

- [ ] Pre-test baseline ≥7 днів задокументовано.
- [ ] Sample-size calculation з MDE і expected-runtime у PR description.
- [ ] FF-key registered (PostHog) + opt-out toggle для admin debugging.
- [ ] Decision-rule: коли зупиняємо (sample-N + days + significance threshold).
- [ ] Rollback plan: 1-click FF-off повертає 100% control.
- [ ] Post-test write-up TODO у відповідну initiative-tracker секцію.

---

## Sequencing

> Phase назви — синхронізовано з [ініціативою 0010](../initiatives/0010-revenue-first-launch.md), а не з ADR-0001 Phase glossary (там Phase 0 = pre-launch; тут Phase 0 = pre-merge baseline).

### Sprint A — Quick-win + P0 baseline (Week 1)

1. **PR-1 (XS)** — TrialBanner + copy/CTA tweaks (½ дня). **Merge → unblock baseline metrics.**
2. **PR-3 (S)** — Stripe env-schema + `?checkout=success` handler (1 день). **Merge → unblock first Stripe checkout end-to-end.**
3. **PR-2 (M)** — Customer Portal + Settings PlanSection (2–3 дні). **Merge → self-serve cancel.**

### Sprint B — P0 paywall + P1 capture (Week 2)

4. **PR-4 (M)** — Paywall integration AI chat + Mono auto-sync (2–3 дні). **Merge → free→paid friction-points active.**
5. **PR-5 (M)** — Activation v2 capture (2 дні). **Merge → activation funnel measurable.**

### Sprint C — P1 landing + locale (Weeks 3–4)

6. **PR-6 (L)** — Landing page scaffold (4–6 днів). **Merge → public `/` live.**
7. **PR-9 (S)** — TrialBanner full (1 день, paralelno з PR-6). **Merge → trial urgency-funnel active.**
8. **PR-7 (L)** — EN locale (5–7 днів). **Merge → non-UA addressable.**

### Sprint D — P1 placeholder + P2 polish (Weeks 5+)

9. **PR-8 (M)** — LiqPay placeholder (3–4 дні). **Merge → multi-provider architecture ready.**
10. **PR-10 (M)** — Revenue dashboards (3 дні, **gate: 50+ paying users**). **Merge → MRR/churn visibility у admin.**

### Critical path (Gantt-style)

```
Week 1: [PR-1] → [PR-3] → [PR-2]
Week 2: [PR-4] → [PR-5]
Week 3: [PR-6] ─────────────────────→
Week 3: [PR-9]
Week 4: [PR-7] ──────────────────────→
Week 5: [PR-8]
Week 5+: [PR-10 — gated]
```

Crit-path = PR-1 → PR-3 → PR-2 → PR-4 → PR-6 (15–20 working days до launch-ready). PR-5, PR-7, PR-8 — паралельні треки після PR-4.

## Quick-wins (XS / S, можна merge у будь-якому порядку)

- **PR-1 XS — TrialBanner + copy/CTA tweaks** (½ дня) — `apps/web/src/core/billing/TrialBanner.tsx` (static), `PricingPage` copy, `PaywallModal` copy DRY. Виноситься як окремий PR за вимогою прожарки.
- **PR-3 S — Stripe env-schema + checkout return-URL** (1 день) — server-side fail-fast + client-side toast.
- **PR-9 S — TrialBanner countdown logic** (1 день, після PR-1) — динамічний countdown + variants.

## Owner placeholders

| PR    | Owner        | Reviewer     | Secondary (bus-factor)  |
| ----- | ------------ | ------------ | ----------------------- |
| PR-1  | `@Skords-01` | `@Skords-01` | TBD (frontend-engineer) |
| PR-2  | `@Skords-01` | `@Skords-01` | TBD (full-stack)        |
| PR-3  | `@Skords-01` | `@Skords-01` | TBD (backend)           |
| PR-4  | `@Skords-01` | `@Skords-01` | TBD (frontend)          |
| PR-5  | `@Skords-01` | `@Skords-01` | TBD (frontend)          |
| PR-6  | `@Skords-01` | `@Skords-01` | TBD (frontend)          |
| PR-7  | `@Skords-01` | `@Skords-01` | TBD (i18n-engineer)     |
| PR-8  | `@Skords-01` | `@Skords-01` | TBD (backend)           |
| PR-9  | `@Skords-01` | `@Skords-01` | TBD (frontend)          |
| PR-10 | `@Skords-01` | `@Skords-01` | TBD (data-analyst)      |

> Secondary — bus-factor backup reviewer (AGENTS.md § Module ownership map). `TBD (<role>)` placeholders прийнятні, доки delegation in flight.

## Definition of Done (per-PR)

- [ ] Acceptance criteria PR-картки виконано.
- [ ] `pnpm check` passes (= `format:check && lint && typecheck && test && build`).
- [ ] Husky pre-commit pipeline passed (`lint-staged` + `staged-typecheck.mjs` + `bump-last-validated.mjs`).
- [ ] Усі нові UA-літерали — через `apps/web/src/shared/i18n/uk.ts` (Hard Rule #15).
- [ ] RQ keys — лише через `billingKeys` factory (Hard Rule #2).
- [ ] Якщо changed API shape — server-серіалізатор + `api-client` + contract-test у одному commit (Hard Rule #3).
- [ ] PostHog events задокументовано у `packages/shared/src/lib/analyticsEvents.ts` + payload contract.
- [ ] PR description лінкує impact-цифру (real або placeholder з МDE).
- [ ] Cross-ref у [`2026-05-13-revenue-monetization-roast.md`](../audits/2026-05-13-revenue-monetization-roast.md) status-table оновлено.
