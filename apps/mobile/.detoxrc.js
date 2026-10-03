/**
 * Detox configuration for `@sergeant/mobile`.
 *
 * Paired with the first E2E suite in `apps/mobile/e2e/*` (see
 * `docs/engineering/mobile/react-native-migration.md` §8 and §13 Q8).
 *
 * The Expo app uses `@config-plugins/detox` (registered in
 * `app.config.ts`) to patch the generated iOS / Android projects after
 * `expo prebuild`. Detox talks to the binaries produced by the Expo
 * *development* build target (same one EAS uses for `eas build --profile
 * development`) because the dev-client already bundles Metro + the Detox
 * native bridge.
 *
 * Usage (from `apps/mobile/`):
 *
 *   pnpm e2e:build:ios    # builds the iOS .app into ios/build/
 *   pnpm e2e:test:ios     # boots an iOS simulator and runs the suite
 *   pnpm e2e:build:android
 *   pnpm e2e:test:android
 *
 * The Android block is configured so a contributor with a macOS+AVD or
 * Linux+AVD host can run the suite locally, but CI currently only wires
 * up iOS (see `.github/workflows/detox-ios.yml`). Android CI is tracked
 * as a follow-up to this PR — rationale in the migration doc §9.
 */

/** @type {import('detox/runners/jest').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "e2e/jest.config.js",
    },
    jest: {
      setupTimeout: 120_000,
    },
  },
  apps: {
    "ios.debug": {
      type: "ios.app",
      binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/Sergeant.app",
      build:
        "xcodebuild -workspace ios/Sergeant.xcworkspace -scheme Sergeant -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet",
    },
    "android.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/debug/app-debug.apk",
      build:
        "cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug && cd ..",
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        // Keep in sync with `.github/workflows/detox-ios.yml` `xcrun
        // simctl boot` target. A newer device can be substituted on a
        // contributor's machine via `-c ios.sim.debug --device-name ...`.
        type: "iPhone 15",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        // A contributor local AVD — overridden via `--device-name` on CI.
        avdName: "Pixel_5_API_34",
      },
    },
  },
  configurations: {
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.debug",
    },
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
  },
  // Metro, MMKV, AsyncStorage and Better Auth state are all process-local
  // — wiping the app before every suite keeps tests independent and
  // matches how the jest-expo unit tests bootstrap `FinykTransactionsStore`.
  behavior: {
    init: {
      reinstallApp: true,
    },
    cleanup: {
      shutdownDevice: false,
    },
  },
  artifacts: {
    rootDir: ".detox-artifacts",
    plugins: {
      log: { enabled: true },
      screenshot: { enabled: true, shouldTakeAutomaticSnapshots: true },
      video: { enabled: false },
    },
  },
};
