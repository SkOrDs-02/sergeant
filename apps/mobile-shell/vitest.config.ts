import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Coverage instrumentation + dynamic `await import("../index.js")` inside
    // boundary.test.ts (the first import in the file triggers the whole
    // transform + environment chain — ~17s setup + 11s transform on CI) blows
    // past the 5s default for the first dynamic-import test, even though
    // subsequent tests in the same file are warm-cached and finish in <1s.
    // Lift to 15s to absorb the cold-start without masking real hangs.
    // Mirrors `apps/server/vitest.config.ts`.
    testTimeout: 15_000,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
    },
  },
});
