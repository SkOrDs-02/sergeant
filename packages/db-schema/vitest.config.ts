import { defineConfig } from "vitest/config";
import { baseVitestConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  ...baseVitestConfig,
  test: {
    ...baseVitestConfig.test,
    include: ["src/__tests__/**/*.test.ts"],
  },
});
