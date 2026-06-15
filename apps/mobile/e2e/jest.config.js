/**
 * Jest config for Detox E2E suites.
 *
 * Lives in `apps/mobile/e2e/jest.config.js` (referenced from
 * `.detoxrc.js`). It is deliberately separate from the unit-test config
 * at `apps/mobile/jest.config.js`:
 *
 *   - `testMatch` only picks up `*.e2e.ts` files so Detox does not try
 *     to run the `src/**\/*.test.tsx` suites that already pass through
 *     jest-expo.
 *   - `testEnvironment: ./environment.js` swaps in Detox's Jest
 *     environment (required for the `device` / `element` globals).
 *   - `maxWorkers: 1` because Detox coordinates a single iOS simulator
 *     / Android emulator per run.
 *   - `globalSetup` / `globalTeardown` own the Detox lifecycle so
 *     individual suites only need to call `device.launchApp()`.
 *   - `testTimeout: 120_000` because each suite's `beforeAll` in
 *     `setup.ts` calls `device.launchApp({ newInstance: true })`, and a
 *     cold-boot of the RN app + the Detox WebSocket handshake routinely
 *     takes >5 s on CI emulators/simulators. Jest-circus applies
 *     `testTimeout` to lifecycle hooks too, and its 5 s default was
 *     killing the launch hook before the app could send its "ready"
 *     message — Detox then aborted with "Failed to run application on
 *     the device" (HINT: cleanup() called while waiting for "ready").
 *     `.detoxrc.js` → `testRunner.jest.setupTimeout` and
 *     `environment.js` → `initTimeout` only govern Detox's *internal*
 *     init lifecycle, not the user `beforeAll`, so the budget has to be
 *     set here. Mirrors Detox's own `e2e/jest.config.js` template.
 */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.e2e.ts"],
  testEnvironment: "<rootDir>/e2e/environment.js",
  testRunner: "jest-circus/runner",
  testTimeout: 120_000,
  transform: {
    "\\.tsx?$": [
      "babel-jest",
      {
        presets: [
          ["babel-preset-expo", { jsxRuntime: "automatic" }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  reporters: ["detox/runners/jest/reporter"],
  setupFilesAfterEnv: ["<rootDir>/e2e/setup.ts"],
  verbose: true,
  maxWorkers: 1,
};
