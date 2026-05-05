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
        "src/sw/**",
        "src/main.tsx",
      ],
      thresholds: {
        // Drift log (cumulative — keep all entries so the next sprint can
        // raise floors from a known anchor):
        //
        // - 2026-04-25 baseline: lines 17.42 / branches 65.51 / fns 52.42 /
        //   statements 17.42. Floors at the time: 15 / 63 / 50 / 15.
        // - 2026-05-05 measured (after the connectionGate +
        //   vercelOutputConfig + HubDashboard test fixes that finally let
        //   `apps/web` test:coverage exit code 0 again):
        //     lines 39.29 / branches 32.83 / fns 29.3 / statements 38.06.
        //   Floors set then: 37 / 30 / 27 / 36.
        //
        // - 2026-05-05 measured (this commit, after excluding `src/sw/**`
        //   from coverage — option (b) from the previous drift entry):
        //     lines 39.82 / branches 33.15 / fns 29.69 / statements 38.59.
        //   Floors raised to 38 / 31 / 28 / 37 (~+1pp ratchet, ~2pp head-
        //   room kept). The lift from excluding the service-worker is
        //   smaller than expected (+0.32 to +0.53pp) — the bulk of the
        //   2026-04-25 → 2026-05-05 collapse is in `src/shared/lib/idb`
        //   (~17% covered), `src/shared/lib/ui/{amountTone,export,perf}`
        //   (0% each) and many low-coverage finyk/fizruk/nutrition
        //   surfaces, not in `sw/**` itself. SW is now treated as
        //   e2e-only territory (covered by `tests/a11y/sw-smoke.spec.ts`).
        //
        // Floors set ~2pp below current actuals — same pattern as
        // `apps/server/vitest.config.ts`. Raise per sprint as the idb /
        // shared-lib-ui tests land (see docs/testing/2026-05-05-tests-
        // pr-plan.md → PR-T03 / PR-T04).
        lines: 38,
        branches: 31,
        functions: 28,
        statements: 37,
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
