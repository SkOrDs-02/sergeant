import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  resolve: {
    alias: {
      // Build-order незалежність (аудит 2026-08-04): package exports map
      // `@sergeant/db-schema/pg` резолвиться у dist/pg/index.js, тож на
      // свіжому checkout без `pnpm --filter @sergeant/db-schema build`
      // server-тести падали з ERR_MODULE_NOT_FOUND. Алісимо subpath прямо
      // на src — vitest транспілює TS сам, dist не потрібен. Головний
      // entry `@sergeant/db-schema` в apps/server/src не імпортується,
      // тому аліас лише для `/pg` (єдиний вживаний subpath).
      "@sergeant/db-schema/pg": fileURLToPath(
        new URL("../../packages/db-schema/src/pg/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Фонова телеметрія `last_seen_at` вимкнена в unit-прогоні: маршрутні
    // тести мокають пул чергою `mockResolvedValueOnce`, і позаплановий
    // UPDATE зʼїдає чужу відповідь. Сама поведінка покрита в
    // `src/lib/lastSeen.test.ts`, де прапорець вмикається явно.
    env: { LAST_SEEN_TRACKING_ENABLED: "false" },
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "src/**/*.e2e.test.ts"],
    passWithNoTests: true,
    // The server suite contains hundreds of module-heavy files. Letting Vitest
    // size the worker pool from the host CPU count overloads module imports
    // during the monorepo-wide Turbo fan-out and produces false 15s timeouts.
    maxWorkers: process.env["CI"] ? 2 : 4,
    // Flaky-test quarantine (item #20): retry once on CI only — mirrors
    // baseVitestConfig in packages/config/vitest.base.js. See
    // docs/testing/README.md → "Flaky-test quarantine".
    retry: process.env["CI"] ? 1 : 0,
    // Coverage instrumentation, cold route-registry imports, and dynamic
    // `await import("./module.js")` inside tests can blow past the 5s default
    // under Turbo concurrency. Keep a finite 30s ceiling for those module-heavy
    // cases without masking genuine hangs.
    testTimeout: 30_000,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
      // CLI-точки входу (`rag-eval:embed`, `rag-eval:live`, `eval:tools:judge`)
      // не імпортує ніхто: це `main()` + розбір аргументів + друк звіту, який
      // запускає людина руками й платно. Юніт-тест на них не міряє нічого,
      // окрім самого себе, а їхня присутність у знаменнику робить із
      // coverage-ратчета датчик кількості CLI-скриптів. Логіка, яку варто
      // перевіряти, з них винесена: `lib/ragEval/*` і `modules/chat/toolEval/*`
      // покриті тестами і з покриття НЕ виключені.
      exclude: [...baseCoverageConfig.exclude, "src/scripts/**"],
      thresholds: {
        // Baseline drift log:
        //  - 2026-04-25 actual: lines 67.13 / branches 79.31 / fns 72.80 / statements 67.13
        //  - 2026-05-03 actual: lines 63.60 / branches 79.31 / fns 72.80 / statements 63.60
        //  - 2026-05-05 actual: lines 60.51 / branches 48.97 / fns 63.97 / statements 59.54
        //  - 2026-08-01 actual: lines 93.02 / branches 83.07 / fns 91.83 / statements 91.94
        //    (verified via `pnpm --filter @sergeant/server test:coverage`).
        //    The three surfaces the 2026-05-05 entry called out as the next
        //    sprint's targets are now all 95-100% lines: nutrition tool
        //    handlers (day-plan/food-search/parse-pantry/
        //    shopping-list/week-plan), modules/sync/syncV2.ts, and
        //    modules/digest/weekly-digest.ts. Stale coverage claims in
        //    docs/90-work/tech-debt/backend.md § "Tests coverage map"
        //    reconciled the same day.
        //  - 2026-08-04 actual: lines 92.95 / branches 82.75 / fns 92.05
        //    (coverage-depth audit, docs/90-work/audits/
        //    2026-08-04-test-coverage-depth-audit.md). Floors ratcheted to
        //    fact − 5пп: the old 60/48/63 safety net sat ~30пп below fact —
        //    a legal degradation corridor no gate would flag. The repo-root
        //    ratchet (`coverage-ratchet.json`) remains the tight
        //    "no worse than now" gate; these floors are the hard backstop.
        lines: 88,
        branches: 77,
        functions: 87,
        statements: 87,
      },
    },
  },
});
