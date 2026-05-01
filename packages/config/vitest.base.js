/**
 * Shared Vitest defaults used by every package in the monorepo. Individual
 * packages override `include`, `environment`, `setupFiles` and path aliases
 * as needed.
 *
 * AI-NOTE: this file is plain `.js` (not `.ts`) so Node's ESM loader can
 * resolve it through the `@sergeant/config/vitest.base` package export
 * without a transpiler. Vitest config files are loaded by vite-node which
 * handles their own `.ts`, but transitive imports across package boundaries
 * fall back to native Node ESM and choke on `.ts`. See PR #719 / #720.
 *
 * @type {import("vitest/config").UserConfig}
 */
export const baseVitestConfig = {
  test: {
    environment: "node",
    passWithNoTests: true,
  },
};

/**
 * Shared coverage configuration. Each package merges this into its own
 * `test.coverage` block. v8 provider is fast and ships with Node — no extra
 * native deps. We deliberately do NOT set thresholds here: per-package floors
 * are set in individual vitest.config files so each package can raise its own
 * bar independently without breaking packages that haven't reached a given
 * level yet. Recommended starting floor: lines/functions/statements >= 60,
 * branches >= 55. See `packages/insights/vitest.config.ts` for an example.
 */
export const baseCoverageConfig = {
  provider: /** @type {const} */ ("v8"),
  reporter: /** @type {const} */ (["text", "html", "json-summary", "lcov"]),
  reportsDirectory: "./coverage",
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-server/**",
    "**/coverage/**",
    "**/*.test.{js,jsx,ts,tsx,mjs}",
    "**/*.spec.{js,jsx,ts,tsx,mjs}",
    "**/__tests__/**",
    "**/__mocks__/**",
    "**/test/**",
    "**/tests/**",
    "**/*.d.ts",
    "**/*.config.{js,cjs,mjs,ts}",
    "**/build.mjs",
    "**/migrate.mjs",
  ],
};
