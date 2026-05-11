import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // src/legacy/** is the pre-rewrite plugin code preserved as reference
    // during the staged migration to the real openclaw 5.7 plugin SDK.
    // Its tests target the old (incorrect) sdk-types stubs and would fail.
    exclude: ["src/legacy/**", "node_modules/**"],
    passWithNoTests: true,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      exclude: [
        ...(Array.isArray(baseCoverageConfig.exclude)
          ? baseCoverageConfig.exclude
          : []),
        "src/legacy/**",
      ],
    },
  },
});
