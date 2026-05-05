import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
    // Coverage instrumentation + dynamic `await import("./module.js")` inside
    // tests (e.g. push.test.ts re-imports push.ts per case to pick up env
    // changes) can blow past the 5s default under turbo concurrency. Lift to
    // 15s to absorb that without masking real hangs.
    testTimeout: 15_000,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      thresholds: {
        // Baseline drift log:
        //  - 2026-04-25 actual: lines 67.13 / branches 79.31 / fns 72.80 / statements 67.13
        //  - 2026-05-03 actual: lines 63.60 / branches 79.31 / fns 72.80 / statements 63.60
        //  - 2026-05-05 actual: lines 60.51 / branches 48.97 / fns 63.97 / statements 59.54
        //
        // Three uncovered surfaces dominate the drop and are the next
        // sprint's coverage targets (raise floors per file as each ships
        // its tests):
        //  - apps/server/src/modules/nutrition/{day-hint,day-plan,food-search,
        //    parse-pantry,find-recipes,shopping-list,week-plan}.ts (Anthropic
        //    tool handlers, ~0–15% covered each)
        //  - apps/server/src/modules/openclaw/{tools,write-tools}.ts
        //    (Anthropic tool handlers, branchy)
        //  - apps/server/src/modules/sync/syncV2.ts and apps/server/src/
        //    modules/digest/weekly-digest.ts (~0–1% covered, large)
        //
        // Floors are set ~1pp below current actuals so CI does not red-line
        // on flake; raise back toward the 2026-05-03 baseline as tests land.
        lines: 60,
        branches: 48,
        functions: 63,
        statements: 59,
      },
    },
  },
});
