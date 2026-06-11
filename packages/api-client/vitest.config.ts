import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

// Coverage line-floor — з кореневого coverage-thresholds.json (single source
// of truth, той самий файл читає CI-гейт у ci.yml). Лишається тільки lines:
// решту метрик CI не гейтить.
const thresholds = JSON.parse(
  readFileSync(
    new URL("../../coverage-thresholds.json", import.meta.url),
    "utf8",
  ),
) as { workspaces: Record<string, number> };

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      thresholds: {
        lines: thresholds.workspaces["packages/api-client"],
      },
    },
  },
});
