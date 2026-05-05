/**
 * Jest config for @sergeant/mobile.
 *
 * Uses the `jest-expo` preset which ships Metro-compatible transforms,
 * mocks for native modules (Expo, Reanimated, AsyncStorage, MMKV, etc.)
 * and a jsdom-free RN runtime. We run only tests under `src/**` to keep
 * Expo Router's app-directory out of Jest's test discovery.
 */
module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/src/**/*.test.{ts,tsx}",
    "<rootDir>/plugins/**/*.test.{ts,tsx}",
  ],
  setupFiles: ["<rootDir>/jest.setup.js"],
  // `@sergeant/*-domain` packages use NodeNext `.js`-extension imports
  // inside their TS source (required so they compile cleanly under the
  // workspace `"module": "NodeNext"` toolchain). Jest resolves them
  // straight from `src/index.ts` (see each package's `exports` map),
  // so we need to strip the trailing `.js` at resolve-time otherwise
  // jest-resolve reports "Cannot find module './types.js'".
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@app/(.*)$": "<rootDir>/app/$1",
    // `@sergeant/db-schema` ships a built `dist/` artefact in
    // production but Jest runs against the workspace TS source so we
    // don't need a `pnpm build` step before tests. Map every subpath
    // (`/sqlite`, `/pg`, `/shared`) and the package root onto
    // `packages/db-schema/src/...`.
    "^@sergeant/db-schema$": "<rootDir>/../../packages/db-schema/src/index.ts",
    // `migrate/pg` and `migrate/sqlite` are single files, not directories;
    // map them explicitly before the catch-all that appends `/index.ts`.
    "^@sergeant/db-schema/migrate/pg$":
      "<rootDir>/../../packages/db-schema/src/migrate/pg.ts",
    "^@sergeant/db-schema/migrate/sqlite$":
      "<rootDir>/../../packages/db-schema/src/migrate/sqlite.ts",
    "^@sergeant/db-schema/(.*)$":
      "<rootDir>/../../packages/db-schema/src/$1/index.ts",
  },
  transformIgnorePatterns: [
    // Keep the default `node_modules/` ignore but punch holes for the RN
    // / Expo / NativeWind ecosystem, whose published artefacts still
    // contain Flow / TSX / ESM syntax that Jest needs to transpile. The
    // extra `.pnpm/(?:.*\\+)?` segment accommodates pnpm's nested
    // `node_modules/.pnpm/<scope>+<pkg>@<ver>/node_modules/…` layout.
    "node_modules/(?!(\\.pnpm/(?:.*\\+)?)?((jest-)?react-native(-.*)?|@react-native(-community)?(/.*)?|expo(nent)?|@expo(nent)?(/.*)?|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|victory(-.*)?))",
  ],
  // Coverage floors. Mirror the per-package convention used by web/server
  // (`apps/{web,server}/vitest.config*`): pin a low floor that current
  // baseline already clears (~60/45/65/62 measured 2026-05-05 across
  // 115 suites / 562 passing tests) so future drops fail CI instead of
  // sliding silently. Per-file shape mirrors Jest's docs:
  // https://jestjs.io/docs/configuration#coveragethreshold-object
  //
  // Drift log:
  // - 2026-05-05 baseline (apps/mobile): lines 62.94 / branches 45.86 /
  //   functions 65.55 / statements 60.69. Floor pinned at 30/25/30/30
  //   (≥ ~30pp head-room). Revisit when raising — owner: @Skords-01.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/**/types.ts",
    "!src/**/*.d.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "json", "json-summary"],
  coverageThreshold: {
    global: {
      lines: 30,
      branches: 25,
      functions: 30,
      statements: 30,
    },
  },
};
