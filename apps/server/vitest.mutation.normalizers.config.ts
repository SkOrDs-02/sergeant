import { defineConfig } from "vitest/config";

/**
 * Narrow Vitest config for Stryker mutation of `src/lib/normalizers/*`.
 * The full server suite includes snapshot/route tests that fail under
 * instrumentation (and would make the dry-run uselessly slow).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/normalizers/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 15_000,
  },
});
