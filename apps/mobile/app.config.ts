// Register a TypeScript `require` hook so `./plugins/*.ts` files that
// this config imports can be resolved at Expo config-load time. Expo
// transpiles `app.config.ts` itself via Babel, but follow-on
// `require()` calls fall through to Node's default resolver — without
// this register step, `./plugins/withAndroidShortcuts` fails with
// `Cannot find module` during `expo prebuild` / `expo config` (see
// `.github/workflows/detox-{ios,android}.yml`).
//
// `sucrase/register/ts` is a lightweight TS-only loader (no .tsx /
// JSX handling) with essentially zero startup cost. Listed as an
// explicit `devDependency` in `apps/mobile/package.json` so we do
// not rely on Expo's transitive dependency graph.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("sucrase/register/ts");

import type { ExpoConfig } from "expo/config";
import {
  withAndroidShortcuts,
  type AndroidShortcutItem,
} from "./plugins/withAndroidShortcuts";

/**
 * Dynamic Expo config.
 *
 * Замінює `app.json` щоб можна було читати змінні з `process.env` для
 * EAS build (див. `apps/mobile/docs/mobile.md`). Усі поля що раніше
 * жили в `app.json` перенесені сюди один-в-один.
 */
const updatesUrl = process.env.EXPO_PUBLIC_EAS_UPDATES_URL;

/**
 * Detox patches the generated iOS / Android projects (see
 * `apps/mobile/.detoxrc.js` + `apps/mobile/e2e/*`). We register the
 * plugin conditionally so production EAS builds do NOT ship the
 * `DetoxActivity` / test-target scaffolding.
 *
 * Gate:
 *   - `EXPO_PUBLIC_E2E=1` — contributor / CI Detox build.
 *   - `E2E_BUILD=1`        — explicit override for prebuild pipelines
 *     that don't want to leak `EXPO_PUBLIC_*` into the bundled JS.
 *
 * Docs: `docs/mobile/react-native-migration.md` §8 / §13 Q8.
 */
const isDetoxBuild =
  process.env.EXPO_PUBLIC_E2E === "1" || process.env.E2E_BUILD === "1";

const ANDROID_PACKAGE = "com.sergeant.app";

/**
 * HTTPS hosts that should open the RN client as Universal Links (iOS)
 * and verified App Links (Android).
 *
 * Source of truth — kept in lock-step with:
 *   - `apps/mobile-shell/src/index.ts` → `DEEP_LINK_HTTPS_HOSTS`
 *   - `apps/server/src/http/cors.ts` (production origins)
 *   - `apps/web/public/.well-known/apple-app-site-association`
 *   - `apps/web/public/.well-known/assetlinks.json`
 *
 * Add new hosts here AND in all four files above; the runtime
 * `parseSergeantUrl()` allow-list (`src/lib/deepLinks.ts`) is the
 * fifth co-ordinated surface.
 *
 * Bare host strings — no `https://` prefix. `applinks:` and the
 * Android `intentFilters` shape add the scheme themselves.
 */
const UNIVERSAL_LINK_HOSTS = [
  "sergeant.vercel.app",
  "sergeant.2dmanager.com.ua",
] as const;

/**
 * Static Android app shortcuts (long-press on the launcher icon).
 *
 * Each shortcut fires a `sergeant://…` deep link which is consumed by
 * the existing `useDeepLinks` runtime shim. No UI code here: the
 * shortcut → intent → `Linking.getInitialURL()` chain is pure config.
 *
 * Labels are kept in Ukrainian to match the app's primary locale.
 * Phase 10 PR-B does not yet ship dedicated monochrome shortcut
 * icons; we fall back to the launcher mipmap until a follow-up PR
 * adds `@drawable/ic_shortcut_*` assets.
 */
const ANDROID_APP_SHORTCUTS: AndroidShortcutItem[] = [
  {
    id: "add_expense",
    shortLabel: "Витрата",
    longLabel: "Додати витрату",
    intent: {
      action: "android.intent.action.VIEW",
      data: "sergeant://finance/tx/new",
      targetPackage: ANDROID_PACKAGE,
    },
  },
  {
    id: "open_today",
    shortLabel: "Сьогодні",
    longLabel: "Рутина на сьогодні",
    intent: {
      action: "android.intent.action.VIEW",
      data: "sergeant://routine",
      targetPackage: ANDROID_PACKAGE,
    },
  },
  {
    id: "start_workout",
    shortLabel: "Тренування",
    longLabel: "Почати тренування",
    intent: {
      action: "android.intent.action.VIEW",
      data: "sergeant://workout/new",
      targetPackage: ANDROID_PACKAGE,
    },
  },
];

/**
 * iOS quick actions (3D-Touch / long-press home icon).
 *
 * Expo merges `ios.infoPlist.UIApplicationShortcutItems` straight into
 * the generated Info.plist, so this needs no plugin. The URL is sent
 * through `Linking` when the user taps a quick action, and then
 * consumed by `useDeepLinks`.
 *
 * Ordering matches the Android set above so the two platforms stay
 * in sync.
 *
 * `UIApplicationShortcutItemIconType` uses built-in system icons so
 * PR-B does not pull in any new art assets. A follow-up can swap
 * `UIApplicationShortcutItemIconFile` in once monochrome icons exist.
 */
const IOS_SHORTCUT_ITEMS = [
  {
    UIApplicationShortcutItemType: `${ANDROID_PACKAGE}.add_expense`,
    UIApplicationShortcutItemTitle: "Витрата",
    UIApplicationShortcutItemSubtitle: "Додати витрату",
    UIApplicationShortcutItemIconType: "UIApplicationShortcutIconTypeAdd",
    UIApplicationShortcutItemUserInfo: {
      url: "sergeant://finance/tx/new",
    },
  },
  {
    UIApplicationShortcutItemType: `${ANDROID_PACKAGE}.open_today`,
    UIApplicationShortcutItemTitle: "Сьогодні",
    UIApplicationShortcutItemSubtitle: "Рутина на сьогодні",
    UIApplicationShortcutItemIconType: "UIApplicationShortcutIconTypeDate",
    UIApplicationShortcutItemUserInfo: {
      url: "sergeant://routine",
    },
  },
  {
    UIApplicationShortcutItemType: `${ANDROID_PACKAGE}.start_workout`,
    UIApplicationShortcutItemTitle: "Тренування",
    UIApplicationShortcutItemSubtitle: "Почати тренування",
    UIApplicationShortcutItemIconType: "UIApplicationShortcutIconTypePlay",
    UIApplicationShortcutItemUserInfo: {
      url: "sergeant://workout/new",
    },
  },
];

const buildConfig = (): ExpoConfig => ({
  name: "Sergeant",
  slug: "sergeant",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "sergeant",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  runtimeVersion: { policy: "sdkVersion" },
  ...(updatesUrl ? { updates: { url: updatesUrl } } : {}),
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0b0d10",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: ANDROID_PACKAGE,
    // iOS Universal Links — pairs with `apple-app-site-association`
    // served by `apps/web/public/.well-known/`. The `applinks:` prefix
    // is mandatory and the host MUST be bare (no scheme, no path).
    // The corresponding AASA `appIDs` entry is
    // `<TEAM_ID>.com.sergeant.app`; the Team ID is filled in at
    // deploy time (see `docs/mobile/capacitor-deep-links.md`) and
    // intentionally stays as a placeholder in the committed file.
    associatedDomains: UNIVERSAL_LINK_HOSTS.map((h) => `applinks:${h}`),
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      UIApplicationShortcutItems: IOS_SHORTCUT_ITEMS,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0b0d10",
    },
    package: ANDROID_PACKAGE,
    // Two intent-filter groups:
    //
    //   1. Custom scheme (`sergeant://…`) — `autoVerify: false`, picked
    //      up by `Linking.getInitialURL()` / `addEventListener("url")`
    //      and routed by `src/lib/useDeepLinks.ts`.
    //
    //   2. HTTPS App Links — `autoVerify: true`, paired with the
    //      `assetlinks.json` hosted on each `UNIVERSAL_LINK_HOSTS`
    //      origin. With `autoVerify` Android resolves the link
    //      directly to our app, without showing the "Open with…"
    //      picker, provided DAL verification passes (release-signed
    //      APK + correct `sha256_cert_fingerprints`).
    //
    // Both filters reuse `parseSergeantUrl()` at runtime — see
    // `src/lib/deepLinks.ts` for the path → route mapping.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: false,
        data: [{ scheme: "sergeant" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
      {
        action: "VIEW",
        autoVerify: true,
        data: UNIVERSAL_LINK_HOSTS.map((host) => ({ scheme: "https", host })),
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-camera",
      {
        cameraPermission:
          "Sergeant потрібен доступ до камери, щоб зчитувати штрихкоди продуктів.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Sergeant читає фото страви, щоб оцінити приблизні КБЖВ (локально стискається перед відправкою).",
        cameraPermission:
          "Sergeant може зняти страву камерою для оцінки КБЖВ (якщо обереш зйомку замість галереї).",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0b0d10",
        image: "./assets/splash.png",
        imageWidth: 200,
      },
    ],
    // Sentry native plugin — required by `@sentry/react-native` for
    // the iOS/Android native build to link the RNSentry module. Source
    // maps are uploaded at EAS build time when `SENTRY_AUTH_TOKEN`
    // + `SENTRY_ORG` + `SENTRY_PROJECT` are set; on CI (Detox E2E,
    // mobile-shell lanes) those env vars are absent, so set
    // `SENTRY_DISABLE_AUTO_UPLOAD=true` in the workflow to make the
    // `sentry-cli` build phase a no-op. JS Sentry still initialises
    // via `EXPO_PUBLIC_SENTRY_DSN` (see `src/lib/observability.ts`).
    "@sentry/react-native/expo",
    // Detox config plugin patches the generated native projects with
    // the Detox instrumentation target. Only registered for dedicated
    // E2E builds so production IPAs / AABs are unaffected.
    ...(isDetoxBuild ? ["@config-plugins/detox"] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});

/**
 * Apply inline config plugins. The `plugins` array above only accepts
 * published plugin module paths (`string | [string, ...]`) per Expo's
 * TypeScript type, whereas our local `withAndroidShortcuts` plugin is
 * a function reference. Applying it here wraps the base config with
 * the mod registrations so Expo's prebuild pipeline picks them up.
 */
const config = (): ExpoConfig =>
  withAndroidShortcuts(buildConfig(), ANDROID_APP_SHORTCUTS) as ExpoConfig;

export default config;
