import { defineConfig } from "vitest/config";
import {
  baseVitestConfig,
  baseCoverageConfig,
} from "@sergeant/config/vitest.base";

export default defineConfig({
  ...baseVitestConfig,
  test: {
    ...baseVitestConfig.test,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      // 2026-08-04: без baseCoverageConfig vitest не емітив json-summary
      // репортер, тож CI-гейт floors (coverage-thresholds.json →
      // packages/db-schema) не бачив цей workspace. Line-floor живе у
      // кореневому coverage-thresholds.json — тут лише емісія репортів.
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
    },
  },
});
