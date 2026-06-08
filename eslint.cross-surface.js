// PR-31 phase 2 — cross-surface flat-config blocks extracted from the root
// `eslint.config.js`. These blocks deliberately span 2+ surfaces (e.g.
// server+web, web+mobile, server+openclaw) so they cannot live in a single
// per-surface module; they stay grouped here and are composed back via
// `...crossSurfaceBlocks`. Relative order preserved from the original root
// array; `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`).
import globals from "globals";
import security from "eslint-plugin-security";

export const crossSurfaceBlocks = [
  // Import-extension hygiene — bans `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs`
  // suffixes in import specifiers for the bundler-fed frontend apps. Codemod
  // #3 stripped 436 historical extension-suffixed imports in `apps/web/src`
  // (see `docs/90-work/tech-debt/frontend.md` §"Уже закрито"); without an enforcing
  // rule, new code silently re-introduces the suffix and the
  // `tsc --moduleResolution bundler` / `vite` / `vitest` triple disagrees
  // about resolution again.
  //
  // Scope is intentionally limited to the four bundler-fed apps. The server
  // (`apps/server`) is built by esbuild for Node ESM where the `.js`
  // extension on relative imports is the canonical NodeNext-style pattern;
  // the workspace packages (`packages/*/src`) are consumed by both Node and
  // Vite via their `./src/*.ts` exports map and use the same NodeNext-style
  // `.js` imports today. Migrating those is out of scope of the rule's
  // original codemod.
  //
  // `ignorePackages` keeps node-builtin / npm-package specifiers free; non-
  // code asset extensions (`.css`, `.svg`, `.png`, `.json`, …) keep their
  // suffix as before.
  {
    files: [
      "apps/web/src/**/*.{ts,tsx,js,jsx}",
      "tools/openclaw/src/**/*.{ts,tsx,js,jsx}",
      "apps/mobile/src/**/*.{ts,tsx,js,jsx}",
      "apps/mobile/app/**/*.{ts,tsx,js,jsx}",
      "apps/mobile-shell/src/**/*.{ts,tsx,js,jsx}",
    ],
    rules: {
      "import/extensions": ["error", "never"],
    },
  },
  // DS primitives that legitimately define the eyebrow treatment.
  // SectionHeading owns the uppercase+tracking+text size tokens, Label
  // owns the field-label eyebrow variant, and chartTheme defines the
  // tooltip label token — all three are the single source-of-truth
  // callers should import from. Mobile mirrors the same primitive at
  // `apps/mobile/src/components/ui/SectionHeading.tsx`; treat both
  // platforms' source-of-truth files identically.
  {
    files: [
      "apps/web/src/shared/components/ui/SectionHeading.tsx",
      "apps/web/src/shared/components/ui/FormField.tsx",
      "apps/web/src/shared/charts/chartTheme.ts",
      "apps/mobile/src/components/ui/SectionHeading.tsx",
    ],
    rules: {
      "sergeant-design/no-eyebrow-drift": "off",
    },
  },
  // Jest setup / test files need jest globals.
  {
    files: [
      "**/jest.setup.js",
      "**/jest.setup.ts",
      "**/*.test.{js,jsx,ts,tsx}",
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
    ],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
  },
  // Monobank PAT client-storage guardrail — Stage 0 / PR #002 from
  // `docs/90-work/planning/storage-roadmap.md`. The PAT lives only on the
  // server (`mono_connection.token_ciphertext`); persisting it
  // anywhere on the client (LS / sessionStorage / MMKV / IDB / cloud-sync
  // `module_data`) is a security regression. Reads (the migration
  // hook `useMonoTokenMigration`) and removals (`removeItem`,
  // `safeRemoveLS`) are intentionally NOT flagged. Test files are
  // exempt — fixtures need to seed/inspect the legacy LS entries.
  {
    files: [
      "apps/web/src/**/*.{js,jsx,ts,tsx}",
      "apps/mobile/src/**/*.{js,jsx,ts,tsx}",
      "apps/server/src/**/*.{js,ts}",
    ],
    ignores: [
      "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/*.spec.{ts,tsx}",
      "apps/mobile/src/**/*.test.{js,jsx,ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-finyk-token-in-storage": "error",
    },
  },
  // SAST guardrail — `eslint-plugin-security` taint-flow heuristics on
  // production server + console code. Closes the M11 audit gap from
  // `docs/04-governance/security/hardening/M11-eslint-plugin-security.md`: SQL
  // parameterisation and table-name allowlists are correct today, but
  // nothing in lint forbids the next regression. The three rules below
  // catch the highest-signal patterns the audit asked for; the
  // companion `no-restricted-syntax` block forbids templated
  // `pool.query(`…${…}…`)` literals so a future contributor cannot
  // smuggle interpolated SQL through.
  //
  // Scoped to production code only — tests legitimately interpolate
  // user-controlled fixtures into FS / RegExp helpers and the audit
  // verification ("baseline run produces no new errors on the existing
  // codebase") expects no warnings on the existing call-sites. Mobile
  // and web bundles do not touch `fs` / `eval`; web XSS is governed
  // by the existing CSP card (C2).
  {
    files: ["apps/server/src/**/*.{js,ts}", "tools/openclaw/src/**/*.{js,ts}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/*.integration.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
      "apps/server/src/test/**",
      "tools/openclaw/src/**/*.test.{js,ts}",
      "tools/openclaw/src/**/__tests__/**",
    ],
    plugins: { security },
    rules: {
      // `eval(<expression>)` is unrecoverable XSS / RCE surface and the
      // existing codebase has zero call-sites — promote to error so
      // any new occurrence blocks CI immediately.
      "security/detect-eval-with-expression": "error",
      // The other two rules fire on a long tail of intentional dynamic
      // patterns in the existing codebase (typed `distPath` arguments,
      // user-id-keyed backup file paths, the openclaw doc-search
      // helpers, the CORS allowlist regex). Per
      // `docs/04-governance/security/hardening/M11-eslint-plugin-security.md`
      // verification ("baseline run produces no new errors on the
      // existing codebase") the rules ship at "warn" — review-time
      // signal in CI lint output without blocking on the audited
      // baseline. Promote to "error" once the baseline is migrated;
      // see `docs/04-governance/security/audit-exceptions.md` for the inventory.
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-non-literal-regexp": "warn",
      // Custom hard-rule companion to the SAST plugin: forbid templated
      // `pool.query(`…${…}…`)` calls. The pg driver supports `$1, $2`
      // placeholders and the audited modules use them consistently;
      // the next templated literal is a SQL-injection regression. Test
      // files are excluded above so existing fixtures (e.g. the
      // ai-memory vector-store integration test) keep working.
      //
      // Selector: `pool.query(…)` / bare `query(…)` whose first
      // argument is a `TemplateLiteral` with at least one
      // `${expression}` placeholder (`expressions.length > 0`). A
      // multi-line template **without** interpolation is just a
      // static SQL literal and remains allowed.
      //
      // Level is "warn" for the same baseline reason as above —
      // existing intentional templated queries (e.g. `SET LOCAL
      // hnsw.ef_search = ${Math.floor(efSearch)}`, dynamic
      // `WHERE ${conditions.join(" AND ")}` over an allowlisted
      // column set) ship today. New regressions surface in PR lint
      // output. The plugin test under
      // `packages/eslint-plugin-sergeant-design/__tests__/eslint-security-rules.test.mjs`
      // asserts the rule fires programmatically so it cannot silently
      // be unwired.
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "CallExpression[callee.property.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
          message:
            "Templated `pool.query(`…${…}…`)` is risky — use parameterised `pool.query('… $1 …', [value])` instead. See docs/04-governance/security/hardening/M11-eslint-plugin-security.md.",
        },
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
          message:
            "Templated `query(`…${…}…`)` is risky — use parameterised `query('… $1 …', [value])` instead. See docs/04-governance/security/hardening/M11-eslint-plugin-security.md.",
        },
      ],
    },
  },
  // Anthropic key logging guardrail — prevents accidental logging of
  // `process.env.ANTHROPIC_API_KEY` or secret-like identifiers via
  // console.* / logger.* / pino.* / log.*. See AGENTS.md security rules.
  // Scoped to both server (where the key lives) and web (defense in depth).
  {
    files: ["apps/server/src/**/*.{js,ts}", "apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-anthropic-key-in-logs": "error",
    },
  },
  // PII-in-console guardrail (audit S2,
  // `docs/90-work/audits/2026-05-13-security-observability-roast.md`). Forbids
  // `console.{log,error,warn,info}` with a string / template literal
  // matching `/email|phone|password|token|secret|auth/i` or an object
  // literal whose (nested) keys match the same regex. Sentry's `console`
  // integration, DevTools screen-share, and PostHog session-replay
  // extensions all consume `console.*`, so PII leaks here propagate
  // beyond the dev machine. Scoped to server + web production code
  // (mirrors `no-anthropic-key-in-logs`); test files are exempt.
  {
    files: ["apps/server/src/**/*.{js,ts}", "apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-console-pii": "error",
    },
  },
  // Type-safety bypass guardrail — PR-6.E: forbid new `@ts-expect-error`,
  // `@ts-ignore`, `as any`, and `as unknown as X` in production code.
  // These patterns erode type safety and make refactoring dangerous.
  // Test files are exempt (they legitimately need type-level tricks).
  //
  // Allowlist below now contains only test-file globs — every initial
  // production call-site listed at rule introduction (see
  // `docs/90-work/tech-debt/frontend.md` §no-strict-bypass) has been migrated.
  // The rule is fully enforced in production: any new bypass on
  // `apps/server/src/**` or `apps/web/src/**` will fail CI.
  {
    files: ["apps/server/src/**/*.{js,ts}", "apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      // Tests can use type bypasses freely as fixtures.
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/test/**",
      "apps/web/src/**/*.spec.{ts,tsx}",
    ],
    rules: {
      "sergeant-design/no-strict-bypass": "error",
    },
  },
  // Routine cloud-sync retirement guard (PR #026, storage-roadmap Stage 4).
  // `STORAGE_KEYS.ROUTINE` was the single LS key that held the entire
  // routine blob pushed to `module_data.routine` via cloud sync.  Now that
  // completions are read from SQLite and the module has been removed from
  // `SYNC_MODULES`, new code must NOT read/write that key directly —
  // use `loadRoutineState()` / `saveRoutineState()` from
  // `apps/web/src/modules/routine/lib/routineStorage.ts` instead (they
  // handle the SQLite overlay transparently).
  //
  // The selector matches the exact property access `STORAGE_KEYS.ROUTINE`
  // but NOT `STORAGE_KEYS.ROUTINE_MAIN_TAB` or `STORAGE_KEYS.ROUTINE_QUICK_STATS`.
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/mobile/src/**/*.{ts,tsx}"],
    ignores: [
      // Tests can reference the key freely as fixtures.
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      // The routine module storage wrappers — they are the canonical
      // read/write entry-points that everyone else should call.
      "apps/web/src/modules/routine/lib/routineStorage.ts",
      "apps/mobile/src/modules/routine/lib/routineStore.ts",
      // Stage 8 PR #057r-tombstone — the residual-import helper +
      // shared `routineStorage` instance are the only callsites
      // allowed to touch the now-deprecated `hub_routine_v1` LS key.
      // The helper drains the leftover LS payload into SQLite once
      // on boot and then deletes the key.
      "apps/web/src/modules/routine/lib/residualImport.ts",
      "apps/web/src/modules/routine/lib/routineStorageInstance.ts",
      // Stage 8 PR #057r-tombstone-mobile — mobile mirror of the
      // residual-import helper. Drains the leftover `hub_routine_v1`
      // MMKV payload into SQLite via the dual-write pipeline (with a
      // stale LWW timestamp) and then deletes the MMKV key.
      "apps/mobile/src/modules/routine/lib/residualImport.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        // Inherit the legacy palette selectors from the top-level block so
        // this scoped override doesn't accidentally drop them.
        {
          selector:
            "Literal[value=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
        {
          selector:
            "TemplateElement[value.raw=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
        // PR #026 — routine cloud-sync retirement.
        {
          selector:
            "MemberExpression[object.name='STORAGE_KEYS'][property.name='ROUTINE']",
          message:
            "Direct access to STORAGE_KEYS.ROUTINE is retired (PR #026, storage-roadmap). Use loadRoutineState() / saveRoutineState() from the routine module instead — they handle the SQLite overlay transparently.",
        },
      ],
    },
  },
  // Fizruk cloud-sync retirement guard (PR #030, storage-roadmap Stage 4).
  // The eleven `STORAGE_KEYS.FIZRUK_{WORKOUTS, CUSTOM_EXERCISES,
  // MEASUREMENTS, TEMPLATES, SELECTED_TEMPLATE, ACTIVE_WORKOUT,
  // ACTIVE_PROGRAM, PLAN_TEMPLATE, MONTHLY_PLAN, WELLBEING, DAILY_LOG}`
  // keys backed the legacy `module_data.fizruk` blob that cloud-sync
  // pushed/pulled. Those rows are retired now that PR #027 (schema),
  // PR #028 (dual-write), PR #029 (web reads) and PR #029a (mobile
  // reads) ship the per-table `fizruk_*` SQLite mirror plus op-log
  // sync. New code outside the canonical fizruk module wrappers must
  // not reach for these keys directly — read from SQLite via the
  // module's hooks (`useFizrukWorkouts`, `useMeasurements`, …) or the
  // server APIs instead.
  //
  // The selector matches the eleven retired property names but NOT
  // ancillary fizruk LS keys that remain local-only (e.g.
  // `STORAGE_KEYS.FIZRUK_QUICK_STATS`, `FIZRUK_REST_SETTINGS`,
  // `FIZRUK_PROGRAM_PLANS_*`).
  //
  // Nutrition cloud-sync retirement guard (PR #034, storage-roadmap
  // Stage 4) is added in the same block — same shape, same rationale.
  // The five `STORAGE_KEYS.NUTRITION_{LOG, PANTRIES, ACTIVE_PANTRY,
  // PREFS, SAVED_RECIPES}` keys backed the legacy `module_data.
  // nutrition` blob; per-table `nutrition_*` SQLite mirror plus the
  // op-log replace it (PR #031 schema, PR #032 dual-write, PR #033
  // web + mobile reads). The selector matches only those five — NOT
  // ancillary nutrition LS keys that remain local-only (e.g.
  // `STORAGE_KEYS.NUTRITION_QUICK_STATS`, `NUTRITION_PROFILE_*`).
  //
  // Finyk cloud-sync retirement guard (PR #039, storage-roadmap
  // Stage 4) is added in the same block — same shape, same rationale.
  // The nineteen `STORAGE_KEYS.FINYK_{HIDDEN, HIDDEN_TXS, BUDGETS,
  // SUBS, ASSETS, DEBTS, RECV, MONTHLY_PLAN, TX_CATS, TX_SPLITS,
  // MONO_DEBT_LINKED, NETWORTH_HISTORY, CUSTOM_CATS, MANUAL_EXPENSES,
  // TX_FILTERS, SHOW_BALANCE, TX_CACHE, TX_CACHE_LAST_GOOD,
  // INFO_CACHE}` keys backed the legacy `module_data.finyk` blob;
  // per-table `finyk_*` SQLite mirror plus the op-log and the Mono
  // client-side mirror replace it (PR #035 schema, PR #036 dual-write,
  // PR #037 read overlay, PR #038 Mono mirror). FINYK_TOKEN remains
  // separately banned by `no-finyk-token-in-storage` (server-only PAT,
  // PR #002). The selector matches only those nineteen — NOT
  // ancillary finyk LS keys that remain local-only (e.g.
  // `STORAGE_KEYS.FINYK_TX_CACHE_TS`, `FINYK_*` UI prefs).
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/mobile/src/**/*.{ts,tsx}"],
    ignores: [
      // Tests can reference the keys freely as fixtures.
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      // Canonical fizruk module wrappers — the official read/write
      // entry-points everyone else should call.
      "apps/web/src/modules/fizruk/**",
      "apps/mobile/src/modules/fizruk/**",
      // Canonical nutrition module wrappers — the official read/write
      // entry-points everyone else should call.
      "apps/web/src/modules/nutrition/**",
      "apps/mobile/src/modules/nutrition/**",
      // Canonical finyk module wrappers — the official read/write
      // entry-points everyone else should call.
      "apps/web/src/modules/finyk/**",
      "apps/mobile/src/modules/finyk/**",
      // Mobile settings → "Власні категорії витрат" is the canonical
      // user-facing writer for `STORAGE_KEYS.FINYK_CUSTOM_CATS` —
      // the web equivalent lives behind seed/UI hooks that hard-code
      // the raw `finyk_custom_cats_v1` string. The MMKV write goes
      // through `useSyncedStorage` which still calls
      // `enqueueChange(key)`; after PR #039 that call is a no-op for
      // retired keys, but the section still owns the persistence
      // contract for the categories list.
      "apps/mobile/src/core/settings/FinykSection.tsx",
      // Cross-module insights still reads FIZRUK_WORKOUTS,
      // NUTRITION_LOG and finyk LS keys as a best-effort local
      // heuristic (insights do not need cloud-sync round-tripping).
      // Migration to the SQLite reader is tracked in a follow-up
      // under storage-roadmap Stage 5.
      "apps/web/src/core/lib/insightsEngine.ts",
      // Routine calendar's "Finyk subscription events" lane reads
      // `FINYK_SUBS` / `FINYK_TX_CACHE` / `FINYK_TX_CACHE_LAST_GOOD`
      // directly to overlay subscription due-dates and Monobank
      // transactions onto the calendar. The migration to the
      // canonical finyk SQLite reader is tracked in a follow-up
      // under storage-roadmap Stage 5 alongside the insights engine.
      "apps/web/src/modules/routine/lib/finykSubscriptionCalendar.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        // Inherit the legacy palette selectors from the top-level block so
        // this scoped override doesn't accidentally drop them.
        {
          selector:
            "Literal[value=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
        {
          selector:
            "TemplateElement[value.raw=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
        // PR #030 — fizruk cloud-sync retirement.
        {
          selector:
            "MemberExpression[object.name='STORAGE_KEYS'][property.name=/^FIZRUK_(?:WORKOUTS|CUSTOM_EXERCISES|MEASUREMENTS|TEMPLATES|SELECTED_TEMPLATE|ACTIVE_WORKOUT|ACTIVE_PROGRAM|PLAN_TEMPLATE|MONTHLY_PLAN|WELLBEING|DAILY_LOG)$/]",
          message:
            "Direct access to the retired `STORAGE_KEYS.FIZRUK_*` cloud-sync keys is forbidden (PR #030, storage-roadmap). Use the canonical fizruk hooks (`useFizrukWorkouts`, `useMeasurements`, `useWorkoutTemplates`, …) from `apps/{web,mobile}/src/modules/fizruk/hooks` — they handle the SQLite overlay transparently.",
        },
        // PR #034 — nutrition cloud-sync retirement.
        {
          selector:
            "MemberExpression[object.name='STORAGE_KEYS'][property.name=/^NUTRITION_(?:LOG|PANTRIES|ACTIVE_PANTRY|PREFS|SAVED_RECIPES)$/]",
          message:
            "Direct access to the retired `STORAGE_KEYS.NUTRITION_*` cloud-sync keys is forbidden (PR #034, storage-roadmap). Use the canonical nutrition hooks (`useNutritionLog`, `useNutritionPantries`, `useNutritionPrefs`, `useSavedRecipesList`) from `apps/{web,mobile}/src/modules/nutrition/hooks` — they handle the SQLite overlay transparently.",
        },
        // PR #039 — finyk cloud-sync retirement.
        {
          selector:
            "MemberExpression[object.name='STORAGE_KEYS'][property.name=/^FINYK_(?:HIDDEN|HIDDEN_TXS|BUDGETS|SUBS|ASSETS|DEBTS|RECV|MONTHLY_PLAN|TX_CATS|TX_SPLITS|MONO_DEBT_LINKED|NETWORTH_HISTORY|CUSTOM_CATS|MANUAL_EXPENSES|TX_FILTERS|SHOW_BALANCE|TX_CACHE|TX_CACHE_LAST_GOOD|INFO_CACHE)$/]",
          message:
            "Direct access to the retired `STORAGE_KEYS.FINYK_*` cloud-sync keys is forbidden (PR #039, storage-roadmap). Use the canonical finyk module wrappers (`apps/{web,mobile}/src/modules/finyk/hooks/useStorage` and friends) — they handle the SQLite overlay transparently. The Monobank PAT (`FINYK_TOKEN`) remains separately banned by `no-finyk-token-in-storage` (PR #002).",
        },
      ],
    },
  },
  // Theme 5 (consolidated audit 2026-05-13): `no-raw-storage-key` — warn-level
  // gate for raw localStorage key string literals passed to storage helpers.
  // Use `STORAGE_KEYS.<NAME>` from `@sergeant/shared` instead. The rule is
  // `warn` because ~50 existing call-sites remain (chatActions, onboarding,
  // recommendations, weeklyDigest, dailyFinykSummary); they are tracked in
  // the burn-down documented in the audit. Promoted to `error` when the
  // count reaches zero. See docs/90-work/audits/2026-05-13-consolidated-page-audit.md § Theme 5.
  // Files that legitimately use raw key strings (migration helpers, seed/cleanup
  // demo data, the registry itself, searchCache internal cache key) are exempt
  // inside the rule implementation.
  {
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
    ],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/app/**/*.test.{ts,tsx}",
      "apps/mobile/app/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-raw-storage-key": "warn",
    },
  },
  // Theme 2 (consolidated audit 2026-05-13): `no-small-button-touch-target` —
  // warn-level gate for raw `<button>` elements with height/size classes below
  // 44px without a touch-target compensator. WCAG 2.5.5 requires ≥ 44×44px.
  // Use the `Button` primitive (auto-applies `pointer-coarse:min-h-[44px]`) or
  // add `min-h-[44px] min-w-[44px]` manually. The rule is `warn` because some
  // call-sites are data-cell contexts (calendar cells, chart bars) where 44px
  // would break layout. Burn-down: 2026-Q3.
  // See docs/90-work/audits/2026-05-13-consolidated-page-audit.md § Theme 2.
  {
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
    ],
    ignores: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/**/*.stories.{ts,tsx}",
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-small-button-touch-target": "warn",
    },
  },
  // Theme 1 (consolidated audit 2026-05-13) — `new Date()` guard.
  //
  // `new Date()` with zero arguments returns the current instant anchored to
  // the host clock. In domain modules (finyk, fizruk, routine, hub-chat, search)
  // any "today" / "this week" derivation must flow through `getKyivDateParts()`,
  // `getKyivDayKey()`, or `getKyivWeekStart()` from
  // `apps/web/src/shared/lib/time/kyivTime.ts` so day boundaries stay anchored
  // to Europe/Kyiv per the domain-invariants spec (docs/02-engineering/architecture/
  // domain-invariants.md § timezone).
  //
  // `new Date(someValue)` (1+ arguments) is NOT banned — constructing a Date
  // from a known ISO string or timestamp is a UTC-safe operation that does not
  // bake in the host timezone.
  //
  // Severity: `warn` — ramps to `error` once the burn-down sweep in the
  // companion tracker (docs/90-work/audits/2026-05-13-consolidated-page-audit.md
  // § Theme 1) closes. Test files and the canonical `kyivTime.ts` are exempt.
  //
  // New call-sites added in the scoped paths that genuinely need "current
  // UTC instant" (e.g. an `updatedAt: new Date().toISOString()` timestamp
  // record) should add an inline `eslint-disable-next-line` with a WHY
  // comment so the intent is explicit in review.
  //
  // Phase 2b note: this block's `no-restricted-syntax` override is composed
  // LAST (after the cloud-sync retirement blocks above) to match the original
  // monolith's append order — flat-config merges `no-restricted-syntax` by
  // replacement per rule key, so position relative to the retirement blocks
  // is load-bearing for files that match both.
  {
    files: [
      "apps/web/src/modules/finyk/**/*.{ts,tsx}",
      "apps/web/src/modules/fizruk/**/*.{ts,tsx}",
      "apps/web/src/modules/routine/**/*.{ts,tsx}",
      "apps/web/src/core/hub/chat/**/*.{ts,tsx}",
      "apps/web/src/core/hub/search/**/*.{ts,tsx}",
      "apps/web/src/core/app/HubHeader.tsx",
      "apps/web/src/core/settings/PlanSection.tsx",
      "apps/web/src/pages/strategy/StrategyPage.tsx",
    ],
    ignores: [
      // Tests use vi.setSystemTime / explicit Date literals — legitimate.
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
      // The canonical Kyiv-time helper is the single place allowed to call
      // new Date() freely — every other file in the scoped paths must route
      // through its exports.
      "apps/web/src/shared/lib/time/kyivTime.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "Bare `new Date()` is forbidden in domain modules — it returns the " +
            "host-local instant. Use `getKyivDateParts()`, `getKyivDayKey()`, or " +
            "`getKyivWeekStart()` from `@shared/lib/time/kyivTime` so day " +
            "boundaries stay anchored to Europe/Kyiv. If you genuinely need a " +
            "UTC-anchored wall-clock instant (e.g. `updatedAt` timestamp), add " +
            "an `eslint-disable-next-line no-restricted-syntax` with a WHY comment. " +
            "See docs/90-work/audits/2026-05-13-consolidated-page-audit.md § Theme 1.",
        },
        // Inherit the legacy palette selectors from the top-level block so this
        // scoped override doesn't accidentally drop them — flat-config merges
        // rules by replacement per rule key (last matching block wins).
        {
          selector:
            "Literal[value=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
        {
          selector:
            "TemplateElement[value.raw=/\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|caret)-(?:forest(?:-grad)?|accent-\\d+)(?:\\/\\d+)?\\b/]",
          message:
            "Legacy `forest` / tonal `accent-NNN` retired — use semantic `accent`, `brand-500`, `fizruk`, `routine`, `nutrition`, or `finyk` instead.",
        },
      ],
    },
  },
];
