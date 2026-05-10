import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      exclude: [
        ...(Array.isArray(baseCoverageConfig.exclude)
          ? baseCoverageConfig.exclude
          : []),
        "src/sdk-types.ts",
        "src/parity/golden-conversations.ts",
      ],
    },
  },
});
