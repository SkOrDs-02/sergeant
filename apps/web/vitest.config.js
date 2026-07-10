import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

// Line-floor — з кореневого coverage-thresholds.json (single source of truth,
// той самий файл читає CI-гейт у ci.yml). branches/functions/statements
// лишаються локальними — CI гейтить тільки lines.
const sharedThresholds = JSON.parse(
  readFileSync(
    new URL("../../coverage-thresholds.json", import.meta.url),
    "utf8",
  ),
).workspaces;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // CI runners are intermittently throttled (the whole pipeline has been
    // observed running 1.5–3× slower than its p95 — every job, not just this
    // one). At that pace the heavy jsdom + react-test-renderer suites flake on
    // vitest's default 5s testTimeout / 10s hookTimeout even though they pass
    // comfortably at normal speed (verified: full suite green locally incl.
    // CI=true). Raise the ceilings so slow-runner timing alone can't fail an
    // otherwise-green run; genuine hangs still trip the higher bound.
    testTimeout: 20000,
    hookTimeout: 30000,
    // CI memory guard: the heavy jsdom + react-test-renderer suite (316 files)
    // spikes peak memory, and on throttled/memory-constrained CI runners the
    // default worker count gets OOM-killed mid-run — vitest then exits 1 with
    // no "Test Files …" summary (a process crash, not an assertion failure),
    // which the raised timeouts above can't help. Cap worker concurrency in CI
    // to bound peak memory; local dev keeps full parallelism (undefined = auto).
    maxWorkers: process.env.CI ? 2 : undefined,
    minWorkers: process.env.CI ? 1 : undefined,
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "server/**/*.test.{js,ts}"],
    passWithNoTests: false,
    // Flaky-test quarantine (item #20): retry once on CI only — mirrors
    // baseVitestConfig in packages/config/vitest.base.js. The heavy jsdom +
    // react-test-renderer suites are the main flake source on throttled
    // runners; a single retry absorbs transient timing flips while genuine
    // failures still go red (both attempts must pass once for a stable test).
    // See docs/testing/README.md → "Flaky-test quarantine".
    retry: process.env.CI ? 1 : 0,
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
        // Storybook fixtures and the dev-only visual catalog are not product
        // logic — they ship no runtime behaviour worth unit-testing and only
        // skewed the coverage denominator. Excluded so the line floor reflects
        // real app code. (Stories are still exercised via Storybook/visual.)
        "src/**/*.stories.{ts,tsx}",
        "src/core/DesignShowcase/**",
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
        // - 2026-06-03 (audit `2026-05-13-testing-devx-roast.md` §P1-6
        //   closeout): landed module unit suites for the thin
        //   finyk/fizruk/nutrition slices the drift log called out —
        //   `finyk/lib/__tests__/upcomingSchedule`,
        //   `fizruk/lib/__tests__/exerciseProgress`,
        //   `nutrition/lib/__tests__/nutritionStats` (pure date / stats /
        //   progress aggregation helpers). Net coverage only moves up, so
        //   ratchet the floors a modest +1pp toward the audit target
        //   (lines ≥ 50 long-term): 39 / 32 / 29 / 38. Headroom kept so a
        //   throttled CI run can't dip under; raise again as the next
        //   module slices land.
        //
        // - 2026-06-13 (P1 #2 increment): added unit suites for
        //   syncTone (finyk/lib), apiUrl (shared/lib/api),
        //   dualWrite/core (shared/lib/dualWrite), greeting
        //   (shared/lib/time), and extended userAgent edge cases.
        //   Achieved: lines 50.24 / branches 41.75 / fns 40.92 /
        //   statements 48.63. Ratchet: lines → 50 (in
        //   coverage-thresholds.json), branches → 41, fns → 40,
        //   statements → 48. ~0.2–0.75pp headroom kept for throttled CI.
        //
        // - 2026-06-23 (web-test-coverage-75 push): landed ~160 new unit
        //   suites across finyk/fizruk/nutrition/routine modules,
        //   core/lib (hubChat*, insightsEngine, chatActions),
        //   core/hub cards + search/chat hooks, shared components/hooks/lib
        //   and core settings/onboarding/security. Measured (CI worker cap,
        //   full suite green — 562 files / 5530 tests):
        //     lines 77.65 / branches 65.67 / fns 66.01 / statements 75.68.
        //   Ratchet: lines → 75 (in coverage-thresholds.json — meets the
        //   repo-wide default floor), branches → 63, fns → 64,
        //   statements → 73. ~2–2.7pp headroom kept for throttled CI.
        //
        // - 2026-07-10 (web coverage wave 1–4): parallel subagent push
        //   across finyk/fizruk/nutrition/core/routine + SQLite storage
        //   test drift fixes. Measured (CI=true, maxWorkers=1, 697 files /
        //   6977 tests):
        //     lines 89.76 / branches 75.1 / fns 81.52 / statements 87.29.
        //   Ratchet: lines → 87 (coverage-thresholds.json), branches → 73,
        //   fns → 79, statements → 85. ~2–2.8pp headroom for throttled CI.
        //
        // - 2026-07-10 (web coverage wave 5): branch-focused push on finyk,
        //   core (dailySeries/AuthContext/useChatSend), fizruk orchestrator.
        //   Measured (CI=true, maxWorkers=1, 700 files / 7115 tests):
        //     lines 89.92 / branches 75.34 / fns 81.64 / statements 87.47.
        //   Ratchet: lines → 88, branches → 74. ~1.3–2pp headroom.
        //
        // - 2026-07-10 (web coverage wave 6): zero-coverage shells across
        //   fizruk/routine/nutrition/core hub+settings. Measured (CI=true,
        //   maxWorkers=1, 710 files / 7121 tests):
        //     lines 90.49 / branches 75.76 / fns 82.63 / statements 88.
        //   Ratchet: lines → 88 (coverage-thresholds.json), branches → 74,
        //   fns → 81, statements → 86. ~1.5–2.5pp headroom for throttled CI.
        //
        // Floors set ~1.3–2.5pp below current actuals. Raise per sprint
        // as more component shells land (next targets: FinykApp,
        // NutritionApp, useRoutineAppState, CommandPaletteUI,
        // HabitDetailSheet — the heavy orchestration shells still at 0%).
        // `lines` приходить з кореневого coverage-thresholds.json.
        lines: sharedThresholds["apps/web"],
        branches: 74,
        functions: 81,
        statements: 86,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@assets": resolve(__dirname, "src/assets"),
      "@finyk": resolve(__dirname, "src/modules/finyk"),
      "@fizruk": resolve(__dirname, "src/modules/fizruk"),
      "@routine": resolve(__dirname, "src/modules/routine"),
      "@nutrition": resolve(__dirname, "src/modules/nutrition"),
    },
  },
});
