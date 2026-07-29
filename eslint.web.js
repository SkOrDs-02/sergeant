// PR-31 phase 2 — web-only flat-config blocks extracted from the root
// `eslint.config.js`. Composed back via `...webBlocks` so
// `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: `apps/web/**`.
//
// The i18n JSON burndown allowlist lives here (not in the root) because
// only web blocks consume them. `import.meta.url` resolves relative to this
// file, which sits at the repo root next to `eslint.config.js`, so the
// `./apps/web/...` paths are unchanged.
import { readFileSync } from "node:fs";

// i18n burndown gate (item #18 Phase 3) — list of files exempt from
// `sergeant-design/no-cyrillic-jsx-literal`. Each entry is a project-
// relative path to a file that still has inline cyrillic JSX literals.
// Migrate strings → `apps/web/src/shared/i18n/uk.ts` and remove the
// path from the JSON. When the array is empty, promote the rule from
// "warn" to "error". See `docs/i18n/readiness.md` § Burndown.
// TARGET DEADLINE: 2026-Q3 (до 2026-09-30). Поточний розмір: ~30 файлів.
// Відповідальний: @Skords-01. Прогрес: docs/i18n/readiness.md § Burndown.
const i18nAllowlist = JSON.parse(
  readFileSync(
    new URL("./apps/web/eslint.i18n-allowlist.json", import.meta.url),
    "utf8",
  ),
);

export const webBlocks = [
  // Dark-mode anti-pattern guardrail — fires on a className that
  // pairs a raw-palette light utility (`bg-amber-50`, `text-coral-100`,
  // `border-teal-200/50`, …) with a `dark:` raw-palette override
  // (`dark:bg-amber-500/15`, `dark:text-coral-900/30`,
  // `dark:border-teal-800/30`). Both halves encode palette knowledge
  // at the call-site, so the next palette migration silently drops
  // one half (this is exactly bug #814). The fix is always the
  // same: lift the light/dark pair into the design-system token
  // layer (`bg-success-soft`, `bg-finyk-surface`,
  // `border-routine-soft-border`, …). Shipped at "error" once the
  // dark-mode audit's inventory closed (Wave 2c of
  // docs/design/dark-mode-audit.md) — every existing pair has
  // been migrated, so any new violation is intentional and must
  // be opted out with an `eslint-disable-next-line` + comment.
  //
  // Web-only: the semantic replacements (`bg-{family}-soft`, etc.)
  // resolve through `--c-{family}-soft*` CSS variables defined in
  // `apps/web/src/index.css`. NativeWind (apps/mobile) renders
  // classNames into RN inline styles and does NOT consume those
  // CSS variables, so applying the rule there would force authors
  // toward tokens that resolve to `rgb(undefined)` on mobile.
  // §7 no-console guardrail — Phase 6 follow-up (tech-debt/frontend.md §7).
  // Catches accidental production console.* calls in `apps/web/src/**`.
  // Test globs and story files are fully exempt — they legitimately use
  // console.* for fixtures and debugging without Sentry overhead.
  // The 3 documented DEV-only / transport call-sites carry inline
  // `eslint-disable-next-line no-console` with justification comments:
  //   • `shared/lib/ui/perf.ts`          — console.debug under hub_perf=1 + DEV
  //   • `sw/debug.ts`                    — console.log under debugEnabled + DEV
  //   • `core/observability/analytics.ts`— console.log intentional transport
  //   • `shared/lib/log/logger.ts`       — canonical logger transport (power-user)
  // New call-sites that bypass `logger` helper will fail CI.
  {
    files: ["apps/web/src/**/*.{ts,tsx,js,jsx}"],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx,js,jsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/*.stories.{ts,tsx,js,jsx}",
    ],
    rules: {
      "no-console": "error",
    },
  },
  // §9 @typescript-eslint/no-explicit-any → error for modules/** and core/**.
  // Production has 0 trackable any + 3 by-design loose patterns (each with
  // inline eslint-disable-next-line + justification). Tightening from warn
  // to error here surfaces any new drift immediately in CI.
  //   • `shared/lib/ui/parseFizrukWorkouts.ts:8` — legacy LS shape parser
  //   • `core/hub/search/searchCache.ts:54`      — shared LooseRecord alias
  //   • `core/lib/lazyImport.ts:39`              — ComponentType<any> by design
  // All three already carry eslint-disable-next-line comments with rationale.
  {
    files: [
      "apps/web/src/modules/**/*.{ts,tsx}",
      "apps/web/src/core/**/*.{ts,tsx}",
    ],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/*.stories.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "sergeant-design/no-cyrillic-jsx-literal": [
        "warn",
        { allowlist: i18nAllowlist },
      ],
      "sergeant-design/no-flat-shared-lib": "error",
      "sergeant-design/prefer-kyiv-time": "warn",
    },
  },
  // Hash-router migration gate — initiative 0006 (frontend routing &
  // code-split). `apps/web/src/modules/**` мігровано з самописного
  // hash-router (`useHashRouter` / `useHashRoute` / raw
  // `window.location.hash = ...` assignments) на `react-router@7` з
  // route-based code-split. Phase 2 закрита наступними PR-ами:
  //   • nutrition — #2104
  //   • finyk     — #2108
  //   • fizruk    — #2541 (path-route) + #2570 (fizruk hash-cleanup)
  //   • routine   — #2545
  // Generic-hook видалено в #2551; Phase 3 compat-shim (`HashRedirect`)
  // живе в #2549; Phase 4 ScrollRestoration — #2553.
  //
  // Усі callsite-и в `apps/web/src/modules/**` тепер ходять через
  // path-based `useNutritionRoute` / `useFinykRoute` / `useFizrukRoute` /
  // `useRoutineRoute` або через injected `onNavigate` prop із module
  // shell-а. Rule піднята з `warn` (canary) до `error` — нові hash-
  // assignments у модулях ламають lint і CI, як заплановано в
  // `docs/90-work/initiatives/archive/_0006-frontend-routing-and-code-split.md` §Phase 2.
  {
    files: ["apps/web/src/modules/**/*.{ts,tsx}"],
    rules: {
      "sergeant-design/no-hash-router-in-modules": "error",
    },
  },
  // Web localStorage guardrail — direct `localStorage.*` access is a
  // hazard (throws on quota / private-browsing / corrupt JSON). The
  // shared `safeReadLS` / `safeWriteLS` helpers in
  // `apps/web/src/shared/lib/storage.ts`, the `useLocalStorageState`
  // hook, and `createModuleStorage` wrap the API with try/catch and
  // quota fallbacks. New web code MUST go through one of those — and
  // those wrappers themselves now route every read/write through
  // `webKVStore` from `@sergeant/shared`, so the `ignores` list below
  // contains only test fixtures.
  //
  // PR #054 final (storage-roadmap.md Stage 7) closed the burndown:
  // production allowlist count is 0 (see
  // `.tech-debt/localstorage-allowlist-budget.json`). The six former
  // exemptions (`storage.ts`, `storageManager.ts`, `storageQuota.ts`,
  // `typedStore.ts`, `createModuleStorage.ts`,
  // `useLocalStorageState.ts`) were rewritten to delegate to
  // `webKVStore` — `storage.ts` resolves the singleton, the others
  // import it. The only remaining direct `Storage` reference is in
  // `storageQuota.ts`, accessed via a renamed local binding
  // (`const storage = globalThis.localStorage`) so the rule does not
  // fire — that helper has to surface `setItem` exceptions to the
  // caller, which `webKVStore.setString` swallows by design.
  {
    files: ["apps/web/src/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      // Tests can use `localStorage` freely as fixtures.
      "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-raw-local-storage": "error",
    },
  },
  // AuthContext migration (Session 4B, PR after #390): "who am I" is
  // single-sourced via `useUser()` from `@sergeant/api-client/react` → GET
  // `/api/v1/me`. Better Auth stays only as the actions layer. Block
  // reintroduction of `useSession` from `better-auth/react` anywhere in the
  // web app except `authClient.ts`, which is the one legitimate adapter
  // module — it owns the Better Auth client and intentionally does NOT
  // re-export `useSession` (see the note in that file).
  //
  // Same block also bans the `@sergeant/db-schema/migrate` umbrella entry —
  // that re-exports `loadMigrationFiles` from `./files.js`, which top-level
  // imports `node:fs` / `node:path` and breaks Vite's browser bundle (white
  // screen on boot — see audit `docs/90-work/audits/2026-05-07-app-audit.md` §1).
  // Browser-side callers must use one of the saner sub-segments:
  // `@sergeant/db-schema/migrate/runner` (dialect-free runner),
  // `@sergeant/db-schema/migrate/sqlite` (sqlite adapter),
  // `@sergeant/db-schema/migrate/pg`     (pg adapter — Node-only callers).
  {
    files: ["apps/web/src/**/*.{js,jsx,ts,tsx}"],
    ignores: ["apps/web/src/core/auth/authClient.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-auth/react",
              importNames: ["useSession"],
              message:
                "Use `useAuth()` from `core/auth/AuthContext` (backed by `useUser()` from `@sergeant/api-client/react` → GET /api/v1/me). `useSession` from Better Auth is only for the actions layer inside `core/auth/authClient.ts`.",
            },
            {
              name: "@sergeant/db-schema/migrate",
              message:
                "Import the runner from `@sergeant/db-schema/migrate/runner` (or the dialect-specific sub-segment `…/migrate/sqlite` / `…/migrate/pg`). The umbrella `…/migrate` re-exports `loadMigrationFiles` from `./files.js`, which top-level imports `node:fs`/`node:path` and breaks Vite's browser bundle. See `docs/90-work/audits/2026-05-07-app-audit.md` §1.",
            },
          ],
        },
      ],
    },
  },
  // React Query keys factory guardrail — AGENTS.md hard rule #2: all
  // `queryKey` / `mutationKey` values must come from the centralized
  // factory in `apps/web/src/shared/lib/api/queryKeys.ts`. Inline array
  // literals break bulk invalidation and let typos compile silently.
  // The factory file itself is exempt (it defines the arrays).
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/shared/lib/api/queryKeys.ts",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/rq-keys-only-from-factory": "error",
    },
  },
  // Module-size guardrail (initiative 0001) — `max-lines: [error, 600]`
  // for `apps/web/src/**/*.{ts,tsx}`. Enforces decomposition discipline:
  // a single TS/TSX file in the web bundle must not exceed 600 LOC
  // (skipBlankLines + skipComments). New violations fail CI; existing
  // monoliths are explicitly allowlisted with a deadline TODO so the
  // queue stays visible. See `docs/90-work/initiatives/archive/_0001-module-decomposition.md`.
  //
  // Scope rationale:
  // - Limited to `apps/web/src/**` — the audit's red-flag table flagged
  //   web-only monoliths; `apps/server/src/modules/chat/` was already
  //   decomposed (was a single `agent.ts` monolith, now split into
  //   `chat.ts` orchestrator + `tools.ts` + `coach.ts` + `aiQuota.ts` +
  //   `toolMetrics.ts` + `toolDefs/<domain>/`) and is the precedent.
  //   `apps/mobile/**` is out of scope (initiative 0002 owns that surface).
  // - `**/__tests__/**` and `*.{test,spec}.{ts,tsx}` are exempt — large
  //   fixture files and snapshot-style suites are legitimate.
  // - Generated files (`apps/web/src/generated/**`) are exempt for the
  //   same reason — they are regenerated and never hand-edited.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/*.spec.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/generated/**",
    ],
    rules: {
      "max-lines": [
        "error",
        { max: 600, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // Theme 6 (consolidated audit 2026-05-13): `@typescript-eslint/no-non-null-assertion`
  // — warn-level gate for `!` non-null assertions that bypass `noUncheckedIndexedAccess`.
  // The fizruk module (Dashboard/Atlas/Workouts/Exercise/Progress/Programs) had the most
  // documented violations (F15 adaptiveSort.ts, F18 hubReports, Measurements.tsx:268,
  // ExerciseProgressChart.tsx:57, WeeklyVolumeChart.tsx:79, WorkoutTemplatesSection.tsx:491).
  // Severity `warn` because ~96 existing production assertions remain; the
  // ones in fizruk are fixed below. Promoted to `error` when count reaches zero.
  // Burn-down: 2026-Q3. See docs/90-work/audits/2026-05-13-consolidated-page-audit.md § Theme 6.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/*.stories.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `immutability` cleared
  // apps/web: the 3 remaining call-sites (ManualExpenseSheet reset-effect
  // referencing later-declared setters; CategoryPieChart accumulator
  // mutation during render) were fixed. Promoted from the baseline `off`
  // to web-scoped `error` so the next regression fails lint loudly. Stays
  // `off` in the shared baseline because apps/mobile still carries
  // legacy violations (separate future bite). See
  // `docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `preserve-manual-memoization`
  // cleared apps/web: a 2026-07-04 sweep found 9 call-sites; 6 were fixed by
  // narrowing memo dependencies to the exact scalar/property the body reads
  // (useMonobankWebhook `lastUpdated`, useNutritionPantries `pantryItems`) and
  // by making the current instant a primitive `Date.now()` epoch instead of a
  // component-scope `new Date()` object (finyk Overview subscription/debt
  // flows, which the Compiler had flagged as depending on a locally-created
  // mutable). The remaining 3 carry a scoped `eslint-disable-next-line` with a
  // WHY: two thin fizruk derivation hooks (usePrLatest / usePrPendingInsight)
  // the Compiler inlines and declines to re-memoize, and one finyk Overview
  // memo over the `manualExpenses` storage-slots array the Compiler
  // conservatively treats as reassignable. All three keep a correct,
  // behaviour-preserving manual memo that does real work at runtime (React
  // Compiler is not wired into the Vite build yet). Promoted from the baseline
  // `off` to web-scoped `error` so the next regression fails lint loudly. Stays
  // `off` in the shared baseline because apps/mobile still carries legacy
  // violations (separate future bite). See
  // `docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/preserve-manual-memoization": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `purity` cleared apps/web
  // (0 violations measured 2026-07-10 via `npx eslint apps/web/src --rule
  // '{"react-hooks/purity":"error"}' --no-inline-config`). Promoted from
  // baseline `off` to web-scoped `error`.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/purity": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `refs` cleared apps/web
  // across 26 files: useEffect callback-ref sync, HubSearch destructure,
  // AddMealSheet skippedSource state, useSwipeNavigation isDragging state,
  // DropdownMenu/Tooltip cloneElement ref taint fixes. Promoted from baseline
  // `off` to web-scoped `error`. See initiative 0021.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `set-state-in-effect` cleared
  // apps/web in two waves (2026-07-10): wave 1 (81→48) fixed
  // `useSqliteTickOverlay`, render-time SQLite overlay, `useSyncExternalStore`
  // patterns; wave 2 (48→0) fixed core hub/onboarding, finyk/nutrition/routine
  // modules, and shared UI (Toast/Tooltip/PageTransition/voice). Promoted from
  // baseline `off` to web-scoped `error` so the next regression fails lint
  // loudly. Mobile cleared in the same initiative (2026-07-10). See
  // `docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "error",
    },
  },
];
