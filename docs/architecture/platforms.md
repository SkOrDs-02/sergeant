# 🎯 Статус трьох поверхонь — Web / RN mobile / Capacitor shell

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active.  
> **Capacitor shell:** `accepted-with-sunset` — sunset schedule див. [ADR-0010 § Sunset schedule](../adr/0010-mobile-dual-track-capacitor-expo.md#sunset-schedule).  
> **Initiative:** [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md).

Короткий репорт «що готово до запуску, що треба доробити» по трьох варіантах Sergeant-а. Живе поруч з `docs/mobile/overview.md` (API-контракт) і `docs/mobile/react-native-migration.md` (роадмап порту web → RN).

## 📋 Поверхні на один погляд

| Поверхня                       | Де живе             | Технології                 | Статус                                             |
| ------------------------------ | ------------------- | -------------------------- | -------------------------------------------------- |
| **Web / PWA** (канонічна апка) | `apps/web`          | React 18 + Vite + PWA      | **Production** (live)                              |
| **Native RN** (iOS / Android)  | `apps/mobile`       | Expo SDK 52 + Expo Router  | **Internal dev-client** — цільовий клієнт після T₀ |
| **Capacitor shell** (WebView)  | `apps/mobile-shell` | Capacitor 7 + Android Java | **MVP — sunset T₀ = 2026-09-01**                   |

---

## 🟢 0. Feature-parity матриця (web ↔ shell ↔ RN)

> **Snapshot:** 2026-05-06. Колонки відображають _функціональну_ parity (юзер може зробити цю дію), не code-parity (різна реалізація допустима).  
> **Легенда:** `✅` — повна parity; `🟡` — часткова / smoke-only / без edge-cases; `🟥` — не реалізовано; `n/a` — поза скоупом.
>
> Таблиця оновлюється на кожен Phase-2 PR ініціативи 0002 і повинна бути «свіжою» в межах 7 днів — це **gating сигнал** для рішення про зсув T₀ (див. [`docs/initiatives/0002-mobile-platform-decision.md` § Ризики](../initiatives/0002-mobile-platform-decision.md#ризики-та-митиґація)).

| Capability / module               | Web (`apps/web`) | Capacitor shell | RN (`apps/mobile`) | Notes                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------- | --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth (Better)** — sign in/out   | ✅               | ✅              | ✅                 | Bearer-контракт уніфікований; web — cookies, native + shell — ASWebAuthenticationSession / Custom Tab                                                                                                                                                   |
| **Auth — Google OAuth**           | ✅               | ✅              | ✅                 | Shell і RN ходять через ASWebAuthenticationSession / Custom Tab                                                                                                                                                                                         |
| **Hub dashboard**                 | ✅               | ✅              | ✅                 | RN-варіант — `apps/mobile/src/core/dashboard/`                                                                                                                                                                                                          |
| **Hub chat (text)**               | ✅               | ✅              | ✅                 | Один `/api/v1/coach/*` контракт для всіх трьох                                                                                                                                                                                                          |
| **Hub voice (STT + TTS)**         | ✅               | 🟡              | 🟡                 | RN: `useSpeechRecognition` / `useTextToSpeech` готові, AddMealSheet — wired; HubChat-композер — Phase 8 follow-up                                                                                                                                       |
| **Hub search**                    | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/core/hub/search/`                                                                                                                                                                                                                 |
| **OnboardingWizard**              | ✅               | ✅              | 🟡                 | RN-stack має скорочений wizard; повний крок «AI-customize» — Phase 7                                                                                                                                                                                    |
| **WeeklyDigestCard**              | ✅               | ✅              | ✅                 | Усі три тримають `getWeeklyDigest()` через api-client                                                                                                                                                                                                   |
| **Push (web-push VAPID)**         | ✅               | 🟡              | n/a                | Shell-WebView push працює тільки на iOS ≥ 16.4; Android Chrome + PWA install                                                                                                                                                                            |
| **Push (native APNs/FCM)**        | n/a              | ✅              | ✅                 | Shell — `@capacitor/push-notifications` (PR #512); RN — `expo-notifications`                                                                                                                                                                            |
| **Deep links (custom scheme)**    | ✅               | ✅              | ✅                 | `parseDeepLink()` ідентичний; shell диспатчить через window hook                                                                                                                                                                                        |
| **Universal / App Links (HTTPS)** | ✅               | ✅              | ✅                 | RN — `app.config.ts` (`ios.associatedDomains` + Android `autoVerify: true` intent-filter), парсер у `apps/mobile/src/lib/deepLinks.ts` + AASA / assetlinks розширені на `com.sergeant.app`. Деталі — `docs/mobile/overview.md` § HTTPS Universal Links. |
| **Offline / sync (CloudSync)**    | ✅               | ✅              | ✅                 | Один `useCloudSync` контракт; shell — те саме що web                                                                                                                                                                                                    |
| **Фінік** — Overview/Tx/Budgets   | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/finyk/`                                                                                                                                                                                                                   |
| **Фізрук** — Workouts/Programs    | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/fizruk/`                                                                                                                                                                                                                  |
| **Рутина** — Habits/Heatmap       | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/routine/`                                                                                                                                                                                                                 |
| **Харчування** — log/water/meal   | ✅               | ✅              | 🟡                 | RN: AddMealSheet + scanner готові; shopping/pantry — Phase 7                                                                                                                                                                                            |
| **Харчування** — barcode scan     | ✅               | ✅              | ✅                 | Web — ZXing/native BarcodeDetector; shell — `@capacitor-mlkit/barcode`                                                                                                                                                                                  |
| **Харчування** — pantry           | ✅               | ✅              | ✅                 | RN: `useNutritionPantries` + `pages/Pantry` готові                                                                                                                                                                                                      |
| **Харчування** — shopping list    | ✅               | ✅              | ✅                 | RN: ручний список + AI-генерація з рецептів через `apiClient.nutrition.shoppingList`; weekplan-джерело — TODO                                                                                                                                           |
| **Харчування** — recipes (AI)\*\* | ✅               | ✅              | 🟥                 | RN: `recipe/[id].tsx` — заглушка, Phase 7                                                                                                                                                                                                               |
| **Харчування** — photo-AI\*\*     | ✅               | ✅              | 🟥                 | RN — Phase 7+ (camera-input → `/api/v1/nutrition/photo`)                                                                                                                                                                                                |
| **Detox / e2e on CI**             | n/a              | n/a             | ✅                 | `detox-ios.yml` (macos-14 sim) + `detox-android.yml` (ubuntu AVD `Pixel_5_API_34`) — full e2e suite: finyk-manual-expense, finyk-transactions (period-filter), routine-smoke, hub-ux-smoke; per-PR + nightly cron                                       |
| **Native UX** (haptics, sheets)   | 🟡               | 🟡              | ✅                 | Web — обмежено (`navigator.vibrate`); shell — Capacitor Haptics; RN — `react-native-haptics`                                                                                                                                                            |

### 🚨 Exit dashboard (для ADR-0010 § Sunset schedule)

Три маяки мають бути **зеленими до T₀ = 2026-09-01**, інакше дата зсувається на 30 днів:

- 🟥 **RN-Nutrition full parity** — `recipe/[id]`, photo-AI. (AI-shopping shipped — recipes source live; weekplan source чекає на mobile week-plan storage.) Зеленіє коли всі три рядки = `✅`
- 🟥 **RN-Voice (STT/TTS)** — Phase 7+. Зеленіє коли Hub voice у RN = `✅`
- 🟡 **Detox real e2e** — sign-in → module → sign-out × 4 модулі. Зеленіє коли Detox = `✅`

---

## 🌐 1. Web / PWA — `apps/web`

**Що є:** усі чотири модулі (Фінік, Фізрук, Рутина, Харчування) + весь Hub-функціонал (auth, chat, voice, search, dashboard, weekly digest, coaching, recommendations), PWA з Service Worker + Web Push через VAPID, офлайн-синхронізація через `useCloudSync`.

**Build & Deploy:**

- Statika на Vercel (edge nodes, immutable cache, preview deploys на кожен PR)
- `/api/*` поінтовує на Railway (`apps/server`)

**CI/CD:** `ci.yml` — lint, typecheck, vitest, build. Preview-déploі на Vercel працюють коректно після fix `vercel.json#outputDirectory → apps/server/dist` (див. PR [#508](https://github.com/Skords-01/Sergeant/pull/508)).

**Що варто покращити:**

- Bundle: `vendor-zxing` (411kB) уже lazy-loaded через `React.lazy` у `NutritionApp`. На Chrome/Edge/Android Chrome використовується native `BarcodeDetector`, зxing-chunk не завантажується. 411 kB платять тільки Safari/Firefox користувачі.
- Web push: VAPID-keys + `webpush.sendNotification`. Для RN/shell — APNs/FCM окремо (див. native секцію).
- `THIRD_PARTY_LICENSES.md` регенерується через `pnpm licenses:gen` (фільтрує build/test-tooling).

**Blocking для релізу:** ❌ Немає. Запускається як є.

---

## 📱 2. Native RN — `apps/mobile`

**Що є:**

- Expo Router скафолд (tabs + (auth) modal)
- Better Auth bearer на SecureStore
- `PushRegistrar` з native APNs/FCM токеном
- CloudSync + MMKV-офлайн-черга + React Query warm-start
- Усі **чотири** модулі в табах

**Модулі:**

- `apps/mobile/src/modules/finyk/*` — pages (Overview, Transactions, Analytics, Budgets, Assets), components, hooks, lib + tests
- `apps/mobile/src/modules/fizruk/*` — pages, components (workouts, programs, body, progress), hooks + tests
- `apps/mobile/src/modules/routine/*` — pages (Habits, Heatmap), components, hooks, lib + tests
- `apps/mobile/src/modules/nutrition/*` — NutritionApp, AddMealSheet, camera + scanner, shopping list, pantry

**Не зроблено / частково:**

- **Nutrition решта** — `recipe/[id].tsx` заглушка; shopping generate, photo/day plan — Phase 7
- **Voice/Speech** — потребує `expo-speech` + платформний STT (iOS Speech framework / Android SpeechRecognizer)
- **App Store/Play метадані** — store-listing, іконки, privacy manifest (iOS), data safety (Android)
- **Detox e2e** — `detox-ios.yml`/`detox-android.yml` тільки smoke-build; реальні сценарії待機

**Що варто покращити:**

- `react-native-worklets` потребує update RN → 0.78+ (був несумісний з RN 0.76, PR [#509](https://github.com/Skords-01/Sergeant/pull/509))
- `google-services.json` для FCM потребує як EAS secret (`GOOGLE_SERVICES_JSON`)
- iOS-девайс потребує `development-device` EAS-профіль без `ios.simulator: true`

**Blocking для релізу:** глибша parity Харчування, store-listing. До store — переважно internal dev-client.

---

## 💻 3. Capacitor shell — `apps/mobile-shell`

**Що є:** тонкий WebView-обгортка над `apps/web` build. `webDir` вказує напряму в `apps/server/dist` без копіювання. Закомічені native-плагіни:

- `@capacitor/preferences` — bearer-token storage (Keychain / EncryptedSharedPreferences) — [#505](https://github.com/Skords-01/Sergeant/pull/505)
- `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard`, `@capacitor/app` — UX polish — [#506](https://github.com/Skords-01/Sergeant/pull/506)
- `@capacitor-mlkit/barcode-scanning` — native barcode замість ZXing у WebView — [#504](https://github.com/Skords-01/Sergeant/pull/504)
- `@capacitor/push-notifications` — APNs/FCM — [#512](https://github.com/Skords-01/Sergeant/pull/512)

**Auth & Deep links:**

- Bearer у `auth-storage.ts`, barcode у `barcodeNative.ts` — підключаються динамічним `import()` за guard-ом `isCapacitor()`
- Deep links: shell дублює parsed path через два канали — стандартний `BroadcastChannel("sergeant-shell-deeplink")` (canonical з PR-29 [#2526](https://github.com/Skords-01/Sergeant/pull/2526)) і `window.__sergeantShellNavigate` (backward-compat shim до PR-2 у серпні 2026), з буфером `window.__sergeantShellDeepLinkQueue` для cold-start; web-bridge `apps/web/src/core/app/ShellDeepLinkBridge.tsx` слухає обидва і coalesce-ить дублі по `(path, timestamp)` у вікні 500 ms
- HTTPS Universal Links / App Links теж підтримуються — див. `docs/mobile/capacitor-deep-links.md`

**Android:**

- CI workflow [`mobile-shell-android.yml`](../../.github/workflows/mobile-shell-android.yml) — debug-APK на PR
- Release-лейн [`mobile-shell-android-release.yml`](../../.github/workflows/mobile-shell-android-release.yml) — `sergeant-shell-release-aab` (Play Store) + `sergeant-shell-release-apk` (sideload)

**iOS:**

- `ios/` НЕ закомічено — `cap add ios` робиться в CI на `macos-latest`
- Release workflow [`mobile-shell-ios-release.yml`](../../.github/workflows/mobile-shell-ios-release.yml) — tag-push + TestFlight через `apple-actions/upload-testflight-build`
- Потребує Apple-secrets для першого реального запуску

**Що варто покращити:**

- Bundle size: `apps/web` build ~1.2MB gzipped. Зроблено: `VITE_TARGET=capacitor` flag вимикає `vite-plugin-pwa`, тож SW/manifest/web-push не потрапляють у shell-dist
- PWA для web-деплою (Vercel) — без змін
- Split-brain: RN-апка й shell можуть релізитися в різних часах. Google Play допускає різні `applicationId`, але Apple — ні (bundle-prefix)

**Blocking для релізу:** Play Store upload workflow через service account (AAB/APK готові), Apple-секрети для iOS release (сам `cap add ios` на Mac уже не блокер).

---

## 🎯 Пріоритетна черга

1. **Web + мобільний shell (Android)** — найшвидший до користувача: web live, shell потребує workflow + підпис. **2–3 PR-и.**
2. **Native RN Nutrition-порт** — найдорожчий (Phase 7), блокує App Store/Play реліз. **4–6 PR-ів.**
3. **iOS shell** — потребує Mac у CI (EAS / macOS runner), досі заблоковано Xcode-env.
4. **Detox e2e** — зараз smoke; треба реальні сценарії, інакше false confidence.

---

## 📊 Related docs

- **Детальний статус app/packages:** [`apps-status-matrix.md`](./apps-status-matrix.md)
- **Feature parity інлання:** [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md)
- **API контракт:** [`docs/mobile/overview.md`](../mobile/overview.md)
- **RN migration roadmap:** [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md)
- **Sunset ADR:** [ADR-0010](../adr/0010-mobile-dual-track-capacitor-expo.md)
- **Shell deep-links:** [`docs/mobile/capacitor-deep-links.md`](../mobile/capacitor-deep-links.md)
