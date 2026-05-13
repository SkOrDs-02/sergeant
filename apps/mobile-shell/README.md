# `@sergeant/mobile-shell` — Capacitor shell

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Mobile strategy:** Capacitor shell — primary до Expo feature parity; sunset-дати T₀/T₁/T₂ не є active commitments — [ADR-0052](../../docs/adr/0052-mobile-strategy-capacitor-primary.md).

Тонкий native-shell навколо `@sergeant/web`. Спочатку задумувався як PoC
(«чи запуститься поточний веб-код у WebView»), але зараз доріс до MVP:
bearer-auth, нативний barcode-сканер і UX-поліш (status bar, splash,
keyboard, deep links) вже закомічені і перевірені у білдах.

Канонічний мобільний клієнт усе ще живе в `apps/mobile` (Expo +
React Native). Співіснують навмисно: `applicationId` у shell —
`com.sergeant.shell`, у RN-апці — `com.sergeant.app`.

Короткий статус-репорт по всіх трьох поверхнях — `docs/architecture/platforms.md`.

## Що готово

| Функція                                       | Плагін / PR                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bearer-auth (Keychain / EncryptedSharedPrefs) | `@capacitor/preferences` — [#505](https://github.com/Skords-01/Sergeant/pull/505)                                                                                                                                                                                                                           |
| Native barcode scanner                        | `@capacitor-mlkit/barcode-scanning` — [#504](https://github.com/Skords-01/Sergeant/pull/504)                                                                                                                                                                                                                |
| Status bar + splash + keyboard + deep links   | `@capacitor/{status-bar,splash-screen,keyboard,app}` — [#506](https://github.com/Skords-01/Sergeant/pull/506)                                                                                                                                                                                               |
| Android hardware Back → web-history traversal | `@capacitor/app#backButton` — `canGoBack` → `window.history.back()`, інакше `App.exitApp()`                                                                                                                                                                                                                 |
| Android native проєкт (закомічено)            | `android/` (з `cap add android`)                                                                                                                                                                                                                                                                            |
| Push у shell — лише нативний (FCM/APNs)       | `@capacitor/push-notifications` через `@shared/lib/adapters/pushNative`. Web Push (VAPID + `PushManager.subscribe`) повністю виключений з shell-бандла через `VITE_TARGET=capacitor` + dynamic `import()` → [#524](https://github.com/Skords-01/Sergeant/pull/524)                                          |
| Android debug-APK у CI                        | [`.github/workflows/mobile-shell-android.yml`](../../.github/workflows/mobile-shell-android.yml) → артефакт `sergeant-shell-debug-apk`                                                                                                                                                                      |
| Android release-signing + ProGuard/R8         | `signingConfigs.release` у `android/app/build.gradle` читає `SERGEANT_RELEASE_*` з env/`gradle.properties`; `minifyEnabled true` + `shrinkResources true` + Capacitor keep-rules у `android/app/proguard-rules.pro`                                                                                         |
| Android release pipeline (AAB + APK у CI)     | [`.github/workflows/mobile-shell-android-release.yml`](../../.github/workflows/mobile-shell-android-release.yml) → `sergeant-shell-release-aab` (Play) + `sergeant-shell-release-apk` (sideload); setup-інструкція — [`docs/mobile/shell.md#release--android`](../../docs/mobile/shell.md#release--android) |

Точка входу native-side — `src/index.ts → initNativeShell()`. Вона
ідемпотентна (повторні виклики безпечні під HMR / LiveReload) і
кожен плагін огорнутий try/catch, щоб помилка в одному не заблокувала
інші.

Web-side інтеграції:

- `apps/web/src/shared/lib/platform.ts` → `isCapacitor()` — runtime-guard
  **без compile-time залежності** від `@capacitor/core`. Всі native-import-и
  у web йдуть за цим guard-ом через dynamic `import()`.
- `apps/web/src/shared/lib/api/bearerToken.ts` — єдина точка читання/запису
  bearer-токена з `@sergeant/mobile-shell/auth-storage`.
- `apps/web/vite.config.js#manualChunks` навмисно виключає
  `/node_modules/@capacitor/` з `vendor`, щоб Capacitor-плагіни їхали
  тільки в async-чанки, що підвантажуються динамічним імпортом. При
  додаванні нового `@capacitor/*` плагіна — оновлювати коментар, але
  сам виняток уже покриває майбутні пакети без змін.

## Швидкий старт (Android)

### Варіант А — скачати готовий APK з CI

`.github/workflows/mobile-shell-android.yml` збирає debug-APK на кожен
PR, що чіпає `apps/mobile-shell/**`, `apps/web/**`, `apps/server/**`
або `packages/**`, і вивантажує його як артефакт
`sergeant-shell-debug-apk` (14 днів retention). iOS-сторона живе в
сибілінгу `mobile-shell-ios.yml` (macOS runner, build-only без
підпису). Огляд кроків і локальних команд — у
[`docs/mobile/shell.md`](../../docs/mobile/shell.md).

### Варіант Б — локальна збірка

Потрібен Android SDK (через Android Studio або `sdkmanager`).

```bash
# 1. Зібрати веб-бандл у shell-варіанті (йде в apps/server/dist — див.
#    vite.config.js). `@sergeant/mobile-shell#build:web` делегує до
#    `@sergeant/web build:capacitor` (`VITE_TARGET=capacitor`), який
#    вимикає `vite-plugin-pwa`: у `apps/server/dist` при цьому не
#    зʼявляються `sw.js`, `manifest.webmanifest` та
#    `virtual:pwa-register` chunk — native WebView їх ігнорує, тому у
#    shell вони були dead weight. Для веб-деплою (Vercel) нічого не
#    зміниться: там все ще використовується root `pnpm build:web`.
pnpm --filter @sergeant/mobile-shell build:web

# 2. Скопіювати бандл у нативний проєкт.
pnpm --filter @sergeant/mobile-shell copy

# 3. Відкрити Android Studio для збірки APK/AAB.
pnpm --filter @sergeant/mobile-shell open:android
```

`pnpm --filter @sergeant/mobile-shell build:android` робить кроки 1+2
разом.

`android/` уже закомічено (згенеровано `cap add android`). Якщо
потрібно перегенерувати з нуля — спочатку видалити директорію, потім
`pnpm --filter @sergeant/mobile-shell add:android`.

## iOS

`ios/` **не** закомічено — потрібен Mac з Xcode + CocoaPods для
першого `pnpm --filter @sergeant/mobile-shell add:ios`. `@capacitor/ios`
лежить у `dependencies` поряд з `@capacitor/android` (без нього
`cap add ios` падає `Could not find the ios platform`), тож на свіжій
машині достатньо `pnpm install --frozen-lockfile` → `add:ios`. Після
цього — `build:web` → `pnpm --filter @sergeant/mobile-shell sync ios` →
`open:ios`. Той самий флоу крутиться на `macos-latest` у
`.github/workflows/mobile-shell-ios.yml` (build-only,
`CODE_SIGNING_ALLOWED=NO`). Release lane живе в
`.github/workflows/mobile-shell-ios-release.yml` (триггери `push tag
'v*'` + `workflow_dispatch`): сам робить `cap add ios` на `macos-latest`,
архівує, експортує `.ipa` і заливає у TestFlight. Контракт секретів і
інструкції для першого запуску — у [`docs/mobile/shell.md` → Release — iOS](../../docs/mobile/shell.md#release--ios).

## Що НЕ зроблено

- **Play Store upload workflow (internal track)** — release-signing +
  AAB + release-APK pipeline готовий
  ([`mobile-shell-android-release.yml`](../../.github/workflows/mobile-shell-android-release.yml)),
  але автоматичний upload через
  `google-github-actions/upload-google-play` + service-account JSON —
  ще окрема задача (потрібен `ANDROID_PLAY_SERVICE_ACCOUNT_JSON` secret
  - Play Console config + internal-track rollout plan). Поки що
    maintainер бере `sergeant-shell-release-aab` з Actions-артефакта і
    заливає вручну.
- **iOS native project, закомічений у repo** — `cap add ios` все ще
  чекає на Mac; iOS-проект регенерується кожним CI-запуском
  (`mobile-shell-ios.yml` для PR-лайну і
  `mobile-shell-ios-release.yml` для tag-push/`workflow_dispatch`).
  Release-воркфлоу кешує Pods через `actions/cache`, тож пейн
  тільки на першому запуску.
- ~~**Release pipeline на iOS не налаштований**~~ — зроблено
  сканфолдом у `.github/workflows/mobile-shell-ios-release.yml`. Для
  першого запуску потрібні всі Apple-секрети з контракту у
  [`docs/mobile/shell.md` → Release — iOS](../../docs/mobile/shell.md#release--ios);
  без них job логить `::warning::iOS release secrets not configured`
  і падає у unsigned-Simulator-фолбек.
- ~~**Native push notifications.** `usePushNotifications` у web тримає
  Web Push через Service Worker + VAPID. На iOS у WebView воно
  працює лише з 16.4+ і тільки якщо web уже установлено як PWA на
  home-screen; на Android працює, але «крихко». Power-move —
  окремий PR з `@capacitor/push-notifications` (FCM + APNs) і
  розширенням `createPushEndpoints.register` на нові
  `platform: "android" | "ios"`.~~ **Зроблено** у
  [#512](https://github.com/Skords-01/Sergeant/pull/512):
  `@capacitor/push-notifications` закомічено, `subscribeNativePush()`
  у `src/pushNative.ts` тягне APNs/FCM токен і резолвить
  `{ platform, token }`, а `createPushEndpoints.register`
  (`packages/api-client/src/endpoints/push.ts`) — discriminated union
  на `platform: "web" | "ios" | "android"`, серверний handler
  (`apps/server/src/modules/push/push.ts → register`) маршрутизує у
  `push_devices` для native-токенів. Залишається лише реальний
  APNs/FCM **send**-pipeline — див. `docs/mobile/overview.md#push-notifications`.
- ~~**Deep-link навігація у React Router.** `parseDeepLink()` у
  `src/index.ts` готовий і `App.addListener('appUrlOpen', ...)`
  викликає callback, але коннект з `useNavigate()` з
  `@sergeant/web` ще не прокинутий.~~ **Зроблено**: bridge
  реалізований через `window.__sergeantShellNavigate` —
  `ShellDeepLinkBridge` (`apps/web/src/core/app/ShellDeepLinkBridge.tsx`)
  виставляє navigate-хук після маунту роутера і drain-ить cold-start
  чергу з `window.__sergeantShellDeepLinkQueue`. Свідомо без
  `options.navigate`, щоб уникнути out-of-component `history.pushState`.
- **iOS safe-area + splash race.** CSS `env(safe-area-inset-*)` з
  web-side покриває 99% кейсів, але якщо splash візьметься
  триматись довше 3с (дивись `SplashScreen.hide({ fadeOutDuration })`
  у `initNativeShell`), користувач може побачити блимання статус-бару.
  Кандидат на тюнінг у debug-білді.

## Чому окрема директорія, а не окреме репо

`apps/*` — це вже pnpm workspace, тож `@sergeant/mobile-shell`
автоматично бачить `@sergeant/shared`, `@sergeant/api-client`,
`@sergeant/mobile-shell/auth-storage` і підключений до turbo/CI без
кросрепного клею. Видалити експеримент — один коміт. Деталі та
альтернативи — у обговореннях [PR #503](https://github.com/Skords-01/Sergeant/pull/503)
(перший скафолд shell-а).
