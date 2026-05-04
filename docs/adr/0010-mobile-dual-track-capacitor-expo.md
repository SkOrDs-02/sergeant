# ADR-0010: Mobile dual-track — Capacitor shell + Expo native

- **Status:** accepted
- **Lifecycle:** dual-track with locked sunset (shell deprecation T₀ 2026-09-01 → T₂ 2027-02-28; RN-only after T₀ — див. § Sunset schedule)
- **Date:** 2026-04-27
- **Updated:** 2026-05-03 — added § Sunset schedule (T₀/T₁/T₂) per [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md)
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/architecture/platforms.md`](../architecture/platforms.md) — зведений статус web / native / capacitor-shell, включно з [feature-parity матрицею](../architecture/platforms.md#0-feature-parity-матриця-web-shell-rn).
  - [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) — ініціатива, що формалізує дедлайн і guardrails.
  - [`docs/mobile/overview.md`](../mobile/overview.md) — API-контракт для мобільного клієнта (auth, deep links, push).
  - [`docs/mobile/shell.md`](../mobile/shell.md) — operator-референс для shell, секція [Sunset](../mobile/shell.md#sunset).
  - [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md) — детальний roadmap порту web → RN.
  - [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts) — Expo SDK 52, RN 0.76, bundle `com.sergeant.app`.
  - [`apps/mobile-shell/capacitor.config.ts`](../../apps/mobile-shell/capacitor.config.ts) — Capacitor 7, `com.sergeant.shell`.

---

## 0. TL;DR

Sergeant тримає **дві мобільні доставки** у репо одночасно: **Capacitor-shell**
(`apps/mobile-shell`, WebView обгортка над `apps/web` бандлом) і **Expo/React
Native app** (`apps/mobile`, нативний клієнт на Expo SDK 52). Це не дублікація,
а **dual-track стратегія**: shell дає швидкий time-to-store сьогодні, RN — цільовий
long-term нативний клієнт. Обидва коекзистують з окремими bundle-ID-ами
(`com.sergeant.shell` vs `com.sergeant.app`), спільним API на Railway
(ADR-0009) і спільними domain-пакетами (`@sergeant/shared`,
`@sergeant/*-domain`).

| Трек              | App ID               | Навіщо                                                                   | Майбутнє                          |
| ----------------- | -------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Capacitor shell   | `com.sergeant.shell` | Швидкий реліз у store (web UX 1:1, WebView), офлайн через service worker | Deprecated коли RN досягне parity |
| Expo React Native | `com.sergeant.app`   | Нативний UX (haptics, native nav, APNs/FCM, background tasks)            | Цільовий клієнт                   |

Ключове рішення — **обидва існують одночасно** до моменту, коли RN покриє 100%
функціоналу Харчування, Voice і store-launch-критичні сценарії
(див. [`docs/architecture/platforms.md#2-native-rn--appsmobile`](../architecture/platforms.md)).

---

## Sunset schedule

> Locked-in deprecation timeline for `apps/mobile-shell`. Status `accepted` with the lifecycle marker `dual-track with locked sunset`
> означає, що dual-track — тимчасовий стан, не steady state. Дати нижче — **operational
> commitments**: про їх зсув мейнтейнер коментує тут і у [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) Outcome,
> з обґрунтуванням на основі feature-parity матриці у
> [`docs/architecture/platforms.md`](../architecture/platforms.md#0-feature-parity-матриця-web-shell-rn).

| Маркер | Дата           | Що відбувається                                                                                                                                                                                                                                                                                         |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T₀** | **2026-09-01** | Shell freeze. Усі shell-only PR-и (крім deprecation banner / sunset notice) на CR відхиляються. Lint-правило `sergeant-design/forbid-shell-only-feature` (вже live з 2026-05-03) перетворює це на блокінг у `pnpm lint`. RN — основний канал релізу.                                                    |
| **T₁** | **2026-11-30** | Remove-from-store. Shell `com.sergeant.shell` видаляється з Play Store і App Store (T₀ + 90 днів). Бета-канал shell-білду перед T₁ показує in-app banner з deep-link на RN-store-listing і отримує 2× push-нагадування у грейс-період T₀ … T₁.                                                          |
| **T₂** | **2026-12-30** | `apps/mobile-shell/` (TS + Android + iOS) видаляється з репо разом з ProGuard rules, GH Actions workflow-ами і Sentry-проєктом shell-у (T₁ + 30 днів). Архів `data-export/shell-events.parquet` (без PII) кладеться у `ops/data-archive/`. Lint-правило `forbid-shell-only-feature` лишається як guard. |

### Exit dashboard (читається з [`docs/architecture/platforms.md`](../architecture/platforms.md#0-feature-parity-матриця-web-shell-rn))

Три бінарні маяки. **Якщо хоча б один червоний на дату T₀ — T₀ зсувається на 30 днів** (новий T₁ і T₂ перераховуються відповідно), і у Outcome ініціативи 0002 публікується one-liner з причиною. Без публічного коментаря дата не зсувається.

| Маяк                         | Поточний стан (2026-05-03)                | Зеленіє коли                                                                                   |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **RN-Nutrition full parity** | 🟥 (recipes/photo-AI/AI-shopping — TBD)   | Усі три nutrition-рядки RN-колонки у feature-parity таблиці = `✅`.                            |
| **RN-Voice (STT/TTS)**       | 🟥 (Phase 7+, expo-speech не розгорнутий) | «Hub voice» у RN-колонці = `✅` (web-speech-fallback не зараховується).                        |
| **RN Detox real e2e**        | 🟡 (білд-сmoke; sign-in → module — TBD)   | Detox запускає sign-in → hub → fizruk/finyk/routine/nutrition × iOS+Android, всі зелені на CI. |

### Що зміниться у репо на T₀, T₁, T₂

- **T₀ (2026-09-01):**
  - Allowlist у `packages/eslint-plugin-sergeant-design/index.js` (rule `forbid-shell-only-feature`) **не** скорочується — він пасе snapshot 2026-05-03. Будь-який новий `.ts`/`.tsx` під `apps/mobile-shell/src/**`, який не входить у snapshot, падає на лінті. Виключення (deprecation banner, sunset modal) додаються у allowlist окремим PR із посиланням сюди.
  - `apps/mobile-shell/README.md` отримує banner «Shell is in sunset (T₀)».
  - Shell-білди (Android / iOS release pipeline) лишаються живі для bug-fix-only PR-ів — пайплайн `mobile-shell-android-release.yml` / `mobile-shell-ios-release.yml` без змін до T₂.
  - `docs/initiatives/0002-mobile-platform-decision.md` Outcome заповнюється cost-baseline-ом і pass/fail кожного маяка.

- **T₁ (2026-11-30):**
  - Internal-track upload через `google-github-actions/upload-google-play` зупиняється; останній shell-білд лишається `production` track із deep-link banner-ом.
  - App Links / Universal Links (`apple-app-site-association`, `assetlinks.json`) додають redirect на RN store-listing.
  - Marketing console (`tools/console`) перемикає shell deep-links на RN store-page.
  - Sentry shell-projct (`sergeant-mobile-shell`) переходить у read-only режим.

- **T₂ (2026-12-30):**
  - `apps/mobile-shell/` видаляється цілою папкою (включно з `android/`, `ios/`, `proguard-rules.pro`, `capacitor.config.ts`).
  - GH Actions workflow-и `mobile-shell-*.yml` видаляються.
  - `package.json` коренева workspace вилучає `apps/mobile-shell` із `pnpm-workspace.yaml`.
  - Lint-правило `forbid-shell-only-feature` лишається — гарантує, що ніхто не додасть `apps/mobile-shell` назад без явного перепогодження ADR.
  - Sentry shell-projct архівується + `data-export/shell-events.parquet` у `ops/data-archive/` (без PII).
  - ADR-0010 переписується у termimnal-state ADR (`status: superseded` + посилання на цей outcome).

### Shell-tax baseline (для Outcome ініціативи 0002)

Cost dual-track-у вимірюється `scripts/report-shell-tax.mjs` (вводиться разом із цим оновленням). Quick check:

```sh
node scripts/report-shell-tax.mjs --since 90 days ago
```

Скрипт рахує комміти, що тікли по `apps/mobile-shell/**`, і друкує summary, який мейнтейнер раз на спринт постить у `#mobile-channel` (через webhook у CI cron — окремий PR `ci-shell-tax-report`).

---

## ADR-10.1 — Чому взагалі dual-track, а не одна платформа

### Status

accepted.

### Context

Історично Sergeant — PWA (Vite+React+SW). «Встановлення» на iOS/Android
= Add-to-Home-Screen. Проблеми PWA:

1. **iOS Safari Web Push** — тільки з iOS 16.4+ (весна 2023), підтримка ~70%
   iOS-аудиторії. Нагадування про тренування / звички критичні для retention.
2. **Background-таски** — Service Worker обмежений, recurrent-sync API не
   підтримується Safari. Monday-auto-digest на iOS не спрацьовує без відкриття
   вкладки.
3. **Store presence** — пошук у App Store / Play Store — основний discovery-канал.
4. **Native UX** — haptics, native share sheet, native barcode-scanner, Keychain
   для bearer, native camera controls. PWA не дає parity.

Варіанти:

1. **Тільки PWA.** Ігноруємо iOS-retention і store-discovery. Відкинуто (див. вище).
2. **Тільки RN.** Чистий shot, але RN-порт — фіз 3–6 місяців роботи одного
   мейнтейнера (див. [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md)).
   На момент вирішення (2025-Q3) retention-пробоїни існували вже.
3. **Capacitor-only (WebView).** Швидкий time-to-store (WebView над готовим
   web-бандлом), native push через Capacitor-плагіни, deep-links. Але UX
   компромісний (WebView lag, iOS scroll-physics, no native nav).
4. **Dual-track (обидва).** Shell дає store-presence і push сьогодні, RN-порт
   ведеться паралельно і замінить shell, коли досягне feature-parity.

### Decision

**Dual-track.** Обидва живуть у репо (`apps/mobile-shell/` і `apps/mobile/`),
бандл-ID-и різні (`com.sergeant.shell` vs `com.sergeant.app`) — можуть бути
встановлені одночасно на одному пристрої (важливо для QA: side-by-side порівняння
UX). Обидва використовують один API на Railway (Better Auth bearer,
`/api/v1/*`, див. [`docs/mobile/overview.md`](../mobile/overview.md)).

### Consequences

**Позитивні:**

- Shell релізиться в store **зараз** без чекання RN-парiтету (див.
  [`docs/architecture/platforms.md`](../architecture/platforms.md) — Android shell уже має release-build
  pipeline, iOS — scaffolded).
- RN-порт іде **без deadline-паніки** — можна рефакторити модулі по одному
  (spec у [`react-native-migration.md`](../mobile/react-native-migration.md)).
- Shell і RN діляться спільним API + `@sergeant/shared` + domain-пакетами —
  код-реюз ~80% business logic.
- Легко пояснити юзерам: один брендинг, один логін, дві "версії" поки йде
  міграція. Коли RN стабільний, shell deprecate-иться.

**Негативні:**

- **Two apps in stores = двічі платимо Apple \$99/рік + Google \$25 one-time.**
  Прийнятно, але додатковий cost.
- **QA ширше** — треба тестувати і shell, і RN. Ми зменшили це через feature-parity
  table у [`docs/architecture/platforms.md`](../architecture/platforms.md) — список, що зроблено де.
- **Користувачі можуть плутатись** якщо обидва появляться в store. Мітігейт:
  shell реліз у **Internal / Closed track** Play / TestFlight до моменту RN
  parity, потім graceful deprecation shell-у (push-нотифікація + in-app
  банер "Оновіть до v2").
- **Push**: shell використовує web-push (VAPID), RN — native APNs/FCM через
  `expo-notifications`. Сервер `/api/v1/push/register` приймає обидва
  (`platform: web|ios|android`), але UX-розрізнення треба тримати у голові.

### Alternatives considered

- **"Big bang" RN-реліз.** Прибирає shell, але відкладає store-presence на 3–6
  місяців. В умовах одного мейнтейнера — неприйнятний ризик (один форс-мажор →
  ніякого релізу).
- **Tauri / other WebView.** Технічно рівноцінне Capacitor-у, але в нас уже є
  Capacitor + плагіни. Мігрувати без функціональної переваги — витрата часу.
- **React Native Web (shared codebase).** Перспективно, але наша web-апка
  сильно покладається на DOM-специфічні API (CSS opacity scale, Service Worker,
  IndexedDB) і Tailwind. Конвертувати на NativeWind + RN primitives — це і є
  RN-порт, не скорочення.

### Exit criteria

Shell переходить у `deprecated` коли **всі** пункти виконуються:

1. RN покриває 100% Харчування (parsePantry, photo-AI, day-plan, recipes —
   див. [`docs/architecture/platforms.md#2-native-rn`](../architecture/platforms.md)).
2. RN має reliable Voice-input (expo-speech + STT).
3. RN Detox e2e покриває login → hub → кожен модуль (smoke).
4. RN в App Store + Play Store (не тільки Internal track).
5. Migration-гід для shell-юзерів готовий (deep-link з shell на store RN-лістинг).

Після цього shell позначається `deprecated`, у store — Unpublish (Play) /
Remove from Sale (App Store).

---

## ADR-10.2 — Bundle-ID, бренд, coexistence на девайсі

### Status

accepted.

### Context

Якщо shell і RN мають однаковий bundle-ID, користувач не може мати їх одночасно
(install другого перезаписує перший). Це **унеможливлює side-by-side QA**.

### Decision

- Capacitor shell: `com.sergeant.shell` + назва "Sergeant Shell" / "Sergeant WV".
- Expo RN: `com.sergeant.app` + назва "Sergeant".

У store-listing shell-версія маркована як "Legacy / WebView" у описі, щоб
зменшити plutanice. QA-артефакти shell завжди приходять у
`sergeant-shell-*.apk` / `.ipa` (див.
[`docs/mobile/shell.md`](../mobile/shell.md)).

### Consequences

- Тестери можуть мати обидві версії — порівняння баг-репортів зрозуміліше.
- User-ам через update ~~нічого не ламається — кожна версія апдейтиться
  окремо. Shell-deprecation робимо через migration-банер, не через crash.
- Sentry/Analytics розділяють події через `app_id` tag — не плутаються метрики.

### Alternatives considered

- **Один bundle-ID, reuse install-slot.** Спрощує store presence, але ламає
  coexistence і QA. Відкинуто.
- **Один bundle-ID, flag у app config.** Завантажувач обирає shell-runtime
  vs RN runtime — неможливо у Apple Review (заборонено завантажувати
  виконуваний код, окрім Apple JIT).

### Exit criteria

n/a (operational rule, живе до deprecation shell-у).

---

## ADR-10.3 — Code sharing: `@sergeant/shared` + domain-пакети

### Status

accepted.

### Context

Обидва клієнти потребують спільну бізнес-логіку: kcal math, budget calc, streak
count, RQ-keys factory, `KVStore` contract (ADR-0011), `api-client`, Zod-схеми.

### Decision

Усі платформо-нейтральні пакети живуть у `packages/*`:

- `@sergeant/shared` — Zod-схеми, types, utility-функції, FTUX/storage contract.
- `@sergeant/api-client` — HTTP-клієнт + типи API response shapes.
- `@sergeant/finyk-domain`, `@sergeant/fizruk-domain`, `@sergeant/nutrition-domain`,
  `@sergeant/routine-domain` — domain-логіка.
- `@sergeant/insights` — cross-module analytics.
- `@sergeant/design-tokens` — Tailwind / NativeWind preset, brand colors.
- `@sergeant/config` — shared Node config (TS-compiler, ESLint).

Код **НЕ** може використовувати DOM (`window`, `localStorage`, `document`) або
Node-only API (`fs`, `path`) — перевіряємо через ESLint + `"dom"` виключений з
`lib` у пакетах. Платформо-специфічні адаптери живуть у відповідних apps:

- `apps/web/src/shared/lib/*` — localStorage, Service Worker, Web Speech API.
- `apps/mobile/src/lib/*` — MMKV, expo-secure-store, expo-speech.
- `apps/mobile-shell/src/*` — Capacitor-плагіни (Preferences, Camera-MLKit).

### Consequences

**Позитивні:**

- ~80% logic-reuse між web/mobile без дубляжу (див. RN-migration snapshot).
- Єдиний source of truth для Zod-схем → API-response типи не розходяться
  (примусить hard-rule #3 у [AGENTS.md](../../AGENTS.md)).
- Тести domain-пакетів не знають про платформу → швидкі, без JSDOM / RN env.

**Негативні:**

- Дисципліна: треба періодично сканувати `packages/*` на accidental DOM-reach.
- Дві інстанції React (web RN+web) — не можна ділити React-компоненти напряму.
  Компоненти лишаються platform-specific (UI шар).

### Alternatives considered

- **Usage `react-native-web`.** Дає shared UI, але потребує суттєвого
  переписування Tailwind → NativeWind-compatible styling. Не дає достатньо
  value у порівнянні з shared-only-logic pattern.
- **Monolithic package with conditional exports.** `package.json#exports` з
  `"react-native"` vs `"browser"` маппінгом — працює, але складніший debugging,
  deps resolution. Поки не треба.

### Exit criteria

n/a (операційна конвенція).

---

## ADR-10.4 — Auth на мобілці: bearer, не cookie

### Status

accepted.

### Context

Веб-клієнт (ADR-0009) використовує cookie-based session (Better Auth default).
Для native (Expo RN) і WebView shell-у cookie working differently:

- **Expo RN** — немає same-origin concept, cookie jar не спільний з backend;
  `@better-auth/expo` офіційно рекомендує bearer-tokens у SecureStore.
- **Capacitor shell** — WebView зберігає cookie, але iOS iTP може їх чистити
  агресивно; крім того, у shell-у ми використовуємо Capacitor Preferences
  для bearer через native Keychain/EncryptedSharedPreferences (див.
  [`apps/mobile-shell/src/*`](../../apps/mobile-shell/src) та ADR-0011).

### Decision

- **Expo RN:** `Authorization: Bearer <token>` у всіх `/api/v1/*` запитах;
  токен зберігається у `expo-secure-store` через `@better-auth/expo/client`.
- **Capacitor shell:** bearer у `@capacitor/preferences` (Keychain/Encrypted
  SharedPreferences), HTTP-клієнт patch-иться у `auth-storage.ts` для
  автододавання `Authorization` header.
- Сервер підтримує **обидва** — Better Auth `bearer` plugin конвертує bearer у
  in-memory сесію, `getSessionUser` працює однаково для cookie/bearer.

### Consequences

**Позитивні:**

- Single auth-endpoint (`/api/auth/*`) для всіх трьох поверхонь (web, shell, RN).
- Token у native storage — survives app kill, не доступний через JS-injection
  (на відміну від localStorage).

**Негативні:**

- Shell JS повинен знати, в якому контексті живе (WebView vs browser) — через
  guard `isCapacitor()` у `packages/shared/src/lib/platform.ts` (ре-експорт
  через `@sergeant/shared`; раніше жив у `apps/web/src/shared/lib/<platform>.ts`
  і був винесений у shared разом з ADR-0024 монорепо split-ом — `<…>` на
  старому шляху, бо файлу там вже немає). Мусимо пам'ятати на code-review.
- Revoke-flow: cookie на web expire-ить сам, а bearer треба явно видалити зі
  SecureStore/Preferences + інвалідувати на сервері. Реалізовано у
  `sign-out` handler-і, але з trust-but-verify нотаткою у тесті.

### Alternatives considered

- **JWT без Better Auth session-store.** Втрачаємо server-side revoke (можна
  тільки чекати TTL). Для sensitive операцій (cancel subscription, зміна
  email) неприйнятно.
- **Cookie тільки.** На Expo RN не працює надійно; на shell WebView ламає iOS
  Web Push-flow (registration потребує subdomain-aware cookie). Відкинуто.

### Exit criteria

n/a.

---

## ADR-10.5 — Push: per-platform реєстрація через єдиний endpoint

### Status

accepted.

### Context

Три різних transport-и для пушів: Web Push (VAPID → fcm.googleapis.com),
APNs (iOS), FCM HTTP v1 (Android). Одна схема реєстрації потрібна, інакше
сервер не знає, куди слати.

### Decision

Один endpoint `POST /api/v1/push/register` приймає `platform: "web" | "ios" | "android"`
і `token` (subscription-object для web, device token для native). Сервер
робить upsert у `push_devices` таблиці (див. `apps/server/src/migrations/006_push_devices.sql`)
ідемпотентно (дубль реєстрації того самого токена — просто `updated_at` бамп).

Клієнти:

- **web (PWA)** — Service Worker + VAPID, `usePushNotifications` хук.
- **Capacitor shell** — web-push з VAPID, але iOS 16.4+ only; Android chrome-based
  WebView працює.
- **Expo RN** — `PushRegistrar` дістає native APNs/FCM через `getDevicePushTokenAsync()`.

Send-флоу на сервері: окремі кодшляхи для web-push (`webpush.sendNotification`)
та native (APNs HTTP/2 або FCM HTTP v1) — вибирається за `device.platform`.

### Consequences

**Позитивні:**

- Один API-endpoint — `@sergeant/api-client` має один тип.
- Idempotent — клієнти можуть реєструвати агресивно (кожен login/boot) без
  risk-у дубльованих рядків.
- Сервер може надіслати push на всі платформи юзера fan-out-ом без per-platform
  branching у business logic.

**Негативні:**

- Credentials для native-push (APNs key, FCM service account) — окремий
  operational setup ([`docs/tech-debt/backend.md`](../tech-debt/backend.md)).
  Shell-юзерів можна нотифікувати тільки через VAPID, поки RN parity не досягнуть.

### Exit criteria

n/a.

---

## Open questions

1. **Detox e2e на RN — smoke only.** Поки що `detox-android.yml` / `detox-ios.yml`
   роблять build-only sanity; treba реальні сценарії (login → hub → модуль),
   щоб reliably catch-ати regressions у RN-шарі.
2. **Voice на RN.** Web Speech API → `expo-speech` + платформний STT (iOS
   Speech framework / Android SpeechRecognizer). Phase 7+, окремий ADR.
3. **Shell deep-link → RN app open.** Коли deprecation close, shell покаже
   банер з deep-link у store-listing RN-апки. Питання UX — коли саме запускати
   банер (login? кожен open? первинне відкриття після update?).
4. **iOS TestFlight release automation.** Pipeline scaffolded, потребує
   Apple-секретів (див. [`docs/architecture/platforms.md`](../architecture/platforms.md#3-capacitor-shell--appsmobile-shell)).

---

## Implementation tracker

| Arte-fact                                                          | Статус                       |
| ------------------------------------------------------------------ | ---------------------------- |
| `apps/mobile-shell/` Capacitor 7 config + Android release pipeline | live                         |
| `apps/mobile/` Expo SDK 52 + Expo Router + 4 модулі                | internal dev-client          |
| `@sergeant/shared` + domain пакети без DOM/Node                    | enforced via TS              |
| Bearer auth (SecureStore / Preferences)                            | live                         |
| Push register `/api/v1/push/register` ідемпотентний                | live                         |
| iOS TestFlight release pipeline (shell)                            | scaffolded (secrets pending) |
| RN Detox real e2e scenarios                                        | TBD                          |
| Voice on RN (STT)                                                  | TBD (Phase 7+)               |
| Shell deprecation migration flow                                   | TBD                          |
