import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "server/**/*.test.{js,ts}"],
    passWithNoTests: false,
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: [
        ...baseCoverageConfig.exclude,
        "src/test/**",
        "src/sw.ts",
        "src/main.tsx",
      ],
      thresholds: {
        // Baseline (2026-04-25): lines 17.42 / branches 65.51 / fns 52.42.
        // Floors set ~2pp below baseline to absorb flake; raise per sprint
        // as more component/hook tests land.
        lines: 15,
        branches: 63,
        functions: 50,
        statements: 15,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@finyk": resolve(__dirname, "src/modules/finyk"),
      "@fizruk": resolve(__dirname, "src/modules/fizruk"),
      "@routine": resolve(__dirname, "src/modules/routine"),
      "@nutrition": resolve(__dirname, "src/modules/nutrition"),
    },
  },
});
