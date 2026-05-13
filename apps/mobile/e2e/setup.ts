/**
 * Per-suite Detox lifecycle hooks (`setupFilesAfterEach` equivalents).
 *
 * Runs before each `*.e2e.ts` file and installs:
 *   - `beforeAll` — launches the app with the `detoxE2E: "1"` launch
 *     argument so the tabs layout / mock fetch interceptor activate.
 *     `EXPO_PUBLIC_E2E` plus the new `EXPO_PUBLIC_E2E_REAL_AUTH` flag
 *     are set by `.detoxrc.js` (build env) and the CI workflows so the
 *     compiled binary already inlines them; we only echo `detoxE2E`
 *     here for parity with the previous Detox launch contract.
 *   - `beforeEach` — resets the app state via `reloadReactNative()` so
 *     suites don't leak MMKV-backed transactions between tests, and
 *     auto-signs-in (when real-auth mode is active and the current
 *     suite has not opted out via `disableAutoSignIn`).
 *
 * We don't call `device.terminateApp()` in `afterAll` — Detox already
 * shuts the app (and optionally the device) via the global teardown
 * configured in `.detoxrc.js` → `behavior.cleanup`.
 */
import { device } from "detox";

import { signInIfNeeded } from "./_helpers/auth";

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    launchArgs: {
      // Shared flag with the Metro bundler so the Overview / Transactions
      // pages can seed a deterministic dataset in a follow-up PR.
      detoxE2E: "1",
    },
    // `EXPO_PUBLIC_*` variables set here are injected into the RN
    // process by Detox's `launchApp` launcher; Metro already inlines the
    // value at bundle time for production builds, so this affects dev /
    // Detox binaries only.
    languageAndLocale: { language: "uk", locale: "uk-UA" },
    permissions: { notifications: "YES" },
  });
  await signInIfNeeded();
});

beforeEach(async () => {
  await device.reloadReactNative();
  await signInIfNeeded();
});
