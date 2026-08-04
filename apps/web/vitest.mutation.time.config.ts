import { defineConfig } from "vitest/config";

/**
 * Narrow Vitest config for Stryker mutation of `src/shared/lib/time/*`
 * (Kyiv/DST logic — tier-2 mutation target). The full web suite drags in
 * heavy jsdom + react-test-renderer files that fail under instrumentation
 * and would make the dry-run uselessly slow, so only the co-located time
 * suites run here (they are pure Node — no setup files, no aliases).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/shared/lib/time/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 15_000,
  },
});
