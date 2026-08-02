import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "src/**/*.e2e.test.ts"],
    passWithNoTests: true,
    // The server suite contains hundreds of module-heavy files. Letting Vitest
    // size the worker pool from the host CPU count overloads module imports
    // during the monorepo-wide Turbo fan-out and produces false 15s timeouts.
    maxWorkers: process.env["CI"] ? 2 : 4,
    // Flaky-test quarantine (item #20): retry once on CI only — mirrors
    // baseVitestConfig in packages/config/vitest.base.js. See
    // docs/testing/README.md → "Flaky-test quarantine".
    retry: process.env["CI"] ? 1 : 0,
    // Coverage instrumentation, cold route-registry imports, and dynamic
    // `await import("./module.js")` inside tests can blow past the 5s default
    // under Turbo concurrency. Keep a finite 30s ceiling for those module-heavy
    // cases without masking genuine hangs.
    testTimeout: 30_000,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      thresholds: {
        // Baseline drift log:
        //  - 2026-04-25 actual: lines 67.13 / branches 79.31 / fns 72.80 / statements 67.13
        //  - 2026-05-03 actual: lines 63.60 / branches 79.31 / fns 72.80 / statements 63.60
        //  - 2026-05-05 actual: lines 60.51 / branches 48.97 / fns 63.97 / statements 59.54
        //  - 2026-08-01 actual: lines 93.02 / branches 83.07 / fns 91.83 / statements 91.94
        //    (verified via `pnpm --filter @sergeant/server test:coverage`).
        //    The three surfaces the 2026-05-05 entry called out as the next
        //    sprint's targets are now all 95-100% lines: nutrition tool
        //    handlers (day-hint/day-plan/food-search/parse-pantry/
        //    shopping-list/week-plan), modules/sync/syncV2.ts, and
        //    modules/digest/weekly-digest.ts. Stale coverage claims in
        //    docs/90-work/tech-debt/backend.md § "Tests coverage map"
        //    reconciled the same day.
        //
        // Floors below are deliberately NOT raised to match — this is a
        // generous static safety net, not the regression gate. The real
        // gate is the repo-root ratchet (`coverage-ratchet.json` +
        // docs/02-engineering/testing/README.md § "Coverage ratchet"),
        // which tracks the 2026-08-01 baseline and fails on any drop.
        lines: 60,
        branches: 48,
        functions: 63,
        statements: 59,
      },
    },
  },
});
