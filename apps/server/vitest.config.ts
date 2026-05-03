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
        // Baseline (2026-05-03): lines 63.60 / branches 79.31 / fns 72.80 /
        // statements 63.60. Floors set ~1pp below baseline to absorb flake;
        // raise per sprint. Lines/statements drifted ~3.5pp downward since
        // 2026-04-25 (67.13 → 63.60) — the apps/server/src/scripts/
        // import-from-blob.ts ETL (471 LOC, 0% covered) is the dominant
        // contributor; covering it nudges global +2-3pp.
        lines: 63,
        branches: 74,
        functions: 69,
        statements: 63,
      },
    },
  },
});
