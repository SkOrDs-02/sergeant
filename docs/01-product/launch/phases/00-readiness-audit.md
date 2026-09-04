# 00 — Launch readiness audit: 5 застосунків Sergeant

> **Last touched:** 2026-09-04 by @Skords-01. **Next review:** 2026-12-11.
> **Status:** Active

> **Канон 2026-07-29:** billing scaffold, in-app landing і standalone `apps/landing` shipped у коді. Для marketing surface не підтверджені з репо лише зовнішні Vercel production deployment і `sergeant.com.ua` DNS. Public launch блокується legal publish, live payment env/cookie consent/store readiness — не створенням ще одного лендінгу.

> Read-only zoom-out на готовність 5 app surfaces (Web, Landing, Server, Capacitor shell, Native Expo) до запуску з реальними юзерами. Цей документ — baseline для 3 наступних phase-роадмапів (web/Capacitor/native). Зміни статусів — через окремі PR-и.

> **Cross-refs (root-anchors):**
> [`docs/01-product/launch/business/04-launch-readiness.md`](../business/04-launch-readiness.md) ·
> [`docs/01-product/launch/business/02-go-to-market.md`](../business/02-go-to-market.md) ·
> [`docs/01-product/launch/product-os/ftux-master-tracker.md`](../product-os/ftux-master-tracker.md) ·
> [`docs/02-engineering/architecture/platforms.md`](../../../02-engineering/architecture/platforms.md) ·
> [`docs/02-engineering/architecture/service-catalog.md`](../../../02-engineering/architecture/service-catalog.md) ·
> [`docs/00-start/playbooks/release.md`](../../../00-start/playbooks/release.md) ·
> [`docs/90-work/initiatives/0010-revenue-first-launch.md`](https://github.com/SkOrDs-02/sergeant/blob/625921e85c7e961883d4cca64d9f6a177dbba823/docs/90-work/initiatives/0010-revenue-first-launch.md) ·
> [`docs/04-governance/adr/0052-mobile-strategy-capacitor-primary.md`](../../../04-governance/adr/0052-mobile-strategy-capacitor-primary.md)

---

## 1. TL;DR

Sergeant фактично вже **технічно деплоїться у прод**: `apps/web` живе на Vercel, `apps/server` — на Hetzner/Coolify (`Dockerfile.api`, ADR-0074; Railway виведено), Capacitor-shell має повний AAB+APK release-pipeline для Android і scaffold для iOS. **In-app landing**, standalone **`apps/landing`** і **billing scaffold** уже shipped у коді. **Public launch заблокований не створенням лендінгу, а legal-/config-/store-шаром**: legal pages потребують publish/review, live LiqPay/Plata/legacy Stripe keys + ФОП, Apple/Google SSO — UI shipped (env-gated), а для marketing surface треба підтвердити Vercel production deployment і `sergeant.com.ua` DNS. Native Expo — internal dev-client (production EAS-profile є, store-listing-у нема).

---

## 2. Матриця готовності

> **Легенда:** ✅ — готово / production; 🟡 — частково / scaffold / pending secret; 🟥 — не зроблено / явно блокер.
>
> «Real-user tested?» = чи проходили flow зовнішні (не founder-/Devin-) користувачі.

| Surface                        | Deploy ready?                                                                | Auth ready?                                                 | Observability?                     | Release playbook?                                                                                                                                    | Real-user tested?        | Top blockers                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Web** (`apps/web`)           | ✅ Vercel prod + preview-per-PR                                              | 🟡 Email/password live; Apple/Google UI shipped (env-gated) | ✅ Sentry + PostHog + CSP-RO       | ✅ [`release.md §1`](../../../00-start/playbooks/release.md#1-web--api)                                                                              | 🟥 (0 paying)            | Legal publish; live Stripe env; cookie banner                                                                        |
| **Server** (`apps/server`)     | ✅ Coolify/Hetzner `Dockerfile.api` (ADR-0074)                               | ✅ Better Auth (cookie + bearer)                            | ✅ Sentry + Prom + alert-bot       | ✅ [`release.md §1`](../../../00-start/playbooks/release.md#1-web--api)                                                                              | n/a (B2C-фронт)          | Live payment prod keys; прод APNs/FCM creds                                                                          |
| **Capacitor** (`mobile-shell`) | 🟡 Android signing live; iOS — secrets pending                               | ✅ Bearer через Keychain/EncryptedSharedPrefs (PR #505)     | 🟡 web-side observability reuse    | ✅ [`release.md §2`](../../../00-start/playbooks/release.md#2-mobile-shell-capacitor) + [`mobile/shell.md`](../../../02-engineering/mobile/shell.md) | 🟥                       | Apple secrets для iOS release CI, Play store listing assets, internal track config                                   |
| **Native** (`apps/mobile`)     | 🟡 EAS `production` profile є, без submit                                    | ✅ Better Auth Expo + bearer                                | 🟡 PostHog wired, Sentry TBD       | ✅ [`release.md §3`](../../../00-start/playbooks/release.md#3-expo) + [`mobile/overview.md`](../../../02-engineering/mobile/overview.md)             | 🟥 (internal dev-client) | Store-listing (icons, privacy manifest, data safety), photo-AI / pantry parity, Expo flaky-test green 20/20 baseline |
| **Landing** (`apps/landing`)   | 🟡 standalone build/config shipped; external Vercel prod + domain unverified | n/a                                                         | 🟡 cookieless PostHog when env set | [`apps/landing/README.md`](../../../../apps/landing/README.md)                                                                                       | 🟥 unverified externally | Confirm Vercel project/root directory, `sergeant.com.ua`, Telegram CTA/OG smoke                                      |

---

## 3. Детальний аналіз поверхонь

### 3.1 Web (`apps/web`)

- **Стан:** `active` за [`apps-status-matrix.md`](../../../02-engineering/architecture/apps-status-matrix.md). React 18 + Vite 8 PWA, Tailwind 4, TanStack Query, Better Auth cookie-сесії, Service Worker (`src/sw.ts`). Деплой — Vercel (статика + Edge Middleware-проксі на Coolify API), per-PR preview-середовища.
- **Auth:** реалізовано email/password через Better Auth (`AuthContext` у [`apps/web/src/core/auth/AuthContext.tsx`](../../../../apps/web/src/core/auth/AuthContext.tsx)), UA-помилки мапляться за стабільним Better Auth `error.code`. **Apple + Google SSO — UI + server wiring shipped** (`GoogleSignInButton`, `AppleSignInButton` у `AuthPage.tsx`); production rollout залежить від OAuth env secrets (initiative [`0010-revenue-first-launch.md`](https://github.com/SkOrDs-02/sergeant/blob/625921e85c7e961883d4cca64d9f6a177dbba823/docs/90-work/initiatives/0010-revenue-first-launch.md) §4.3).
- **FTUX:** `WelcomeScreen` + `OnboardingWizard` на `/welcome`, lazy-loaded chunk; demo-режим `?demo=1` через `seedDemoData/*`. За [`ftux-master-tracker.md`](../product-os/ftux-master-tracker.md): **27 з 35 sprint-items закрито** в `main`, 8-step PostHog activation funnel живе на web, D1/D7 dashboard зеленіє. Real-world conversion поки **TBD** (когорта стартувала ~2026-04-28).
- **Observability:** Sentry ([`apps/web/src/core/observability/sentry.ts`](../../../../apps/web/src/core/observability/sentry.ts)) + PostHog (8 FTUX events + identify), Web Vitals, Lighthouse CI workflow заплановано (T5 у тех-боргу), `size-limit` уже у CI.
- **Security:** CSP report-only активний (CSP/COOP/COEP у [`apps/web/vercel.json`](../../../../apps/web/vercel.json)), Permissions-Policy жорстка.
- **Billing UI/API:** scaffold уже в коді — `PricingPage`, `core/billing/PaywallModal`, `usePlan()` hook, server `/api/billing/status`, `/checkout`, `/portal`, `/stripe-webhook`, а також API-client billing helpers. **Public launch work — live Stripe env/account/legal rollout + remaining placement polish**, не побудова billing skeleton з нуля.
- **Висновок для запуску:** web уже **запускається для closed beta з 10–30 запрошеними юзерами** на поточному стеку. Public launch потребує: legal publish, cookie-banner, live payment env, Apple/Google OAuth prod secrets і підтверджений production deploy/domain уже створеного `apps/landing`.

### 3.2 Server (`apps/server`)

- **Стан:** `active`. Node 22 + Express + Coolify-managed `pgvector/pgvector:pg18` + Better Auth + Anthropic + Voyage embeddings. Деплой — Hetzner/Coolify через [`Dockerfile.api`](../../../../Dockerfile.api); pre-deploy запускає `node dist-server/migrate.js` (`MIGRATE_DATABASE_URL`). Health-check `/health` p95 < 100ms (SLO target).
- **API:** v1 + v2 surfaces; sync v2 (SQLite-WASM + outbox) живе у проді; Voyage daily cost alert, alert-bot 60/120-min escalation, `/ai_cost` slash-команда — все мерджено за останні 50 коммітів.
- **Auth secrets / Hard Rule #20:** OpenClaw PATs заборонені в проді, ротація через [`docs/00-start/playbooks/rotate-secrets.md`](../../../00-start/playbooks/rotate-secrets.md). `BETTER_AUTH_TOKEN_ENC_KEY` + `NUTRITION_BACKUP_KEY_SECRET` — required у проді (з `.env.example`).
- **Observability:** Pino JSON + ALS-контекст + redaction policy (Hard Rule #21), Prometheus `prom-client` (`GET /metrics` за `METRICS_TOKEN`), Sentry із trace-sampling-presets, GCS log-retention archive cron, n8n webhook events Grafana dashboard.
- **Billing schema:** `subscriptions` / billing webhook-event storage уже є в implementation path; перед public launch треба перевірити, що migrations виконані в target Coolify Postgres і production provider env налаштовано.
- **Push:** native APNs/FCM register endpoint живе, **fan-out у проді ще потребує credentials** ([`docs/90-work/tech-debt/backend.md#push-credentials`](../../../90-work/tech-debt/backend.md)).
- **Висновок:** server-side готовий до closed beta «as is»; public launch вимагає `subscriptions` + Stripe webhook + прод push creds.

### 3.3 Capacitor shell (`apps/mobile-shell`)

- **Стан:** `stabilize` (MVP) — Capacitor 7 wrapper навколо `@sergeant/web`. ADR-0052 фіксує: **Capacitor primary** до Expo feature parity, T₀/T₁/T₂ sunset — НЕ active commitments.
- **Готове:** bearer-auth у Keychain/EncryptedSharedPrefs (PR #505), native barcode (`@capacitor-mlkit/barcode-scanning`, PR #504), status-bar/splash/keyboard/deep-links (PR #506), native push (`@capacitor/push-notifications`, PR #512+#524), Android hardware-back → web-history. Deep-link bridge через BroadcastChannel + pre-mount queue (PR-29).
- **Release pipeline:**
  - **Android:** [`.github/workflows/mobile-shell-android-release.yml`](../../../../.github/workflows/mobile-shell-android-release.yml) — повний AAB (Play) + APK (sideload) з `SERGEANT_RELEASE_*` env-secrets. Signing config у [`apps/mobile-shell/android/app/build.gradle`](../../../../apps/mobile-shell/android/app/build.gradle), ProGuard/R8 ввімкнено.
  - **iOS:** [`.github/workflows/mobile-shell-ios-release.yml`](../../../../.github/workflows/mobile-shell-ios-release.yml) — **scaffold готовий**, але без Apple-секретів job логує `::warning::iOS release secrets not configured` і падає у unsigned-simulator-фолбек. Setup-контракт — [`docs/02-engineering/mobile/shell.md` § Release — iOS](../../../02-engineering/mobile/shell.md#release--ios).
- **Real-user testing:** 🟥 поки що нема — публічного TestFlight/Play Internal track-у не існує.
- **Висновок:** як тільки web public launch відбудеться (legal + Stripe + домен), **Capacitor Android internal track реально випустити за 1–2 тижні** (build + store-listing). iOS — як тільки буде Apple Developer-акаунт + signing assets.

### 3.4 Native Expo (`apps/mobile`)

- **Стан:** `active`, **internal dev-client** — готово до `eas build --profile development`, ще не для store. Expo SDK 52 + RN 0.76 + Expo Router + NativeWind + MMKV + Better Auth Expo + bearer у `expo-secure-store`.
- **Feature parity** (з [`platforms.md`](../../../02-engineering/architecture/platforms.md)): 18/22 рядків функціонально на parity з web; Hub voice (STT/TTS) — 🟡 (HubChat composer Phase 8 follow-up), Onboarding wizard — 🟡 (повний AI-customize крок Phase 7), Харчування — 🟡 (pantry/shopping/recipes/photo-AI).
- **Push:** native APNs/FCM через `expo-notifications`, `PushRegistrar` шле токени у `POST /api/v1/push/register` з ідемпотентним кешем.
- **CI/tests:** Detox iOS + Android конфіги у CI (поки smoke-build), окремий [`mobile-flaky-verify.yml`](../../../../.github/workflows/mobile-flaky-verify.yml) воркфлоу — 20-run baseline.
- **EAS:** [`eas.json`](../../../../apps/mobile/eas.json) має `development` / `preview` / `production` profile-и, `production.android.buildType = app-bundle`, `production.distribution = store`. **Submit-secret-и не налаштовані**, store-listing-у не існує (іконки, privacy manifest iOS, data safety Android).
- **Висновок:** native — це **другий ешелон launch-у**. Реально випустити internal-track-білд через ~4–6 тижнів після Capacitor public, або раніше — якщо власник свідомо переключиться на Expo як primary (зараз ADR-0052 говорить protilezhne).

### 3.5 Landing site

- **In-app surface:** `apps/web/src/core/LandingPage.tsx` на `/` для cold visitors, `/welcome` для onboarding, `/pricing` для тарифів.
- **Standalone surface:** `apps/landing` — Vite 7 + React 18 static build, окремий `vercel.json`, OG/robots/404, Telegram waitlist CTA і cookieless `landing_*` PostHog events. Email-форму свідомо прибрано: бот отримує контакт лише після `/start`.
- **Підтверджено репо:** lint/typecheck/test/build scripts, Vercel root/build contract, `SITE_URL`/`VITE_TELEGRAM_BOT`/PostHog env contract.
- **Не можна підтвердити локально:** чи існує активний Vercel production project з правильним Root Directory, чи прив'язаний `sergeant.com.ua`, які production env реально задані, чи CTA веде на production-бота.
- **Висновок:** створювати ще один Astro/Framer one-pager не треба. До public launch потрібен операторський deploy/DNS/env/smoke-check уже готового `apps/landing`; блог лишається окремим майбутнім scope.

---

## 4. Чи треба окремий лендінг-сайт?

**Рішення вже виконано:** так, окрема surface потрібна, і вона вже існує як `apps/landing`. Повторний вибір стеку закритий фактичним кодом; поточна робота — production rollout, не нова реалізація.

**Чому НЕ обходитись лише `/welcome`-ом для public launch:**

1. **SEO/share-критично:** PWA-shell з service-worker-ом + Workbox-cache headers — погана платформа для landing-pages, які мають індексуватись і ділитись OG-картками. `apps/landing` уже ізолює marketing bundle та metadata від `/welcome`.
2. **Розділення marketing vs product feature-flag-планів:** marketing-копії й A/B-тести лендінгу не повинні залежати від `pnpm --filter @sergeant/web build` циклу, інакше кожен copy-change тригерить full CI + size-limit-gate.
3. **Domain-routing план уже зафіксовано** у [`02-go-to-market.md` § 2.2](../business/02-go-to-market.md): `sergeant.com.ua` → лендінг, `app.sergeant.com.ua` → PWA, `sergeant.com.ua/blog` → SEO. Це дозволяє паралельно тестувати кілька лендінгів без зачіпання product surface.
4. **CSP/Permissions-Policy `apps/web`** жорсткі (camera/microphone/clipboard = none) — для лендінгу з демо-відео цю політику доводиться послаблювати, що збільшує security-surface на product domain.

**Коли все ще OK використовувати `/welcome`-only:**

- closed beta з ≤30 інвайт-юзерами (без public registration), де SEO не релевантне;
- founder-driven content-marketing (Twitter/X + DOU) поки що лінкує одразу на `/welcome` з UTM;
- якщо зовнішній домен тимчасово не готовий, invite-flow може вести напряму в product entry або Telegram-бота.

**Зафіксований stack і scope:**

- Vite 7 + React 18 + Tailwind 4 на окремому Vercel project;
- Telegram deep link як єдина conversion action; `/start` зберігається у `telegram_waitlist`;
- cookieless PostHog без autocapture/session recording;
- статична OG-картка + canonical/`og:url` із `SITE_URL` або Vercel production URL;
- блог не входить у поточний `apps/landing` і потребує окремого рішення, якщо стане launch blocker-ом.

---

## 5. Top-10 blockers перед closed beta

> Closed beta = 10–30 запрошених, invite-only, без публічного registration, без оплати, з можливим manual onboard. Список упорядкований за критичністю.

| #   | Blocker                                                                     | Owner         | Effort   | Notes / cross-ref                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Privacy Policy + Terms of Service сторінки опубліковані у проді             | Founder       | 0.5–1 д. | [`04-launch-readiness.md § 1.1`](../business/04-launch-readiness.md#1-юридичне-та-compliance); потрібно навіть для closed beta (health + fin)                       |
| 2   | Invite-only access: посаджуємо registration за feature-flag                 | Dev           | 0.5 д.   | Простий FF гейт `signupOpenForRoles` на `AuthPage`; запрошення через manual link                                                                                    |
| 3   | Support email або Telegram-канал для бета-фідбеку                           | Founder       | 0.5 д.   | Item #30 у [`04 § 7`](../business/04-launch-readiness.md#7-pre-launch-чеклист); `support@sergeant.app` згадано в ADR-0003                                           |
| 4   | Staging environment окремий від prod (для Devin-/Devin-child-смоків)        | Dev           | 1–2 д.   | Item #22 у [`04 § 7`](../business/04-launch-readiness.md#7-pre-launch-чеклист)                                                                                      |
| 5   | DB backups перевірено end-to-end (`pnpm db:test-backup-restore`)            | Dev           | 0.5 д.   | Playbook [`test-backup-restore.md`](../../../00-start/playbooks/test-backup-restore.md); critical перед запрошенням реальних даних                                  |
| 6   | Sentry alert routes (email/Telegram) на P0-крах і auth-фейли                | Dev           | 0.5 д.   | Item #24; alert-bot 60/120-min escalation вже в `apps/server` — треба тільки channel-bind                                                                           |
| 7   | Status page (uptimerobot.com або `apps/web/src/core/status/StatusPage.tsx`) | Dev           | 0.5 д.   | Item #25; `StatusPage` route уже існує — треба public-friendly копію                                                                                                |
| 8   | Rate-limiting через Redis у проді (не in-memory)                            | Dev           | 1–2 д.   | Item #23; для closed beta in-memory OK, але блокер public                                                                                                           |
| 9   | Smoke-test критичних flow-ів на проді (signup → onboarding → demo entry)    | Dev/Devin     | 0.5 д.   | E2E уже мерджнуто (`tests/smoke/onboarding-happy-path.spec.ts`); прогнати на prod-URL                                                                               |
| 10  | Invite-link з UTM-параметрами + дефолтний onboarding flow для запрошених    | Dev + Founder | 0.5 д.   | UTM пишеться у PostHog identify; FTUX cohort attribution — pure-function у [`packages/insights/src/activation.ts`](../../../../packages/insights/src/activation.ts) |

**Effort summary:** 6–9 робочих днів до повноцінного closed beta, якщо власник не блокується на legal-/support-кроках.

**Додаткові blockers, що зʼявляться між closed beta → public web launch** (не входять у top-10, але треба тримати в голові):

- Stripe billing (Phase 2–4 з [`0010`](https://github.com/SkOrDs-02/sergeant/blob/625921e85c7e961883d4cca64d9f6a177dbba823/docs/90-work/initiatives/0010-revenue-first-launch.md)).
- Apple/Google SSO (Phase 4.3 з 0010).
- Cookie consent banner для EU.
- Окремий лендінг на `sergeant.com.ua` (див. § 4).
- ФОП + банк-рахунок для UA-Stripe (з [`04 § 1.3`](../business/04-launch-readiness.md)).
- Demo-video 30–60s для лендінгу/store.
- `subscriptions` SQL-міграція + Stripe webhook handlers.
- `/api/me/export` (GDPR data export) і `DELETE /api/me` (cascade + external cleanup).

---

## 6. Sequence checkpoints (рекомендована послідовність)

> Кожен checkpoint має **entry criteria** (що має бути true перед переходом) і **exit criteria** (що означає «cleared»). Estimated calendar = тижні, при single-founder velocity.

### CP-1 → Web closed beta (week 0–1)

- **Entry:** top-10 blockers § 5 закрито.
- **Exit:** 10–30 запрошених active users, ≥10 з них дійшли до `first_real_entry` (PostHog), 7-day retention ≥30%, 0 P0 інцидентів, ≥3 раунди фідбеку через Telegram/email.
- **Surface flags:** `signupOpenForRoles=invite-only`, `paywallEnabled=false`, demo-режим увімкнено.

### CP-2 → Web public launch (week 4–6)

- **Entry:** CP-1 exit + Privacy/ToS finalized, Stripe Checkout живий у staging, Apple+Google SSO мерджено, Cookie consent banner у проді, окремий лендінг на `sergeant.com.ua` опублікований, GDPR endpoints (`/api/me/export` + `DELETE /api/me`) задеплоєні.
- **Exit:** Stripe webhook events стабільні ≥7 днів, ≥10 paid Pro-subscriptions, OG-share/SEO повертає 200 без CSP-violations, Lighthouse LCP/FCP/TBT under thresholds (median).
- **Sequence:** [`release.md § 1`](../../../00-start/playbooks/release.md#1-web--api) (Coolify pre-deploy migration → API image rollout → Vercel web).

### CP-3 → Capacitor closed beta (week 6–8)

- **Entry:** CP-2 exit + Apple Developer-акаунт + Play Console-акаунт активний, Android signing keystore у GitHub Actions secrets (`SERGEANT_RELEASE_*`), Apple iOS secrets налаштовані ([`mobile/shell.md § Release — iOS`](../../../02-engineering/mobile/shell.md#release--ios)), store-listing assets (іконки 1024×1024, screenshots, short description).
- **Exit:** AAB у Play Internal Track + IPA у TestFlight internal, 5–15 internal-testers пройшли signup → demo → first-entry, 0 crashes у Sentry за ≥3 дні.
- **Surface flags:** native push prod creds (`APNS_BUNDLE_ID=com.sergeant.shell`) у server-env, OAuth deep-links через `ASWebAuthenticationSession` працюють.

### CP-4 → Capacitor public (week 8–10)

- **Entry:** CP-3 exit + Play закрита-бета на public-rollout staged 10%, App Store review passed (Privacy manifest + data safety).
- **Exit:** Staged rollout 100%, crash-free sessions ≥99.5% / 7d, ≥50 installs за 14 днів.

### CP-5 → Native (Expo) closed (week 12–16)

- **Entry:** CP-4 exit + Expo feature parity ≥20/22 рядків у [`platforms.md`](../../../02-engineering/architecture/platforms.md) (наразі 18/22), `eas build --profile production` зелений для iOS+Android, mobile-flaky-verify 20/20 baseline зелений.
- **Exit:** Internal Expo TestFlight + Play Internal Track build-и роздані 5–15 testers, ≥7 днів стабільності, dual-track decision-tree з ADR-0052 переоцінено (тригер — ≥18/22 ✅).

### CP-6 → Native (Expo) public (week 16–20+)

- **Entry:** CP-5 exit + успішний Apple/Google submission, store-listing assets фінальні, photo-AI / pantry / shopping / voice — closed-beta-tested.
- **Exit:** Production EAS-channel працює ≥14 днів, ≥100 installs, crash-free ≥99.5%.
- **Open question (див. § 7):** після CP-6 — sunset Capacitor чи dual-track довго?

---

## 7. Open questions для founder-а

1. **Бета-кохорта 10 vs 30 vs 100.** Скільки реальних людей залучати у CP-1 і коли робити «freeze» на нові інвайти? Чим менша когорта — тим швидше можна реагувати на 1:1-фідбек, але fnnel-метрики PostHog (Wizard → `first_real_entry` ≥30%) шумні на n<30.
2. **Stripe vs LemonSqueezy.** ADR-0051 фіксує Stripe + $7/$49. ФОП-настройка під Stripe займає 2–4 тижні (вал-рахунок). Чи готові ризикувати delay CP-2 на 4 тижні, чи розглядаємо merchant-of-record (LemonSqueezy) як bridge?
3. **Окремий лендінг — Astro vs Framer vs `/welcome`-only.** § 4 рекомендує Astro SSG; Framer швидший без dev-effort, але vendor-lock. Owner-prefer?
4. **iOS-капакітор vs нічого до Apple.** Якщо Apple Developer-акаунт ще не оформлено, чи запускаємо Capacitor Android-only на CP-3, чи чекаємо паралельний iOS-track?
5. **Native (Expo) — необхідний чи opt-in?** ADR-0052 говорить «обидва паралельно». При single-founder velocity native може займати 40% часу. Чи робимо native «pro-channel» (тільки для power-users з voice/photo-AI) і тримаємо Capacitor як default, чи пушимо native до full parity і тоді sunset Capacitor (ADR-0052 trigger)?
6. **Закрита бета мовою.** UA-only на старті, чи English-first з Day 1 (EN-локаль = Phase 6 у 0010)? Це впливає на копії лендінгу і вибір perfomance-каналів (Product Hunt = EN).
7. **Підготовка legal-/ФОП-track.** Хто реально виконує юр-чеклист [`04 § 1`](../business/04-launch-readiness.md#1-юридичне-та-compliance) — founder сам, юрист-консультант, чи Devin генерує draft-и під рев'ю?
8. **Real-user testing baseline.** Чи запускаємо paid acquisition (Google Ads / Meta Ads) на CP-2, чи тримаємось organic-only перші 4 тижні після public launch для чесного N1 baseline?

---
