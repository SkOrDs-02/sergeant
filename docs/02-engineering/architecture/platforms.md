# 🎯 Статус трьох поверхонь — Web / RN mobile / Capacitor shell

> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-08.
> **Status:** Active.  
> **Mobile strategy:** [ADR-0052](../../04-governance/adr/0052-mobile-strategy-capacitor-primary.md) — Capacitor shell **primary**, Expo/RN **parallel** (без активного sunset ADR-0010). Історичний sunset schedule — лише в [`mobile/shell.md`](../mobile/shell.md) § Historical sunset note.  
> **Initiative:** [`docs/90-work/initiatives/archive/_0002-mobile-platform-decision.md`](../../90-work/initiatives/archive/_0002-mobile-platform-decision.md).

Короткий репорт «що готово до запуску, що треба доробити» по трьох варіантах Sergeant-а. Живе поруч з `docs/02-engineering/mobile/overview.md` (API-контракт) і `docs/02-engineering/mobile/react-native-migration.md` (роадмап порту web → RN).

## 📋 Поверхні на один погляд

| Поверхня                       | Де живе             | Технології                 | Статус                                                                 |
| ------------------------------ | ------------------- | -------------------------- | ---------------------------------------------------------------------- |
| **Web / PWA** (канонічна апка) | `apps/web`          | React 18 + Vite + PWA      | **Production** (live)                                                  |
| **Native RN** (iOS / Android)  | `apps/mobile`       | Expo SDK 52 + Expo Router  | **Internal dev-client** — паралельний RN-трек (feature parity → store) |
| **Capacitor shell** (WebView)  | `apps/mobile-shell` | Capacitor 7 + Android Java | **Primary mobile product** (ADR-0052) — store release path             |

---

## 🟢 0. Feature-parity матриця (web ↔ shell ↔ RN)

> **Snapshot:** 2026-07-10. Колонки відображають _функціональну_ parity (юзер може зробити цю дію), не code-parity (різна реалізація допустима).  
> **Легенда:** `✅` — повна parity; `🟡` — часткова / smoke-only / без edge-cases; `🟥` — не реалізовано; `n/a` — поза скоупом.
>
> Оновлюй цю таблицю в PR-ах, що змінюють mobile parity. Decision-gate для RN-as-primary — окремий accepted ADR після 100% feature parity (див. ADR-0052), не фіксована дата sunset shell-а.

| Capability / module               | Web (`apps/web`) | Capacitor shell | RN (`apps/mobile`) | Notes                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------- | --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth (Better)** — sign in/out   | ✅               | ✅              | ✅                 | Bearer-контракт уніфікований; web — cookies, native + shell — ASWebAuthenticationSession / Custom Tab                                                                                                                                                                                                 |
| **Auth — Google OAuth**           | ✅               | ✅              | ✅                 | Shell і RN ходять через ASWebAuthenticationSession / Custom Tab                                                                                                                                                                                                                                       |
| **Hub dashboard**                 | ✅               | ✅              | ✅                 | RN-варіант — `apps/mobile/src/core/dashboard/`                                                                                                                                                                                                                                                        |
| **Hub chat (text)**               | ✅               | ✅              | ✅                 | `POST /api/v1/chat` (SSE streaming + tool-use) для всіх трьох; `/api/v1/coach/memory` — окремий store, не stream                                                                                                                                                                                      |
| **Hub voice (STT + TTS)**         | ✅               | 🟡              | 🟡                 | RN: `useSpeechRecognition` / `useTextToSpeech` + `useChatSend` (`fromVoice` / `maybeSpeak`) у HubChat. Shell — WebView STT/TTS обмеження Safari                                                                                                                                                       |
| **Hub search**                    | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/core/hub/search/`                                                                                                                                                                                                                                                               |
| **OnboardingWizard**              | ✅               | ✅              | ✅                 | RN wizard (Welcome / Modules / Goals / Permissions + JIT-permissions, splash-Modal) ≥ web (`WelcomeOneScreen` / `GoalFirstScreen` — один екран). «AI-customize» — фантомний gap: такого кроку в web немає, мірити нема з чим. Окремий RN-follow-up (не цей рядок): пост-onboarding `PresetSheet` FTUX |
| **WeeklyDigestCard**              | ✅               | ✅              | ✅                 | Усі три тримають `getWeeklyDigest()` через api-client                                                                                                                                                                                                                                                 |
| **Push (web-push VAPID)**         | ✅               | 🟡              | n/a                | Shell-WebView push працює тільки на iOS ≥ 16.4; Android Chrome + PWA install                                                                                                                                                                                                                          |
| **Push (native APNs/FCM)**        | n/a              | ✅              | ✅                 | Shell — `@capacitor/push-notifications` (PR #512); RN — `expo-notifications`                                                                                                                                                                                                                          |
| **Deep links (custom scheme)**    | ✅               | ✅              | ✅                 | `parseDeepLink()` ідентичний; shell диспатчить через window hook                                                                                                                                                                                                                                      |
| **Universal / App Links (HTTPS)** | ✅               | ✅              | ✅                 | RN — `app.config.ts` (`ios.associatedDomains` + Android `autoVerify: true` intent-filter), парсер у `apps/mobile/src/lib/deepLinks.ts` + AASA / assetlinks розширені на `com.sergeant.app`. Деталі — `docs/02-engineering/mobile/overview.md` § HTTPS Universal Links.                                |
| **Offline / sync (Sync v2)**      | ✅               | ✅              | ✅                 | `core/syncEngine/` + `useSyncStatus`; shell — той самий web-бандл. v1 `useCloudSync` знятий (ADR-0047)                                                                                                                                                                                                |
| **Фінік** — Overview/Tx/Budgets   | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/finyk/`                                                                                                                                                                                                                                                                 |
| **Фізрук** — Workouts/Programs    | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/fizruk/`                                                                                                                                                                                                                                                                |
| **Рутина** — Habits/Heatmap       | ✅               | ✅              | ✅                 | RN — `apps/mobile/src/modules/routine/`                                                                                                                                                                                                                                                               |
| **Харчування** — log/water/meal   | ✅               | ✅              | ✅                 | RN: AddMealSheet + scanner + log + water + meal-журнал готові                                                                                                                                                                                                                                         |
| **Харчування** — barcode scan     | ✅               | ✅              | ✅                 | Web — ZXing/native BarcodeDetector; shell — `@capacitor-mlkit/barcode`                                                                                                                                                                                                                                |
| **Харчування** — pantry           | ✅               | ✅              | ✅                 | RN: `useNutritionPantries` + `pages/Pantry` готові                                                                                                                                                                                                                                                    |
| **Харчування** — shopping list    | ✅               | ✅              | ✅                 | RN: ручний список + AI-генерація з рецептів через `apiClient.nutrition.shoppingList`; weekplan-джерело — TODO                                                                                                                                                                                         |
| **Харчування** — day plan         | ✅               | ✅              | ✅                 | RN: `DailyPlanCard` + AI-генерація денного плану в `Dashboard.tsx` через `api.nutrition.dayPlan` (full + per-meal regenerate). TDEE з біометрії — свідомо out-of-scope                                                                                                                                |
| **Харчування** — recipes (AI)\*\* | ✅               | ✅              | ✅                 | RN: `RecipeRecommender` + `apiClient.nutrition.recommendRecipes` live (`apps/mobile/src/modules/nutrition/pages/RecipeRecommender.tsx`)                                                                                                                                                               |
| **Харчування** — photo-AI\*\*     | ✅               | ✅              | ✅                 | RN: `AddMealSheet` analyze-photo / refine-photo через `expo-image-picker` + `expo-image-manipulator`                                                                                                                                                                                                  |
| **Detox / e2e on CI**             | n/a              | n/a             | ✅                 | `detox-ios.yml` — smoke + full sign-in→module→sign-out (×4 модуля), `detox-android.yml` — smoke-build; full під mock-auth flag                                                                                                                                                                        |
| **Native UX** (haptics, sheets)   | 🟡               | 🟡              | ✅                 | Web — обмежено (`navigator.vibrate`); shell — Capacitor Haptics; RN — `react-native-haptics`                                                                                                                                                                                                          |

### 🎯 RN parity backlog (ADR-0052 — не sunset shell)

Залишки перед RN-as-primary decision-gate (окремий ADR, не дата T₀):

- 🟡 **RN shopping weekplan source** — AI shopping-list live, але weekplan-джерело чекає mobile week-plan storage
- 🟡 **RN Hub voice polish** — STT/TTS wired у HubChat; shell WebView STT/TTS — platform-limited
- ✅ **Detox real e2e** — sign-in → module → sign-out × 4 модулі на iOS (`detox-ios.yml`). Android — smoke build; full-сьюти на emu — follow-up

---

## 🌐 1. Web / PWA — `apps/web`

**Що є:** усі чотири модулі (Фінік, Фізрук, Рутина, Харчування) + весь Hub-функціонал (auth, chat, voice, search, dashboard, weekly digest, coaching, recommendations), PWA з Service Worker + Web Push через VAPID, офлайн-синхронізація через sync v2 (`core/syncEngine/` + `useSyncStatus`).

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
- CloudSync v1 знятий. Sync v2: MMKV/SQLite outbox + `SyncEnginePushScheduler` через `@sergeant/api-client`
- Усі **чотири** модулі в табах

**Модулі:**

- `apps/mobile/src/modules/finyk/*` — pages (Overview, Transactions, Analytics, Budgets, Assets), components, hooks, lib + tests
- `apps/mobile/src/modules/fizruk/*` — pages, components (workouts, programs, body, progress), hooks + tests
- `apps/mobile/src/modules/routine/*` — pages (Habits, Heatmap), components, hooks, lib + tests
- `apps/mobile/src/modules/nutrition/*` — NutritionApp, AddMealSheet, camera + scanner, shopping list, pantry

**Не зроблено / частково:**

- **Nutrition** — weekplan-джерело для shopping-list на mobile (нема mobile week-plan storage)
- **Voice/Speech** — HubChat STT/TTS live на RN; polish і shell WebView limits залишаються
- **AI-шар (Phase 8)** — HubChat (`app/hub-chat.tsx` + `core/hub/HubChat.tsx`), Coach-insight (`useCoachInsight`), WeeklyDigest (`useWeeklyDigest` + `useMondayAutoDigest`) — ✅ live
- **Hub Phase 9** — HubReports (`app/hub-reports.tsx` + `core/hub/HubReports.tsx`) + HubSearch (`core/hub/search/`) — ✅ live
- **Onboarding** — wizard live (≥ web). «AI-customize» — фантомний gap (нема в web). Окремий follow-up: пост-onboarding `PresetSheet` FTUX
- **App Store/Play метадані** — store-listing, іконки, privacy manifest (iOS), data safety (Android)
- **Detox e2e** — smoke + 4 full сьюти (`routine-full.e2e.ts`, `fizruk-full.e2e.ts`, `finyk-full.e2e.ts`, `nutrition-full.e2e.ts`) під `EXPO_PUBLIC_E2E_REAL_AUTH=1` на iOS Simulator (`detox-ios.yml`). Android залишається smoke-only — включення full-сьют на emu pipeline — окремий follow-up.

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
- HTTPS Universal Links / App Links теж підтримуються — див. `docs/02-engineering/mobile/capacitor-deep-links.md`

**Android:**

- CI workflow [`mobile-shell-android.yml`](../../../.github/workflows/mobile-shell-android.yml) — debug-APK на PR
- Release-лейн [`mobile-shell-android-release.yml`](../../../.github/workflows/mobile-shell-android-release.yml) — `sergeant-shell-release-aab` (Play Store) + `sergeant-shell-release-apk` (sideload)

**iOS:**

- `ios/` НЕ закомічено — `cap add ios` робиться в CI на `macos-latest`
- Release workflow [`mobile-shell-ios-release.yml`](../../../.github/workflows/mobile-shell-ios-release.yml) — tag-push + TestFlight через `apple-actions/upload-testflight-build`
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
4. **Detox e2e** — iOS Simulator проганяє реальні sign-in→module→sign-out сьюти (×4 модулі); Android все ще smoke-only — full-сьюти на emu pipeline — follow-up.

---

## 📊 Related docs

- **Детальний статус app/packages:** [`apps-status-matrix.md`](./apps-status-matrix.md)
- **Feature parity інлання:** [`docs/90-work/initiatives/archive/_0002-mobile-platform-decision.md`](../../90-work/initiatives/archive/_0002-mobile-platform-decision.md)
- **API контракт:** [`docs/02-engineering/mobile/overview.md`](../mobile/overview.md)
- **RN migration roadmap:** [`docs/02-engineering/mobile/react-native-migration.md`](../mobile/react-native-migration.md)
- **Mobile strategy ADR:** [ADR-0052](../../04-governance/adr/0052-mobile-strategy-capacitor-primary.md) (supersedes ADR-0010 sunset)
- **Shell deep-links:** [`docs/02-engineering/mobile/capacitor-deep-links.md`](../mobile/capacitor-deep-links.md)
