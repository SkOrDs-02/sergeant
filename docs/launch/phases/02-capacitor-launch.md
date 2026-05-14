# Phase 2 — Capacitor launch roadmap with users

> **Last validated:** 2026-05-13 by Devin (Phase 2 child session of `andrijvigrav@gmail.com`). **Next review:** 2026-08-11.
> **Status:** Active — research deliverable for the parent launch program.
> **Owner surface:** `apps/mobile-shell` (Capacitor 7 shell over `apps/web`).
> **Strategy anchor:** [ADR-0052 — Capacitor primary, Expo parallel](../../adr/0052-mobile-strategy-capacitor-primary.md).
> **Sibling phases:** Phase 1 — Web (`01-web-launch-with-users.md`), Phase 3 — Native Expo (`03-native-expo-launch.md`), Phase 0 — audit (`00-readiness-audit.md`).
> **Scope:** як запустити Capacitor-shell на TestFlight + Play Internal Testing і провести цикл бета-тестування з реальними людьми до GA.

---

## Розділ 1. TLDR + entry criteria

### 1.1 TLDR (3 речення)

Capacitor shell (`@sergeant/mobile-shell`) — це primary mobile-поверхня Sergeant за [ADR-0052](../../adr/0052-mobile-strategy-capacitor-primary.md), і вона **технічно готова** до перших підписаних білдів: release-pipeline на Android ([`mobile-shell-android-release.yml`](../../../.github/workflows/mobile-shell-android-release.yml)) і iOS ([`mobile-shell-ios-release.yml`](../../../.github/workflows/mobile-shell-ios-release.yml)) уже мерджнуті, signing-контракти задокументовані, native push (APNs/FCM) і HTTPS-deep-links інтегровані. Реальний запуск з юзерами зараз блокується двома операційними справами — Apple Developer Program enrollment / ASC API ключі та Google Play Console + service-account JSON для авто-upload-у — а не кодом. Цей документ описує 4–8-тижневий план: тиждень 1–2 — store enrollment + перший unsigned smoke; тиждень 3–4 — TestFlight + Play Internal билди з 5–10 internal тестерами; тиждень 5–8 — closed beta 50–150 external testers, потім staged production rollout.

### 1.2 Entry criteria (що має бути готове від Phase 1 — Web)

Phase 2 стартує лише коли Phase 1 (Web) виконала ці чек-пункти. Інакше bottom-up shell-білд буде багий «не своєю провиною»:

- [ ] **Web build стабільний на production-домені.** `apps/server/dist` ↔ Vercel ↔ Railway зв'язка зелена, [`vercel.json`](../../../vercel.json) `outputDirectory → apps/server/dist` (PR [#508](https://github.com/Skords-01/Sergeant/pull/508) уже мерджнуто).
- [ ] **`pnpm --filter @sergeant/mobile-shell build:web` працює без warning-ів.** Це делегує до `@sergeant/web build:capacitor` (`VITE_TARGET=capacitor`), який вимикає `vite-plugin-pwa` — у shell-бандлі НЕ повинно бути `sw.js`, `manifest.webmanifest`, `virtual:pwa-register`.
- [ ] **Bearer-auth контракт зелений.** Login flow з web → shell-WebView повертає bearer-токен у `auth-storage.ts` (Keychain / EncryptedSharedPreferences) — інтеграція з PR [#505](https://github.com/Skords-01/Sergeant/pull/505).
- [ ] **API доступний з `com.sergeant.shell://` origin.** `apps/server/src/middleware/cors.ts` має дозволяти shell-host-и; web-варіант CORS вже live.
- [ ] **Privacy Policy + Terms of Service опубліковані на public URL.** Без цього Apple/Google reject-нуть store-listing — див. [`docs/launch/business/04-launch-readiness.md` §1.1](../business/04-launch-readiness.md#11-обовʼязкові-документи).
- [ ] **Sentry web-проєкт live + `applyWebBeforeSend` працює.** WebView consume-ить той самий `apps/web/src/core/observability/sentry.ts` — shell автоматично отримує crash-reporting без окремої інтеграції.
- [ ] **Зафіксована baseline-версія `versionCode = 1`, `versionName = 1.0`** у [`apps/mobile-shell/android/app/build.gradle`](../../../apps/mobile-shell/android/app/build.gradle).

### 1.3 Exit criteria (Phase 2 → Phase 3)

Phase 2 завершена, коли:

- Capacitor shell у TestFlight External Testing + Play Internal Testing з ≥ 50 активних бета-тестерів за ≥ 14 днів.
- Crash-free session rate ≥ 99.0 % на iOS і ≥ 98.5 % на Android (метрики — див. §10).
- D7-retention бета-юзерів ≥ 15 % (бенчмарк з GTM §3.3).
- ≥ 1 staged production rollout (1 % → 10 % → 50 % → 100 %) без catastrophic-rollback.
- Прийнято рішення по §12: чи стартувати Phase 3 (Native Expo) як паралельний трек, чи відкласти до Expo feature-parity (Exit dashboard у [`docs/architecture/platforms.md`](../../architecture/platforms.md)).

---

## Розділ 2. Статус Capacitor зараз

Цей розділ — **факти з коду / docs**, не плани. Кожне твердження посилається на конкретний файл.

### 2.1 Стратегія

- [ADR-0052 — Capacitor primary, Expo parallel](../../adr/0052-mobile-strategy-capacitor-primary.md), status `Accepted`, дата 2026-05-06.
- Sunset-дати T₀ (2026-09-01) / T₁ (2026-11-30) / T₂ (2026-12-30), згадані у [`docs/mobile/shell.md` § Sunset](../../mobile/shell.md#sunset) та [ADR-0010](../../adr/0010-mobile-dual-track-capacitor-expo.md) — **не є active commitments** на період 0010 launch, але reference лишається.
- Тригер для наступного ADR («Expo becomes primary»): Expo `apps/mobile/` досягає feature parity (≥ 18/22 рядків ✅ у матриці [`platforms.md` § 0](../../architecture/platforms.md#-0-feature-parity-матриця-web--shell--rn)).
- Lint-правило `sergeant-design/forbid-shell-only-feature` активне — нові shell-only модулі без RN-mirror блокуються, але **shell-glue PR-и дозволяються через `SHELL_GLUE_ALLOWLIST`** у [`packages/eslint-plugin-sergeant-design/`](../../../packages/eslint-plugin-sergeant-design/).

### 2.2 Що готово (production-ready)

Джерело: [`apps/mobile-shell/README.md`](../../../apps/mobile-shell/README.md) § «Що готово», станом на 2026-05-13.

| Capability                                               | Реалізація                                                                                                                                                                                                                                                                            | PR                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Bearer-auth (Keychain / EncryptedSharedPreferences)      | `@capacitor/preferences` через `src/auth-storage.ts`                                                                                                                                                                                                                                  | [#505](https://github.com/Skords-01/Sergeant/pull/505)            |
| Native barcode scanner                                   | `@capacitor-mlkit/barcode-scanning` через `src/barcodeNative.ts`                                                                                                                                                                                                                      | [#504](https://github.com/Skords-01/Sergeant/pull/504)            |
| Status bar + splash + keyboard + deep links              | `@capacitor/{status-bar,splash-screen,keyboard,app}`                                                                                                                                                                                                                                  | [#506](https://github.com/Skords-01/Sergeant/pull/506)            |
| Android hardware Back → web-history traversal            | `App.backButton` → `window.history.back()` / `App.exitApp()` із 2-tap confirm (`BACK_TO_EXIT_WINDOW_MS = 2000`)                                                                                                                                                                       | M20 hardening                                                     |
| Native push (APNs/FCM) — токен-registration              | `@capacitor/push-notifications` + `src/pushNative.ts` + server `push_devices`                                                                                                                                                                                                         | [#512](https://github.com/Skords-01/Sergeant/pull/512)            |
| Custom-scheme deep links (`com.sergeant.shell://`)       | `parseDeepLink()` + `App.addListener('appUrlOpen')` + sanitiser `isSafeShellPath()` (M19)                                                                                                                                                                                             | core                                                              |
| HTTPS Universal Links (iOS) / App Links (Android)        | `assetlinks.json` + `apple-app-site-association` у `apps/web/public/.well-known/`, Vercel headers + rewrite                                                                                                                                                                           | [`capacitor-deep-links.md`](../../mobile/capacitor-deep-links.md) |
| Deep-link dispatch у web                                 | `BroadcastChannel("sergeant-shell-deeplink")` (canonical, PR-29 [#2526](https://github.com/Skords-01/Sergeant/pull/2526)) + `window.__sergeantShellNavigate` (backward-compat shim до PR-2 у серпні 2026)                                                                             | core                                                              |
| Android native проєкт закомічений                        | `apps/mobile-shell/android/`                                                                                                                                                                                                                                                          | core                                                              |
| Android debug-APK на PR                                  | [`mobile-shell-android.yml`](../../../.github/workflows/mobile-shell-android.yml), артефакт `sergeant-shell-debug-apk` (14 днів retention)                                                                                                                                            | core                                                              |
| Android release pipeline (AAB + APK)                     | [`mobile-shell-android-release.yml`](../../../.github/workflows/mobile-shell-android-release.yml), артефакти `sergeant-shell-release-aab` + `sergeant-shell-release-apk`                                                                                                              | core                                                              |
| Android release-signing + ProGuard/R8                    | `signingConfigs.release` у `android/app/build.gradle` читає `SERGEANT_RELEASE_*` env; `minifyEnabled = true`, `shrinkResources = true`, Capacitor keep-rules у `proguard-rules.pro`                                                                                                   | core                                                              |
| iOS PR-time білд (Simulator, unsigned)                   | [`mobile-shell-ios.yml`](../../../.github/workflows/mobile-shell-ios.yml) на `macos-latest`, `CODE_SIGNING_ALLOWED=NO`                                                                                                                                                                | core                                                              |
| iOS release pipeline (signed `.ipa` + TestFlight upload) | [`mobile-shell-ios-release.yml`](../../../.github/workflows/mobile-shell-ios-release.yml) — `xcodebuild archive` + `exportArchive` через [`apps/mobile-shell/ci/ExportOptions.plist`](../../../apps/mobile-shell/ci/ExportOptions.plist) + `apple-actions/upload-testflight-build@v1` | core                                                              |
| Crash reporting                                          | Web-shared Sentry (`apps/web/src/core/observability/sentry.ts → applyWebBeforeSend`) — `getPlatform()` маркує shell-events як `platform: "capacitor"`. Окремого native-SDK немає; WebView crashes ловить web-SDK.                                                                     | core                                                              |
| Analytics                                                | PostHog через web — shell автоматично receives events, бо WebView                                                                                                                                                                                                                     | core                                                              |

### 2.3 Що НЕ зроблено (блокери реального запуску з юзерами)

Джерело: [`apps/mobile-shell/README.md`](../../../apps/mobile-shell/README.md) § «Що НЕ зроблено», [`docs/architecture/platforms.md` § 3 Capacitor shell](../../architecture/platforms.md#-3-capacitor-shell--appsmobile-shell), [`docs/mobile/shell.md`](../../mobile/shell.md).

- **Play Store автоматичний upload через service account.** Release-signing + AAB + APK pipeline готовий, але `google-github-actions/upload-google-play` step ще не доданий — потрібен `ANDROID_PLAY_SERVICE_ACCOUNT_JSON` secret + Play Console listing + internal-track rollout plan. Поки що maintainer бере артефакт з Actions і заливає вручну.
- **iOS native проєкт (`apps/mobile-shell/ios/`) свідомо НЕ закомічений.** `cap add ios` робиться в CI на `macos-latest` (release workflow кешує `~/.cocoapods` + `ios/App/Pods` через `actions/cache`). Перший tag-push повільний (~10 хв на Pods resolution); подальші — з кеша.
- **Apple Developer Program enrollment + ASC API ключі ще не provisioned у repo secrets.** Без 7 секретів iOS release падає у unsigned Simulator-fallback (логує `::warning::iOS release secrets not configured, skipping signed build`).
- **Native IAP (Apple StoreKit / Google Play Billing) у shell не реалізований.** Зараз billing — лише через Stripe checkout, який shell відкриває як WebView-flow. Це створює ризик з Apple Review Guideline 3.1.1 для health/finance subscription (див. §8 і §9).
- **iOS safe-area + splash race.** CSS `env(safe-area-inset-*)` покриває 99 % кейсів, але якщо splash триматиметься довше 3с (failsafe `launchShowDuration: 3000` у [`capacitor.config.ts`](../../../apps/mobile-shell/capacitor.config.ts)), користувач може побачити блимання статус-бару. Кандидат на тюнінг до бети.
- **Native APNs/FCM send-pipeline.** `src/pushNative.ts` реєструє токен і шле його у `push_devices`, але серверний `dispatch`-step через APNs/FCM ще не написаний — див. [`docs/mobile/overview.md` § Push notifications](../../mobile/overview.md#push-notifications). На beta достатньо токен-registration smoke; на GA потрібен повний send.
- **App Store / Play Store метадані.** Іконки (1024×1024 iOS, всі density-bucket-и Android), screenshots (6.7" + 5.5" iPhone, 7" + 10" Android tablet), short/long description, keywords, category, age rating — все ще TODO. RN-апка теж не має цього (див. [`platforms.md` § 2](../../architecture/platforms.md#-2-native-rn--appsmobile)), тож матеріали робляться раз і re-use-ються.
- **Privacy manifest (iOS PrivacyInfo.xcprivacy)** і **Data safety form (Play Console)** — обов'язкові для нових listing-ів з 2024-05 (iOS) і 2024-04 (Android). Заповнюються на основі sub-processor списку з [`04-launch-readiness.md` §1.1](../business/04-launch-readiness.md#11-обовʼязкові-документи).

### 2.4 Версії і tooling

Джерело: [`docs/mobile/shell.md` § Передумови](../../mobile/shell.md#передумови) + [`apps/mobile-shell/package.json`](../../../apps/mobile-shell/package.json).

| Інструмент        | Версія                      | Нотатки                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------------ |
| Node.js           | 20.x (з `.nvmrc`)           | `nvm install 20 && nvm use 20`                               |
| pnpm              | 9.15.1                      | `corepack enable && corepack prepare pnpm@9.15.1 --activate` |
| JDK               | 21 (Temurin)                | Capacitor 7.6+ компілює у VERSION_21, AGP 8                  |
| Android SDK       | API 35 (compile) / 23 (min) | Android Studio або `sdkmanager`                              |
| Xcode + CocoaPods | latest stable               | тільки macOS                                                 |
| Capacitor         | 7.6.2                       | `@capacitor/{core,android,ios,cli}`                          |

---

## Розділ 3. iOS lane — план дій

### 3.1 Apple Developer Program enrollment

Якщо ще не виконано (а судячи з відсутності `IOS_TEAM_ID` у repo secrets, ні):

1. **Зареєструватись як організація або individual.** Для health/finance app індивідуального enrollment-у достатньо на старті ($99/рік), але для App Store listing-у з business name бажано organization ($99/рік + D-U-N-S Number, видається безкоштовно через Dun & Bradstreet, ~14 днів на отримання). Окремо: D-U-N-S блокер може з'їсти 2 тижні — це треба робити **зараз**, паралельно з кодовою роботою.
2. **Створити App ID `com.sergeant.shell`** у Apple Developer Portal → Certificates, Identifiers & Profiles → Identifiers. Має точно співпадати з `appId` у [`capacitor.config.ts`](../../../apps/mobile-shell/capacitor.config.ts).
3. **Capabilities, які треба ввімкнути на App ID:**
   - Associated Domains — для Universal Links (`applinks:sergeant.vercel.app`, `applinks:sergeant.2dmanager.com.ua`; список — у `DEEP_LINK_HTTPS_HOSTS` у [`apps/mobile-shell/src/index.ts`](../../../apps/mobile-shell/src/index.ts)).
   - Push Notifications — для APNs.
   - Sign in with Apple — **тільки якщо** використовується Google OAuth (App Store Review Guideline 4.8 вимагає paralleled Sign in with Apple).
4. **Створити App Store Connect listing.** App Store Connect → My Apps → `+` → New App. SKU: `sergeant-shell`. Bundle ID: вибрати `com.sergeant.shell`.

### 3.2 Сертифікати + provisioning profiles

Джерело правди — [`docs/mobile/shell.md` § Release — iOS](../../mobile/shell.md#release--ios). Сім обов'язкових secrets для [`mobile-shell-ios-release.yml`](../../../.github/workflows/mobile-shell-ios-release.yml):

| Secret                              | Звідки взяти                                                                                    | Where used                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| `APPLE_BUILD_CERTIFICATE_BASE64`    | Apple Distribution `.p12` → `base64 -i ios_distribution.p12`                                    | імпорт у per-run keychain  |
| `APPLE_P12_PASSWORD`                | пароль `.p12` під час експорту                                                                  | discover cert у keychain   |
| `APPLE_PROVISIONING_PROFILE_BASE64` | _(опційно якщо використовується ASC API auto-fetch)_ App Store profile для `com.sergeant.shell` | `xcodebuild exportArchive` |
| `APPLE_KEYCHAIN_PASSWORD`           | `openssl rand -hex 32` — per-run keychain password                                              | keychain create            |
| `APP_STORE_CONNECT_API_KEY_ID`      | ASC → Users and Access → Integrations → App Store Connect API → ключ з роллю **App Manager**    | TestFlight upload          |
| `APP_STORE_CONNECT_API_ISSUER_ID`   | той самий екран → UUID угорі                                                                    | TestFlight upload          |
| `APP_STORE_CONNECT_API_KEY_BASE64`  | `.p8` файл → `base64 -i AuthKey_<KEY_ID>.p8` (one-shot, повторно не дають)                      | TestFlight upload          |
| `IOS_TEAM_ID`                       | Apple Developer → Membership → 10-символьний Team ID                                            | `xcodebuild`               |

Плюс repo variables (`vars.*`, не секрети):

- `IOS_BUNDLE_ID` = `com.sergeant.shell` (default).
- `IOS_PROVISIONING_PROFILE_NAME` = `Sergeant Shell App Store` (human-readable, не UUID).

### 3.3 Перший білд + TestFlight onboarding

```bash
# 1. Замержити всі 7 secrets у Repo → Settings → Secrets and variables → Actions.
# 2. Створити release-тег:
git tag v0.1.0-shell.1
git push origin v0.1.0-shell.1
# 3. Workflow run триггериться автоматично. Перший — повільний (~10 хв додатково на CocoaPods install,
#    бо ios/ генерується з нуля). Подальші — з actions/cache.
```

Після успішного запуску:

- **`.ipa` як GitHub artifact** (`sergeant-shell-ipa`, 14 днів retention) — корисно для sideload-у на дев-девайс через TestFlight «direct link» або Diawi / Apple Configurator 2.
- **TestFlight processing** — Apple внутрішньо обробляє білд 5–20 хв. Email-нотифікація: «build is ready for testing».
- **Перші Internal testers** — App Store Connect → TestFlight → обрати білд → **Internal Testing** group → Add Testers by Email. Internal testers (до 100) — це члени команди Apple Developer (App Manager / Developer rolă); видно одразу, не потрібен Beta App Review.

### 3.4 External Testing (для бета-юзерів поза командою)

- **TestFlight External Testing group** — до 10 000 testers. Додаються через email або **public link** (`https://testflight.apple.com/join/XXXXXXXX`).
- **Beta App Review** — обов'язковий для першого External групи: Apple перевіряє білд (24–48 годин типово). Для подальших білдів того ж feature scope — auto-approved.
- **Public link** — найшвидший спосіб скейлити бета з ботом / Telegram-каналу: один URL → install TestFlight → install Sergeant Shell.

### 3.5 In-App Purchase (IAP) setup — якщо потрібно

**Дуже важливо:** Apple Review Guideline 3.1.1 («In-App Purchase») вимагає, щоб **будь-яка digital subscription / unlock того, що споживається в app**, йшла через StoreKit IAP. Stripe-checkout у WebView для Sergeant Pro формально порушує це правило для iOS shell — окрім нюансу «reader app» (App Store Review Guideline 3.1.3(a)), що дозволяє external billing для контенту, який юзер купує **поза app**. Sergeant — це AI-coach + sync engine, не reader, тож reader-exception не покриває.

Два робочі варіанти на iOS:

- **Варіант A — додати StoreKit IAP паралельно зі Stripe.** Створити subscription group у App Store Connect, ціни в локальних валютах (Apple авто-конвертить через price-tier таблицю). Бекенд приймає server-to-server `notificationsV2` events, оновлює `subscriptions` table. Капітальні витрати: +15–30 % комісія Apple (15 % перший рік, 30 % після) і ~2 тижні роботи на серверний валідатор + UI. Це канонічна відповідь, яку Apple очікує.
- **Варіант B — не показувати paywall на iOS shell.** Free-tier тільки. Якщо юзер хоче Pro — open external link у Safari, де працює Stripe checkout. Це **дозволено** за оновленням App Store Review Guideline 3.1.1(a) від 2024-01 (post-Epic-v-Apple), але **в межах reader-apps**; для non-reader app це сіра зона. Apple може reject-нути за «steering users to alternative purchasing methods» — потрібно `external-link-account-entitlement` (раніше тільки для US after 2024-01-16; з 2025 — глобально для music streaming + EU за DMA).

**Рекомендація для Phase 2 launch:** стартувати з варіантом B (free-only iOS shell), збирати feedback, паралельно імплементувати варіант A до GA. На бета юзери чекають вартісну функціональність, не платіж — це buy time для StoreKit інтеграції без блокування beta. Див. §9 для cross-platform монетизації.

### 3.6 App Store listing prep

- **App icon** — 1024×1024 PNG без альфа-каналу.
- **Screenshots** — обов'язкові: 6.7" (1290×2796), 6.5" (1284×2778), 5.5" (1242×2208). Optional: iPad 12.9" / 13".
- **App Preview video** — 15–30 с, опційно (підвищує conversion ~25 %).
- **Description** — до 4000 символів. Локалізації: en, uk (мінімум; пізніше — pl, de, ru за пріоритетом).
- **Keywords** — 100 символів total, comma-separated. Приклади: `finance,fitness,habits,nutrition,ai coach,life tracker,journal,wellness`.
- **Privacy Policy URL** — обов'язково. Лінк на public Privacy Policy сторінку Sergeant (див. [`04-launch-readiness.md` §1.1](../business/04-launch-readiness.md#11-обовʼязкові-документи)).
- **App Privacy Details (Nutrition labels)** — заповнюється в ASC. Категорії, які треба позначити для Sergeant: Contact Info (email), Identifiers (User ID), Usage Data (analytics), Diagnostics (Sentry), Financial Info (якщо Monobank integration зачіпається на iOS), Health & Fitness (workouts, body metrics, nutrition).
- **Age rating** — пройти questionnaire. Очікувано: 4+ (no objectionable content); якщо є alcohol/tobacco у nutrition — 12+.
- **Category** — Primary: **Health & Fitness**; Secondary: **Productivity** або **Finance**. Primary визначає review-team у Apple — Health отримує stricter review (~3 дні vs 1–2).

---

## Розділ 4. Android lane — план дій

### 4.1 Google Play Console enrollment

1. **Створити Google Play Developer account** — $25 one-time (vs Apple $99/рік) на https://play.google.com/console/signup. Потребує верифікації identity через гос. документ (UA passport / ID-card працює).
2. **Створити app у Play Console** — App name: `Sergeant`, Default language: Ukrainian, App type: App, Free or paid: Free.
3. **Заповнити обов'язкові секції** перед першим release:
   - App access (якщо потрібен login для тесту — надати тестовий акаунт Apple/Google review team).
   - Ads — declare. Sergeant: no ads.
   - Content rating questionnaire (IARC).
   - Target audience — 18+ (фінансовий + health).
   - News apps — no.
   - COVID-19 contact tracing — no.
   - Data safety (див. §4.6).
   - Government apps — no.
4. **App content section** — Privacy Policy URL (той самий, що для Apple).

### 4.2 Signing keystore generation

Одноразовий локальний крок (НЕ в CI, не в репо!). Джерело — [`docs/mobile/shell.md` § Release — Android](../../mobile/shell.md#release--android).

```bash
keytool -genkeypair -v \
  -keystore sergeant-shell-release.keystore \
  -alias sergeant-shell \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storetype PKCS12

base64 -w0 sergeant-shell-release.keystore > sergeant-shell-release.keystore.base64
```

**КРИТИЧНО:** keystore-файл + storepass + keypass треба зберегти у командному password-manager (1Password / Bitwarden) ПЛЮС у локальному бекапі (encrypted). Втрата keystore = неможливість шипити апдейт у той самий Play Store listing назавжди. Play Asset Signing з 2022 робить opt-in **upload key** rotation можливою, але краще не покладатись.

### 4.3 GitHub Secrets — 4 записи

| Secret                              | Значення                              |
| ----------------------------------- | ------------------------------------- |
| `ANDROID_RELEASE_KEYSTORE_BASE64`   | вміст `.keystore.base64` (один рядок) |
| `ANDROID_RELEASE_KEYSTORE_PASSWORD` | `-storepass` з `keytool`              |
| `ANDROID_RELEASE_KEY_ALIAS`         | `sergeant-shell`                      |
| `ANDROID_RELEASE_KEY_PASSWORD`      | `-keypass` для alias                  |

[`mobile-shell-android-release.yml`](../../../.github/workflows/mobile-shell-android-release.yml) декодує base64-blob у файл на runner-і, експортує 4 `SERGEANT_RELEASE_*` env-змінних (які читає `apps/mobile-shell/android/app/build.gradle`), запускає `./gradlew :app:bundleRelease :app:assembleRelease`, і видаляє декодований keystore у `post`-кроці.

Без цих secrets workflow усе одно ганяється у unsigned-fallback режимі — корисно для smoke-test ProGuard/R8 keep-rules і Capacitor sync на release-PR-ах без доступу до підпису.

### 4.4 Перший release-білд

```bash
# Варіант A — workflow_dispatch (з будь-якого бранча):
#   GitHub → Actions → "Mobile Shell (Android, Release AAB + APK)" → Run workflow → бранч → Run.
# Варіант B — tag-driven:
git tag v0.1.0-shell.1
git push origin v0.1.0-shell.1
```

Після завершення — два артефакти у Actions:

- `sergeant-shell-release-aab.zip` — для Play Store upload.
- `sergeant-shell-release-apk.zip` — для sideload через `adb install` / Telegram-каналу / direct download з beta-сторінки.

Правило: Play → `.aab`, sideload → `.apk`. Обидва підписані тим самим ключем і шарять `versionCode` / `versionName`.

### 4.5 Play Console — testing tracks

Play має чотири tracks (від найшвидшого до production):

- **Internal Testing** — до 100 testers, миттєвий release без review. Це **best-fit для перших 1–2 тижнів** беті. Список testers по email або open-link.
- **Closed Testing** (Alpha) — до 200 000, потребує review (~6 годин — 2 дні). Тут масштабують після Internal smoke.
- **Open Testing** (Beta) — public, без email-list, видно у Play Store з beta-badge.
- **Production** — staged rollout (1 % → 10 % → 50 % → 100 %).

MVP-стратегія: тиждень 3–4 у Internal, тиждень 5–7 у Closed (50–150 testers), тиждень 8+ — Production з 1 % staged.

### 4.6 Data safety form (Play Console)

З 2022-07 Google Play вимагає Data Safety секцію для всіх app. Sergeant декларує (на основі sub-processor списку з [`04-launch-readiness.md` §1.1](../business/04-launch-readiness.md#11-обовʼязкові-документи)):

| Категорія                                 | Збирається?               | Shared?                          | Required? | Purpose                         |
| ----------------------------------------- | ------------------------- | -------------------------------- | --------- | ------------------------------- |
| Personal info (Name, Email)               | Yes (Better Auth)         | No                               | Yes       | Account management              |
| Financial info (Transactions, Mono links) | Yes (Monobank API)        | No                               | No        | App functionality               |
| Health & Fitness (workouts, biometrics)   | Yes                       | Shared with Anthropic (AI coach) | No        | App functionality + AI features |
| Photos & Videos                           | Yes (camera для photo-AI) | Shared with Anthropic            | No        | App functionality               |
| Files & Docs                              | No                        | —                                | —         | —                               |
| App activity / interactions               | Yes (PostHog)             | Shared with PostHog              | No        | Analytics                       |
| App info & performance                    | Yes (Sentry)              | Shared with Sentry               | No        | Diagnostics                     |
| Device or other IDs                       | Yes (PostHog distinct_id) | Shared                           | No        | Analytics                       |
| Location                                  | No                        | —                                | —         | —                               |

**Security practices:**

- Data encrypted in transit (TLS).
- User can request data deletion (Better Auth + DELETE endpoints у `apps/server`).
- Independent security review — pending (не критично для launch).

### 4.7 Play Store listing prep

- **App icon** — 512×512 PNG.
- **Feature graphic** — 1024×500.
- **Phone screenshots** — мінімум 2, max 8; рекомендовано 1080×1920+ portrait.
- **7" tablet + 10" tablet screenshots** — опційно, але підвищує rating.
- **Short description** — до 80 символів. Це найважливіший SEO-поінт у Play Store search.
- **Full description** — до 4000 символів. Локалізації: en-US, uk (default), потім pl, de.
- **App category** — Primary: Health & Fitness; Tags: AI, Personal Finance, Habit Tracker, Nutrition.
- **Content rating** — IARC questionnaire. Очікувано: Everyone 10+ або Teen, залежно від nutrition photos handling.
- **Privacy Policy URL** — той самий, що для Apple.

---

## Розділ 5. Shared roadmap (4–8 тижнів)

План розписаний як **week-by-week**, кожен тиждень — конкретні deliverables. Послідовність задумана так, щоб критичний шлях (Apple D-U-N-S → enrollment → enrollment → secrets) стартував паралельно з code-роботою.

### Тиждень 1 — enrollment + smoke

- [ ] **Apple Developer Program enrollment** — індивідуальний $99 (швидко) або організація з D-U-N-S (повільно, до 2 тижнів). Перший платіж може займати до 48 годин review.
- [ ] **Google Play Developer account** — $25, верифікація через UA passport ~24 години.
- [ ] **Створити App ID `com.sergeant.shell` у Apple Developer Portal** + capabilities (Associated Domains, Push, Sign in with Apple якщо треба).
- [ ] **Створити Play Console app entry** + заповнити Privacy/Data safety черновики.
- [ ] **Згенерувати Android release keystore** + backup у password manager + 4 GitHub Secrets.
- [ ] **Smoke-run `mobile-shell-android-release.yml`** з підписом — перевірити що signed AAB генерується.
- [ ] **Smoke-run `mobile-shell-ios-release.yml`** у unsigned mode — перевірити що Pods cache піднімається.

### Тиждень 2 — iOS secrets + перші підписані білди

- [ ] **Apple Distribution certificate** — створити `.p12` → base64 → `APPLE_BUILD_CERTIFICATE_BASE64`.
- [ ] **ASC API key** — створити `.p8` → base64 → `APP_STORE_CONNECT_API_KEY_BASE64` + два UUID-secrets.
- [ ] **Provisioning profile** для `com.sergeant.shell` (App Store distribution) → base64 → `APPLE_PROVISIONING_PROFILE_BASE64`.
- [ ] **Repo variables** `IOS_BUNDLE_ID` + `IOS_PROVISIONING_PROFILE_NAME`.
- [ ] **Перший signed `.ipa`** — tag `v0.1.0-shell.1`, перевірити що `apple-actions/upload-testflight-build` шле у TestFlight.
- [ ] **Перший Internal TestFlight білд** — додати 3–5 team members як testers.
- [ ] **App Store Connect listing** — створити entry, бекендна `Bundle ID` resolution.

### Тиждень 3 — assets + копірайтинг

- [ ] **App icon design** — 1024×1024 master → derived assets (Android 512×512, all density buckets, iOS Asset Catalog).
- [ ] **Screenshots production** — записати UI-flows на iPhone Simulator (6.7" + 5.5") і Android Emulator (Pixel 8 Pro, Pixel 5 Tablet). 4 screenshots per platform: Dashboard, Habit tracker, AI chat, Nutrition log.
- [ ] **Short + Long description** — UA + EN. Reuse positioning з [`README.md`](../../../README.md) і [`docs/launch/business/02-go-to-market.md` § Headline формули](../business/02-go-to-market.md#41-product-hunt-playbook).
- [ ] **Privacy Policy + Terms of Service публічні URL** — якщо ще не зроблено у Phase 1, це блокер. Використати Termly / Iubenda generator (див. [`04-launch-readiness.md` §1.1](../business/04-launch-readiness.md#11-обовʼязкові-документи)).
- [ ] **App Store Connect — App Privacy form** (iOS Nutrition labels).
- [ ] **Play Console — Data safety form** (§4.6).
- [ ] **In-App Purchase decision** (§3.5) — варіант A (StoreKit) чи варіант B (free-only iOS). Зафіксувати ADR.

### Тиждень 4 — Internal testing на обох сторах

- [ ] **Submit для Apple Beta App Review** (External Testing group). 24–48 годин.
- [ ] **Upload AAB у Play Internal Testing** — вручну з `sergeant-shell-release-aab` артефакта (поки `upload-google-play` workflow не доданий).
- [ ] **Recruit 5–10 internal testers** — команда + найближчі друзі, реальні юзери з різними девайсами.
- [ ] **In-app feedback widget** — підняти готовий компонент з web (`apps/web` уже має «Є ідея / Знайшов баг»; перевірити що works у WebView).
- [ ] **Crash monitoring dashboard** — Sentry → filter `platform: capacitor` + `os.name: iOS | Android`. Створити alert: crash-free rate < 98 % за 24h → Telegram.

### Тиждень 5 — Closed Beta на обох сторах

- [ ] **TestFlight External Testing public link** — створити, опублікувати у Sergeant Telegram-каналі + waitlist email-у.
- [ ] **Play Closed Testing** — створити Closed Testing track з email-list (опублікувати Google Group або open-link).
- [ ] **Beta tester onboarding doc** — Notion / Markdown сторінка з: install instructions, known issues, feedback channel, expected timeline.
- [ ] **Target 50 active testers** — 25 iOS + 25 Android.
- [ ] **Daily standup of feedback** — за моделлю з [`02-go-to-market.md` § 3.2](../business/02-go-to-market.md#32-фідбек-лупи).

### Тиждень 6 — bug-fix sprint + native-only UX

- [ ] **Гасити TOP-3 crash signatures** з Sentry.
- [ ] **Fix iOS safe-area + splash race** (з §2.3).
- [ ] **Native push send-pipeline** — щось на серверну сторону, навіть мінімальне (за `docs/mobile/overview.md` § Push notifications).
- [ ] **Back-button confirm UX** — переконатись що `mobileshell:back-hint` event обробляється у web-toast (M20).
- [ ] **App-switch resume behaviour** — `App.addListener('resume')` → re-validate bearer-token; smoke-test що sync engine не падає після 1 години backgrounded.
- [ ] **Deep-link smoke** — кожен HTTPS-host з `DEEP_LINK_HTTPS_HOSTS` — універсал-лінк відкриває правильний шлях у app.

### Тиждень 7 — повторний build → re-submission

- [ ] **`v0.1.1-shell.1`** з накопиченими bug fixes.
- [ ] **TestFlight build re-submission** (incremental, без Beta App Review).
- [ ] **Play Closed Testing → Open Testing** якщо є желание поскорить ramping.
- [ ] **Bug-bash session** — 2-годинний sync з 5–10 power-юзерами по Telegram-call.

### Тиждень 8 — Production submission (staged)

- [ ] **App Store submission for review** — fill release notes, submit for App Store Review (~24–48 годин для Health & Fitness).
- [ ] **Play Production staged rollout** — 1 % → 24h smoke → 10 % → 48h smoke → 50 % → 50h smoke → 100 %.
- [ ] **iOS phased release** — App Store Connect → Phased Release for Automatic Updates → toggle on. Apple розкатує 7 днів (1/2/5/10/20/50/100 %).
- [ ] **Launch announcement** — Telegram, Twitter, Product Hunt (див. [`02-go-to-market.md` § 4.1 PH playbook](../business/02-go-to-market.md#41-product-hunt-playbook)).

**Якщо щось ламається** — пауза rollout-у через ASC (iOS) або Play Console (Android), rollback до попереднього версії через [`docs/playbooks/release.md § 2.4 Post-release`](../../playbooks/release.md#24-post-release-верифікація).

---

## Розділ 6. User testing strategy для Capacitor

Цей розділ — як рекрутувати, як збирати feedback, як trackати regressions. Ціль — зробити це **краще ніж web-фаза**, бо native install-flow і store-rating мають вищу price-of-failure.

### 6.1 Target counts

| Тиждень | Internal (team)           | Closed (друзі + знайомі) | Open (public link)     | Total active |
| ------- | ------------------------- | ------------------------ | ---------------------- | ------------ |
| 1–2     | 3–5 (iOS) + 3–5 (Android) | 0                        | 0                      | 5–10         |
| 3–4     | те саме                   | 10–15 кожна платформа    | 0                      | 25–40        |
| 5–6     | те саме                   | 25 кожна платформа       | 50 кожна (public link) | 100–150      |
| 7–8     | те саме                   | те саме                  | 100+ кожна             | 150–250      |

**WAU/MAU > 50 %** означає, що з 250 invited 125+ повертаються щотижня. Це сигнал для production rollout.

### 6.2 Як рекрутувати mobile-specific testers (vs web)

- **Telegram-канал Sergeant 🎖️** (з [`02-go-to-market.md` §2.1](../business/02-go-to-market.md#21-pre-launch-checklist)) — пост з public TestFlight + Play link.
- **Twitter/X build-in-public** — щотижневий screenshot apk-у на реальному девайсі (не Simulator) з deep-link demo.
- **LinkedIn UA tech community** — ціль: power-юзерів finance/fitness/nutrition apps, які можуть швидко spot регресії vs native конкуренти.
- **Specific channels:**
  - **iOS power-юзери** — Reddit r/ios, iOS-Ukraine Telegram групи (Apple iCloud-юзерів).
  - **Android power-юзери** — XDA Developers, Android-Ukraine Telegram.
  - **Health/finance niche** — спільноти Bilkomanas, Любо\$ів, fitness-trainer-и з 5k+ followers.
- **Існуючі web users (waitlist)** — додати checkbox «I want to beta-test mobile» у onboarding email.
- **App testing platforms** — UserTesting.com, BetaList. _Не рекомендовано на бета-фазі — низькоякісний feedback._

### 6.3 Feedback channels

Чотири паралельні канали — кожен ловить різний type feedback-а:

- **TestFlight feedback** (iOS) — вбудовано, юзер shake-ить девайс → screenshot + текст. ASC показує у Activity tab.
- **Play Console In-App feedback** (Android) — увімкнути в Internal/Closed track settings. Юзер заходить у Play Store → Beta → Send feedback.
- **In-app feedback widget** — web-shared компонент (Phase 1 deliverable), працює у WebView identical. Збирає у Sentry user-feedback або у custom endpoint.
- **Telegram-канал Sergeant Beta** — private channel для бета-юзерів. Юзери репортять там; команда reagує emoji-ями (👍 noted, 🐛 confirmed bug, ✅ fixed).

### 6.4 Як ловити нативні баги (crash reporting через Sentry)

- **Web-Sentry автоматично ловить WebView crashes**, бо `apps/web/src/core/observability/sentry.ts → applyWebBeforeSend` працює у будь-якому JS-runtime.
- **`getPlatform()`** з [`packages/shared/src/lib/platform.ts`](../../../packages/shared/src/lib/platform.ts) маркує events як `platform: capacitor` + `os.name: iOS | Android` — використовувати ці tag-и у Sentry для filtering.
- **WebView OOM / native crash** (рідко, але буває на старих Android з RAM < 3GB) — НЕ ловиться web-SDK-ом. На бета-фазі прийнятно; на GA — додати Crashlytics через Capacitor plugin або @capacitor-firebase/crashlytics.
- **Custom errors з Capacitor-плагінів** — обернуті у try/catch у `src/index.ts`. Логуються у `console.error` → автоматично breadcrumb-аться у Sentry.
- **Sentry release tags** — workflow має `versionCode`/`versionName` → передавати у `Sentry.init({ release: "shell@${versionName}+${versionCode}" })`. Це робить Issues page прив'язку до release.

### 6.5 Як trackати regressions

- **Crash-free session rate** — Sentry → Issues → filter `event.tags.platform: capacitor` → Stats. Target: ≥ 99 % iOS, ≥ 98.5 % Android (Android ширше через fragmentation).
- **PostHog funnels per platform** — окремий dashboard «Mobile Shell» з: install → first-open → onboarding completion → first-module-add → D1 return → D7 return. Розбити по `platform` property.
- **Build comparison** — TestFlight + Play Internal зберігають останні білди. Якщо метрики падають після нового білду — швидкий rollback.
- **Sprint retrospective** — раз на 2 тижні, як з web (див. [`docs/launch/product-os/sprint-retros/`](../product-os/)).

---

## Розділ 7. Critical UX checks перед store submission

Acceptance checklist — пройти ПОВНІСТЮ перед першим Production submission. Якщо хоч один пункт червоний — НЕ submit.

### 7.1 First launch experience

- [ ] Splash screen зникає без flash (failsafe `launchShowDuration: 3000` працює, але runtime код у `initNativeShell` робить `SplashScreen.hide()` після маунту React).
- [ ] Status bar колір збігається з web theme (light: `#fdf9f3`; dark: `#171412`).
- [ ] iOS safe-area: top notch не закривається UI; bottom indicator не блокує BottomNav.
- [ ] Android edge-to-edge: gesture-nav bar не перекриває контент.
- [ ] Cold start time ≤ 3с до first interactive render (typical iPhone SE 2gen / Pixel 5).

### 7.2 Auth flow

- [ ] Sign in with Google OAuth відкриває ASWebAuthenticationSession (iOS) або Custom Tabs (Android), а не in-WebView.
- [ ] Sign in with Apple (iOS) — якщо ввімкнено, працює і повертає bearer-токен.
- [ ] Bearer-токен зберігається у Keychain (iOS) / EncryptedSharedPreferences (Android) — перевірити через `auth-storage.ts`.
- [ ] App-restart → юзер не релогіниться (persistent auth).
- [ ] Sign out очищає `Preferences` повністю (no leftover bearer).

### 7.3 Deep links

- [ ] Custom scheme `com.sergeant.shell://welcome` відкриває app з cold start.
- [ ] Custom scheme з backgrounded app — навігація без flash.
- [ ] HTTPS Universal Link (`https://sergeant.vercel.app/finyk/transactions/123`) на iOS відкриває app, не Safari (потребує AASA правильно serve-нутого з Vercel + Apple cache 24h).
- [ ] HTTPS App Link на Android — те саме, з `autoVerify: true` intent-filter.
- [ ] Race condition: deep-link прилетів до маунту React → `__sergeantShellDeepLinkQueue` буферизує → drain після маунту.
- [ ] Sanitiser `isSafeShellPath()` блокує `javascript:`, `data:`, `vbscript:` schemes (M19 hardening).

### 7.4 Push notifications

- [ ] iOS permission prompt з'являється на perший request `subscribeNativePush()`.
- [ ] Android: на API 33+ permission prompt; на нижче — без prompt (granted by default).
- [ ] Token реєструється у `push_devices` table у server (smoke через staging).
- [ ] Test notification з server (curl з payload) → дисплеїться на lock screen.
- [ ] Tap on notification → відкриває правильний deep-link.

### 7.5 Offline behaviour

- [ ] Запуск без internet → app завантажується (web-side `useCloudSync` має cached state).
- [ ] Mutation у offline → queue → автоматичний flush при coming online.
- [ ] Sync engine не падає у race з `App.addListener('resume')`.

### 7.6 Native UX polish

- [ ] Android hardware Back на корневому маршруті: один тап → toast «Press again to exit»; другий протягом 2с → exit.
- [ ] iOS swipe-back gesture не конфліктує з web-side React Router (типово ОК; перевірити на edge-screens).
- [ ] Keyboard appearance не зрушує UI (Capacitor Keyboard plugin з `resize: KeyboardResize.None`).
- [ ] Pull-to-refresh працює, де очікується (Dashboard, Transactions).
- [ ] Barcode scanner відкриває native MLKit camera, не WebView ZXing — smoke на real device.

### 7.7 Performance

- [ ] iPhone SE 2gen TTI ≤ 3с (cold), ≤ 1.5с (warm).
- [ ] Pixel 5 TTI ≤ 3.5с (cold), ≤ 2с (warm).
- [ ] Memory footprint < 200 MB у idle після 5 хв sync.
- [ ] Battery drain (1 година idle з push registered) — не > 2 % vs baseline.

### 7.8 Store-specific

- [ ] App icon без alpha channel (iOS), з round/square варіантами (Android adaptive).
- [ ] Screenshots актуальні (відображають current UI, не old beta).
- [ ] Description без forbidden words (Apple): «free for life», «best app», «better than X».
- [ ] No Apple-trademark violations (don't write «iOS app»; write «for iPhone»).
- [ ] No Google-trademark violations (don't claim «Google Play Editor's Choice»).

---

## Розділ 8. Legal / store specifics для health/finance apps

Цей розділ — конкретні зачіпки за App Store Review Guidelines і Play Policies, актуальні для Sergeant як health + finance app.

### 8.1 Apple App Store Review Guidelines

- **1.4.1 — Physical Harm:** для health app потрібен disclaimer «not a medical device, consult professionals». Sergeant — habit-tracker + nutrition log, не diagnostic; додати у Terms + onboarding screen.
- **1.6 — Data Security:** sensitive data (health, financial) має бути зашифровано at-rest (вже є через Better Auth Keychain) і in-transit (TLS).
- **2.5.1 — Software Requirements:** не використовувати private API, не завантажувати JS-bundle з мережі для зміни функціональності (це OK для Sergeant — `webDir` локальний; remote update через PWA cache update — НЕ rule violation).
- **3.1.1 — In-App Purchase:** див. §3.5. Critical decision point.
- **3.1.3 — Multi-platform services:** дозволяє вказати, що сервіс доступний на інших платформах (web), але не дозволяє «steer users to alternative purchasing» з in-app UI.
- **4.8 — Sign in with Apple:** якщо є Google OAuth, **обов'язково** додати Sign in with Apple (для iOS). Web — без різниці.
- **5.1.1 — Data Collection and Storage:** Privacy Policy обов'язкова + App Privacy details accurate.
- **5.1.2 — Data Use and Sharing:** Anthropic data sharing (для AI coach) має бути disclosed в Privacy Policy + App Privacy.
- **5.1.5 — Location Services:** Sergeant не використовує геолокацію — нічого декларувати.

### 8.2 Google Play Policies

- **Personal & Sensitive Information:** Permissions request за runtime з context («Why we need this»). Sergeant: Camera (barcode + photo-AI), Notifications (push).
- **Health Apps:** якщо app трактує/диагностує — Health-section disclaimer + medical professional review. Sergeant — tracking only, не diagnostic, но додати disclaimer у onboarding.
- **Financial Services:** якщо app handle real transactions — Financial Services category required. Sergeant: показує Mono-транзакції, **не ініціює** платежі — formally fits «Personal Finance Manager» subcategory, не «Banking».
- **Subscriptions:** Google Play Billing required для digital subscription, як Apple IAP — тільки правила трохи легші для external billing. З 2024 в EU за DMA + USA after Epic — можна external payment з disclosure. Поза EU/USA — все ще Play Billing only.
- **User Data Policy:** declared у Data Safety form (§4.6). Failure → app suspension.
- **Permissions and APIs that Access Sensitive Information:** SDK list має співпадати з Data Safety declaration.
- **AI-Generated Content:** з 2024-Q3 Google вимагає disclosure якщо app генерує AI content (Sergeant — yes, через Claude / Anthropic). Додати у Description: «This app uses generative AI (Claude/Anthropic) for personalized coaching».

### 8.3 GDPR + UA legislation

- Health data — special category за GDPR Art. 9 → explicit consent.
- Financial data — повна GDPR Art. 13 disclosure: storage location, retention, sub-processors.
- UA «Про захист персональних даних» — практично mirrors GDPR.
- Cookie Policy — для cookies, які Better Auth використовує для web; на shell-side cookies зберігаються у WebView, але юридично — те саме disclosure.
- DPO або відповідальна особа — для company-rolled product навіть solo-засновник може бути DPO; вказати у Privacy Policy.

Джерело: [`docs/launch/business/04-launch-readiness.md` §1](../business/04-launch-readiness.md#1-юридичне-та-compliance) — повний legal checklist.

### 8.4 Sub-processor declarations

Для Privacy Policy + App Privacy + Data Safety треба перерахувати:

- **Stripe** (US) — payments.
- **Anthropic** (US) — AI inference.
- **OpenAI** (US) — якщо використовується для voice / image (поточно — лише Anthropic; перевірити).
- **Sentry** (US) — error reporting.
- **PostHog** (US/EU) — analytics. Вибрати EU instance для GDPR-residency.
- **Resend** (US) — transactional email.
- **Monobank** (UA) — financial integration.
- **Railway** (US) — backend hosting.
- **Vercel** (US) — frontend hosting.
- **Firebase Cloud Messaging** (Google, US) — Android push.
- **Apple Push Notification Service** (Apple, US) — iOS push.
- **PlayStore + AppStore** (Google, Apple) — distribution.

---

## Розділ 9. Paywall / monetization в mobile context

### 9.1 Поточне рішення у репо

Джерело: [`docs/launch/business/01-monetization-and-pricing.md`](../business/01-monetization-and-pricing.md#5-payment-providers).

- **MVP plan:** LiqPay (UA) + Stripe (international) через web checkout.
- **PWA — без 30 % комісії Apple/Google** — це маркетингова перевага.
- **Нативні додатки:** «Google Play Billing + Apple IAP обов'язкові для in-app purchases. Де можливо — redirect на PWA для оплати (маржа вища).» — пряма цитата з §5.
- **Технічний MVP уже частково реалізовано:** Stripe Checkout session creation, subscription status read, webhook idempotency — server-side готові.
- **PaywallGate компонент (web)** — поки що не реалізований; це P0 для launch.

### 9.2 Як паттерн «IAP + PWA-redirect» працює на Capacitor shell

Для Sergeant на iOS shell є три валідні стратегії, ранкований за рекомендацією:

**Стратегія A — Free tier only на iOS (мінімальний ризик)**

- Shell на iOS = free Sergeant. Paywall не показується.
- Якщо юзер хоче Pro — open external link (`https://sergeant.com.ua/pricing`) у Safari через `Browser.open()` з `@capacitor/browser`.
- Stripe checkout у Safari → авторизується через bearer-token → success → backend оновлює subscription → push notification у shell.
- **Pros:** uncontroversial, Apple-compliant, найшвидший до beta launch.
- **Cons:** conversion-rate на iOS буде ~30 % нижчий, ніж web (друкарка friction).

**Стратегія B — Apple StoreKit IAP паралельно зі Stripe**

- Shell на iOS показує IAP-paywall з StoreKit subscription product (`com.sergeant.shell.pro.monthly`, `com.sergeant.shell.pro.yearly`).
- Backend має дві джерела істини: Stripe subscription (web юзери) + Apple IAP receipt (iOS юзери).
- Cross-device sync: якщо юзер платив через Stripe на web, shell auto-detects active subscription через `/api/billing/status` і не показує paywall.
- **Pros:** native UX, Apple-compliant.
- **Cons:** +2 тижні розробки на server-side IAP validator (StoreKit receipt verification + `notificationsV2`), +Apple 30 % (15 % перший рік) комісія.

**Стратегія C — External payment з entitlement (експериментально)**

- На iOS shell додати link на web checkout під `external-link-account-entitlement` (доступно після Apple Steering Guidelines 2024-01).
- Це формально валідно для Reader Apps; для non-reader Sergeant — Apple може заперечити. Не рекомендовано на бета.

Аналогічно для Android:

- **Стратегія A** працює — Google Play Billing менш агресивний; external payment з disclosure дозволено в EU (DMA) і USA (after Epic).
- **Стратегія B (Google Play Billing)** — обов'язкова в багатьох юрисдикціях, +15 % комісія перший $1M/рік.

### 9.3 Рекомендація для Phase 2 launch

- **Тиждень 1–4:** Free-tier на shell (обидві платформи). Beta-юзери — це early adopters, не платять.
- **Тиждень 5–6:** Implement StoreKit + Google Play Billing у фоні (паралельний трек). НЕ блокує бета.
- **Тиждень 7–8:** Submit shell з IAP як основний paywall + Stripe як fallback для cross-platform (наприклад юзер платив на web, shell показує active sub).
- **GA:** Stripe-web checkout — для web юзерів; StoreKit/GP-Billing — для shell юзерів; backend синхронізує статус через `/api/billing/status` endpoint.

---

## Розділ 10. Метрики Phase 2

Чотири класи метрик: install conversion, crash-free, app-rating, retention. Target числа — з [`02-go-to-market.md` § 3.3](../business/02-go-to-market.md#33-ключові-метрики-бети).

### 10.1 Install conversion

| Метрика                                | Acceptable | Good   | Excellent |
| -------------------------------------- | ---------- | ------ | --------- |
| TestFlight invite → first install      | > 50 %     | > 70 % | > 85 %    |
| Play Closed invite → first install     | > 60 %     | > 75 % | > 90 %    |
| App Store listing → install (organic)  | > 2 %      | > 5 %  | > 10 %    |
| Play Store listing → install (organic) | > 3 %      | > 6 %  | > 12 %    |

Джерела даних: ASC TestFlight tab, Play Console Statistics, PostHog `app_installed` event.

### 10.2 Crash-free session rate

| Платформа | Acceptable | Good     | Excellent |
| --------- | ---------- | -------- | --------- |
| iOS       | > 98.0 %   | > 99.0 % | > 99.5 %  |
| Android   | > 97.0 %   | > 98.5 % | > 99.5 %  |

Джерело: Sentry → filter `platform: capacitor`.

Alert thresholds:

- iOS crash-free < 98.5 % за 24 години → Telegram alert.
- Android crash-free < 98.0 % за 24 години → Telegram alert.

### 10.3 App Store / Play Store rating

| Платформа         | Acceptable | Good  | Excellent |
| ----------------- | ---------- | ----- | --------- |
| App Store rating  | > 3.8      | > 4.3 | > 4.6     |
| Play Store rating | > 3.8      | > 4.2 | > 4.5     |

Після 100 ratings — починає рахуватись org-wide reputation у store algorithm.

KPI: ratio negative review-ів (< 4 зірок) до total < 15 % після перших 2 тижнів production.

### 10.4 Retention diff vs web

Deltas vs web phase, не absolute:

| Метрика                   | Δ web        | Інтерпретація                                   |
| ------------------------- | ------------ | ----------------------------------------------- |
| D1 retention shell vs web | -5 to +10 pp | Shell без push initially може бути нижче        |
| D7 retention shell vs web | +5 to +15 pp | Native push має дати lift                       |
| WAU/MAU                   | -5 to +5 pp  | Сезонність схожа                                |
| Activation rate           | -5 to +5 pp  | Залежить від чи доступне barcode на real device |

Dashboard: PostHog → cohort by `platform`, breakdown by week.

### 10.5 Phase 2 exit gates

Go / no-go для Production:

- [ ] Crash-free iOS ≥ 99.0 % за 7 послідовних днів.
- [ ] Crash-free Android ≥ 98.5 % за 7 послідовних днів.
- [ ] ≥ 50 active testers за останні 7 днів.
- [ ] D7 retention ≥ 15 % (бета).
- [ ] Beta App Review approved (Apple).
- [ ] Play Internal → Closed → Open transition без regressions.
- [ ] Privacy Policy / Terms / Data Safety / App Privacy — всі live й accurate.
- [ ] In-app feedback widget — receives ≥ 5 messages per week (sign of engagement).
- [ ] Rollback plan — verified (можна швидко відключити staged rollout у Play / зупинити Phased Release у ASC).

---

## Розділ 11. Ризики + mitigation

| ID   | Ризик                                                                                 | Impact                                  | Likelihood                                 | Mitigation                                                                                                          |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| R-1  | Apple Developer enrollment затримка (D-U-N-S 2 тижні)                                 | High — блокує весь iOS lane             | Medium                                     | Стартувати enrollment на тиждень 1; паралельно іти Android-only якщо iOS затягується                                |
| R-2  | Apple Beta App Review rejection (4.8 Sign in with Apple, 3.1.1 IAP)                   | High — затримка 24-72h на ре-submission | Medium                                     | Pre-submission self-audit за §8.1; додати Sign in with Apple на тиждень 2 якщо є Google OAuth                       |
| R-3  | Play Console Data Safety form mismatch з actual SDK list                              | Medium — попередження → suspension      | Low                                        | Audit `pnpm list -r --json` vs declared sub-processors на тиждень 3                                                 |
| R-4  | Android keystore loss → неможливо update app                                          | Catastrophic                            | Low                                        | Backup у 1Password + offline encrypted copy + командний доступ для другого maintainer                               |
| R-5  | iOS Pods build cache miss на CI → 30+ min runs                                        | Medium — slow iteration                 | Medium                                     | `actions/cache` уже налаштований; моніторити cache-hit rate; на тиждень 1 — pre-warm                                |
| R-6  | Native crash без stack trace (WebView OOM)                                            | Medium — невидимий у Sentry             | Medium                                     | На GA додати @capacitor-firebase/crashlytics або native Sentry SDK                                                  |
| R-7  | Stripe webhook не доставляється у shell-WebView коли backgrounded                     | Medium — subscription status flicker    | Low                                        | Backend має push notification trigger при subscription event                                                        |
| R-8  | Apple StoreKit IAP не валідовано на server до GA                                      | High — financial integrity              | Medium                                     | Або implement до GA (Strategy B), або lock на Strategy A (free iOS) на 4–6 тижнів post-launch                       |
| R-9  | Capacitor 7 → 8 breaking change під час бета                                          | Low                                     | Low                                        | Lock pnpm versions; renovate.json conservative для `@capacitor/*`                                                   |
| R-10 | Deep-link AASA cache на Apple-сервері (24h) — оновлення universal links дуже повільне | Medium                                  | High                                       | Тест deep-link tweaks тільки на ad-hoc дев девайсах через `xcrun simctl openurl`; production AASA changes — батчити |
| R-11 | Android edge-to-edge на Android 15+ зрушує UI                                         | Medium — UX regression                  | High (Android 15 default з 2025-Q3)        | Pre-launch test на Pixel 9 / Android 15 емуляторі; window inset handling у WebView                                  |
| R-12 | Push permission denied → юзер не отримує важливі сповіщення                           | Medium                                  | High (iOS Q4 2024 — fewer than 50 % grant) | Onboarding screen, що пояснює why push потрібен; settings deep-link для re-grant                                    |
| R-13 | Beta tester churn — 50 % drop-off за 2 тижні                                          | Medium                                  | High                                       | Engagement loop: weekly Telegram update + per-tester thank-you note                                                 |
| R-14 | Apple/Google search ranking — shell конкурує з 100k+ habit-trackers                   | Medium                                  | High                                       | ASO-keyword research; localized listings (uk + en); попросити early users leave 5-star rating                       |

---

## Розділ 12. Exit criteria для переходу на Phase 3 (Native Expo)

### 12.1 Питання

Ключове питання, яке цей розділ адресує: **чи варто переходити на Phase 3 (Native Expo) взагалі, якщо Capacitor задовольняє метрики?**

Найчесніша відповідь — **залежить від:**

1. **Crash-free rate stabilization** — якщо Capacitor shell тримає ≥ 99 % iOS / ≥ 98.5 % Android протягом 30+ днів, NO immediate need для Native Expo.
2. **Feature gaps, які shell не покриває** — поточно: native voice recognition (STT) + native TTS (web ще шакальні на iOS WebView), глибока offline-camera UX, advanced haptics. Якщо ці gaps впливають на conversion / retention — є argument для Native.
3. **App Store Review escalations** — якщо Apple консистентно reject-ить shell за «not native enough» (це бувало в історії для thin wrappers), Native — це buffer.
4. **Cost-benefit Expo migration** — повний RN-порт Nutrition + Voice + Detox e2e — це 4–6 PR-ів. Vs підтримка Capacitor — 34 shell-commits/30 днів (з shell-tax baseline, [`ADR-0052` § Consequences](../../adr/0052-mobile-strategy-capacitor-primary.md#consequences)).

### 12.2 ADR-0052 Exit gate

За [ADR-0052](../../adr/0052-mobile-strategy-capacitor-primary.md): тригер для наступного ADR («Expo becomes primary») = Expo `apps/mobile/` досягає feature parity (≥ 18/22 ✅ у [feature-parity матриці `platforms.md` §0](../../architecture/platforms.md#-0-feature-parity-матриця-web--shell--rn)).

Поточний стан матриці (snapshot 2026-05-06):

- ~19/22 ✅ для shell (відомо рядки з матриці).
- ~14/22 ✅ для RN (Detox real e2e ✅; Nutrition full parity 🟥; Voice/Speech 🟥; Native UX ✅).

Для RN досягти 18/22 — це закрити: **RN-Nutrition full parity** (recipe/[id], photo-AI) + **RN-Voice (STT/TTS)** — обидва Phase 7 у [`docs/mobile/react-native-migration.md`](../../mobile/react-native-migration.md).

### 12.3 Phase 3 trigger criteria

Phase 3 (Native Expo) стартує **якщо хоча б одне з:**

- **A. Crash-free rate cap** — shell не може стабільно тримати ≥ 99 % iOS після 60 днів tuning. Native SDK з direct UIKit / Android Views дасть більше control.
- **B. App Store Review pressure** — Apple reject ≥ 2 рази за «thin wrapper» концерн. Reader-app exception не покриває Sergeant.
- **C. Native-only feature blocker** — feature, важлива для conversion, неможлива у WebView (whatsapp-style voice call, AR food camera, etc.). Поточно — немає такого блокера.
- **D. Capacitor 7→8 migration cost** spikes — якщо upgrade ламає plugin compatibility, легше переїхати на RN, ніж патчити.
- **E. RN-port hits 18/22 parity** і Stakeholders willing to invest 2 sprints у migration.

### 12.4 Якщо НЕ переходимо на Phase 3

- Capacitor shell — long-term mobile strategy.
- Sunset T₀/T₁/T₂ з ADR-0010 — officially відкликаються через окремий ADR.
- `apps/mobile/` — або archived, або тримається як experimental playground (low-cost дзеркало через shared `@sergeant/shared` + `@sergeant/api-client`).
- Це **валідне рішення** — Sergeant — health/finance habit-tracker, не Photoshop. Capacitor з MLKit barcode + native auth + native push + universal links покриває 95 % UX-потреб.

### 12.5 Якщо ПЕРЕХОДИМО на Phase 3

- Зафіксувати ADR-0053 «Expo becomes primary», що supersedes ADR-0052.
- Capacitor shell входить у formal sunset за оригінальним T₀/T₁/T₂ scheduling (з reset дат на актуальну точку часу).
- Phase 3 roadmap — окремий документ (`03-native-expo-launch.md`).

---

## Cross-refs

- [`apps/mobile-shell/README.md`](../../../apps/mobile-shell/README.md) — джерело правди для shell-функціональності.
- [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../../adr/0052-mobile-strategy-capacitor-primary.md) — стратегічне рішення.
- [`docs/adr/0010-mobile-dual-track-capacitor-expo.md`](../../adr/0010-mobile-dual-track-capacitor-expo.md) — original dual-track decision.
- [`docs/architecture/platforms.md`](../../architecture/platforms.md) — feature parity матриця, Exit dashboard.
- [`docs/mobile/shell.md`](../../mobile/shell.md) — operator cheat-sheet (Android/iOS release secrets, build commands).
- [`docs/mobile/capacitor-deep-links.md`](../../mobile/capacitor-deep-links.md) — Universal Links / App Links setup.
- [`docs/mobile/overview.md`](../../mobile/overview.md) — API контракт + push notifications spec.
- [`docs/playbooks/release.md` § 2 Mobile shell (Capacitor)](../../playbooks/release.md#2-mobile-shell-capacitor) — canonical release loop.
- [`docs/launch/business/01-monetization-and-pricing.md`](../business/01-monetization-and-pricing.md) — pricing tiers + paywall placement + IAP vs Stripe.
- [`docs/launch/business/02-go-to-market.md`](../business/02-go-to-market.md) — GTM phases, beta metrics, PH playbook.
- [`docs/launch/business/04-launch-readiness.md`](../business/04-launch-readiness.md) — legal + privacy + alerts + checklists.
- [`docs/initiatives/0010-revenue-first-launch.md`](../../initiatives/0010-revenue-first-launch.md) — overarching launch ініціатива.
- [`.github/workflows/mobile-shell-android-release.yml`](../../../.github/workflows/mobile-shell-android-release.yml) — Android release pipeline.
- [`.github/workflows/mobile-shell-ios-release.yml`](../../../.github/workflows/mobile-shell-ios-release.yml) — iOS release pipeline.

---

## Appendix A — Швидкі команди (cheat-sheet)

```bash
# Локальний Android debug-білд
pnpm install --frozen-lockfile
pnpm --filter @sergeant/mobile-shell build:web
pnpm --filter @sergeant/mobile-shell exec cap sync android
cd apps/mobile-shell/android && ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# Локальний iOS debug-білд (Mac тільки)
pnpm install --frozen-lockfile
pnpm --filter @sergeant/mobile-shell build:web
cd apps/mobile-shell && pnpm exec cap add ios   # перший раз
pnpm exec cap sync ios && pnpm exec cap open ios

# Trigger Android release pipeline
git tag v0.1.0-shell.1 && git push origin v0.1.0-shell.1
# → artefacts у Actions: sergeant-shell-release-aab + sergeant-shell-release-apk

# Trigger iOS release pipeline
git tag v0.1.0-shell.1 && git push origin v0.1.0-shell.1
# → upload у TestFlight через apple-actions/upload-testflight-build
```

## Appendix B — Beta tester recruitment email template

```
Тема: Запрошення у Sergeant Beta — мобільний застосунок

Привіт!

Дякуємо, що приєднався до waitlist Sergeant. Ми готуємось до Soft Launch
мобільної версії і шукаємо 100–150 бета-тестерів, які допоможуть нам
дошліфувати застосунок до публічного запуску.

Що отримаєш:
- Доступ до Sergeant Pro безкоштовно протягом бети
- +1 місяць Pro безкоштовно після офіційного запуску
- Прямий канал зв'язку з командою у приватному Telegram-каналі

Що просимо:
- Користуватись додатком ≥ 3 рази на тиждень
- Репортити баги через in-app widget («Є ідея / Знайшов баг»)
- Відповідати на короткі опитування раз на тиждень

Платформа:
- iOS (TestFlight): [public TestFlight link]
- Android (Play Internal Testing): [public Play link]

Дякуємо!
Команда Sergeant
```

## Appendix C — Pre-submission self-audit checklist (TL;DR)

Якщо хоч один пункт червоний — НЕ submit:

- [ ] Privacy Policy URL живий + актуальний
- [ ] Terms of Service URL живий + актуальний
- [ ] App Privacy details (iOS) accurate
- [ ] Data Safety form (Android) accurate
- [ ] Sign in with Apple є (iOS) якщо є Google OAuth
- [ ] In-App Purchase decision зафіксовано (§3.5)
- [ ] App icon без alpha (iOS) / з adaptive (Android)
- [ ] Screenshots всі required розміри
- [ ] Description без forbidden words
- [ ] Sub-processor disclosure (Anthropic, Sentry, PostHog, etc.) у Privacy Policy
- [ ] Health disclaimer у Terms + onboarding
- [ ] Crash-free rate ≥ 99 % iOS / ≥ 98.5 % Android за 7 днів
- [ ] Rollback plan verified
- [ ] AASA + assetlinks.json deploy-нуті на public URL
