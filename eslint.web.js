// PR-31 phase 2 — web-only flat-config blocks extracted from the root
// `eslint.config.js`. Composed back via `...webBlocks` so
// `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: `apps/web/**`.
//
// The three JSON burndown allowlists live here (not in the root) because
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

// Toast-policy burndown gate (audit 2026-05-13 § 1 P0). Files exempt
// from `sergeant-design/require-toast-error-action` — i.e. legacy
// `toast.error(...)` call-sites without an `action: { label, onClick }`.
// New error-toasts MUST include an action; existing ones are tracked
// here and removed as they are refactored. When the array becomes
// `[]`, promote the rule from "warn" to "error". See
// `docs/ui/toast-policy.md` and audit
// `docs/90-work/audits/2026-05-13-web-frontend-ergonomics-roast.md` § F1.
const toastErrorActionAllowlist = JSON.parse(
  readFileSync(
    new URL(
      "./apps/web/eslint.toast-error-action-allowlist.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

// Bare-fixed-inset-modal burndown gate (audit 2026-05-13 § F2 P1).
// File-path inventory of `fixed inset-0` overlays that are intentional
// dialog surfaces — the 6 canonical primitives (Modal, Sheet,
// ConfirmDialog, InputDialog, KeyboardShortcutsModal, OnboardingWizard)
// plus the other ad-hoc dialogs that already declare `role`/`aria-modal`.
// True offenders (e.g. HubChat, BarcodeScanner) are intentionally left
// OUT so the rule keeps warning on them until partII (file fixes + axe
// prop-tests). Remove entries as they migrate to a canonical primitive.
// See `docs/90-work/audits/2026-05-13-web-frontend-ergonomics-roast.md` § F2.
const bareFixedInsetModalAllowlist = JSON.parse(
  readFileSync(
    new URL(
      "./apps/web/eslint.bare-fixed-inset-modal-allowlist.json",
      import.meta.url,
    ),
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
      "sergeant-design/no-raw-dark-palette": "error",
      // `prefer-focus-visible` (Wave 2e of the dark-mode audit's
      // accessibility companion track — see `docs/design/design-system.md`
      // → "Focus — focus-visible:ring-…, а не focus:, аби pointer-клік
      // не блимав кільцем"). The rule bans `focus:` colour/border/ring/
      // shadow utilities; only `focus:outline-none` (the canonical reset
      // that pairs with `focus-visible:ring-*`) is allowed. Web-only —
      // React Native (NativeWind) doesn't expose a `:focus-visible`
      // pseudo-class equivalent.
      "sergeant-design/prefer-focus-visible": "error",
      // `no-rounded-lg` — prevent border-radius drift back to the 8 px tier.
      // Severity promoted to `error` 2026-05-21. Audit showed zero un-disabled
      // call-sites in `apps/web/src/{core,modules,shared}/**` (one explicit
      // `eslint-disable-next-line` with tech-debt ref in `SearchResults.tsx:104`).
      // `rounded-lg` sits between Marker (6 px) and Control (12 px) without a
      // semantic role; use `rounded-md` or `rounded-xl` instead.
      // See docs/design/radius-rhythm.md.
      "sergeant-design/no-rounded-lg": "error",
      // `no-v1-gradient` — Sergeant v2 redesign (2026-05) replaced v1 module
      // gradient vars (`--gradient-{module}`, `--gradient-card-{module}-dark`)
      // and their `bg-card-{module}-dark` Tailwind utilities with the
      // brighter `--hero-grad-{module}` set + `bg-hero-grad-{module}`. The
      // v1 vars are JSDoc-@deprecated in theme.css but kept for migration
      // back-compat. Severity `error` — recon shows zero current consumers,
      // so this is a tripwire for accidental v1 re-introduction.
      // See docs/design/redesign-v2-migration.md.
      "sergeant-design/no-v1-gradient": "error",
      // `no-bare-empty-text` — enforce empty-state tier discipline.
      // Bare JSX text with Ukrainian "Поки немає" / "ще немає" phrases must
      // use <EmptyState> / <ModuleEmptyState> — see docs/design/empty-states.md.
      //
      // Promoted to `error` 2026-05-22 (audit-2026-05-15 closure): baseline
      // cleanup complete. Remaining call-sites either live inside an
      // <EmptyState>/<ModuleEmptyState> ancestor (rule auto-exempts) or
      // carry a targeted `eslint-disable-next-line` with a WHY for the
      // narrow tier-3/hero-shell exceptions documented per call-site.
      "sergeant-design/no-bare-empty-text": "error",
      // `no-cyrillic-jsx-literal` — i18n burndown gate (item #18 Phase 3).
      // New cyrillic JSX text or attribute string literals must reference
      // `messages.<group>.<key>` from `apps/web/src/shared/i18n/uk.ts`.
      // Existing call-sites live in `apps/web/eslint.i18n-allowlist.json`
      // (loaded at config-import time above). Migrate strings → catalog
      // → remove path from JSON. When the file becomes `[]`, promote to
      // "error". See docs/i18n/readiness.md § Burndown.
      "sergeant-design/no-cyrillic-jsx-literal": [
        "warn",
        { allowlist: i18nAllowlist },
      ],
      // `prefer-text-style` — semantic typography over hand-rolled combos.
      // Replace (text-sm font-medium) with text-style-label etc.
      // See docs/design/design-system.md § Typography.
      //
      // Severity flow: global `warn` here (covers `apps/web/src/{core,shared}/**`,
      // packages, tools) → scoped `error` for `apps/web/src/modules/**` below
      // (ramped 2026-05-21 in #3070 after T5 baseline cleanup landed).
      "sergeant-design/prefer-text-style": "warn",
      // `no-arbitrary-text-size` — ban Tailwind arbitrary `text-[Npx]` /
      // `text-[Nrem]` literals; route every call-site through a named
      // utility from index.css (`text-display`, `text-h1..h3`,
      // `text-body`, `text-body-sm`, `text-caption`, `text-eyebrow`,
      // `text-meta`, `text-micro`, `text-display-stat`,
      // `text-display-hero`, `text-style-*`) or a Tailwind preset
      // (`text-xs..text-5xl`). Closes the vertical-rhythm drift +
      // sub-WCAG 8 px regression family.
      // See docs/design/design-system.md § Typography.
      "sergeant-design/no-arbitrary-text-size": "error",
      // `no-flat-shared-lib` — guard the 2026-05-03 reorg
      // (PR #1479): `apps/web/src/shared/lib/` is now organized into
      // five thematic subdirs (`api/`, `storage/`, `modules/`,
      // `adapters/`, `ui/`). New top-level flat files would re-flatten
      // the namespace and erase the grouping. The rule resolves both
      // `@shared/lib/<x>` (alias) and relative imports, so it survives
      // future import-style refactors. Place new utils in the right
      // subdir, or import via the `@shared/lib` barrel.
      "sergeant-design/no-flat-shared-lib": "error",
      // `prefer-kyiv-time` — Theme 1 (consolidated audit 2026-05-13).
      // Bans `Date.prototype.get{FullYear,Month,Date,Day,Hours,Minutes,Seconds}`
      // in web client code; use helpers in `@shared/lib/time/kyivTime.ts`
      // so day boundaries stay anchored to Europe/Kyiv per the domain-
      // invariants spec. Allowlisted: `kyivTime.ts` itself, `apps/server/**`,
      // and `*.test.{ts,tsx,js}` (mock-clock tests). Severity `warn`
      // initially; ramps to `error` after the burndown sweep closes.
      // See docs/04-governance/governance/rules/kyiv-time-helpers.md.
      "sergeant-design/prefer-kyiv-time": "warn",
      // `require-toast-error-action` — audit 2026-05-13 § F1 (P0):
      // every error-toast must include an `action: { label, onClick }`
      // so the user has a recovery path. Bare `toast.error("...")`
      // calls are tracked in `apps/web/eslint.toast-error-action-allowlist.json`
      // and removed as they are refactored. When the file becomes `[]`,
      // promote this rule from "warn" to "error".
      // See `docs/ui/toast-policy.md`.
      "sergeant-design/require-toast-error-action": [
        "warn",
        { allowlist: toastErrorActionAllowlist },
      ],
      // `no-bare-fixed-inset-modal` — audit 2026-05-13 § F2 (P1):
      // JSX elements that wear `fixed inset-0` overlay classNames but
      // forget to announce themselves as dialog/presentation for
      // assistive tech are flagged as warnings. Canonical modal
      // primitives (Modal, Sheet, ConfirmDialog, InputDialog,
      // KeyboardShortcutsModal, OnboardingWizard) own focus-trap +
      // scroll-lock + a11y plumbing — they're opted out via the
      // inline `allow` list. Existing offenders (QuickActionsMenu,
      // StreakCelebration, FeatureSpotlight, …) stay as warnings
      // until partII (file fixes + axe prop-tests). See
      // docs/90-work/audits/2026-05-13-web-frontend-ergonomics-roast.md § F2.
      "sergeant-design/no-bare-fixed-inset-modal": [
        "warn",
        { allow: bareFixedInsetModalAllowlist },
      ],
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
  // `docs/90-work/initiatives/0006-frontend-routing-and-code-split.md` §Phase 2.
  {
    files: ["apps/web/src/modules/**/*.{ts,tsx}"],
    rules: {
      "sergeant-design/no-hash-router-in-modules": "error",
    },
  },
  // Storybook coverage enforcement — initiative 0007 (Design-system
  // tooling: Storybook + visual regression). Кожен top-level
  // UI-компонент у `apps/web/src/shared/components/ui/` має сусідній
  // `<Name>.stories.tsx`, інакше Storybook playground і visual
  // regression baseline не покривають компонент.
  //
  // Round-10 (2026-05-05) закрив Phase 2: shared/ui coverage піднято
  // з 35% до 100% non-allowlisted (37 stories на 37 компонентів-
  // кандидатів — див. § Outcome у
  // `docs/90-work/initiatives/archive/_0007-design-system-tooling.md`). Решта 23
  // файли — barrel / Icon.paths sub-modules / utility / gesture /
  // transient overlay-компоненти — навмисно allowlisted у самому
  // правилі (`packages/eslint-plugin-sergeant-design/index.js` §
  // require-stories-for-ui-components, секція `DEFAULT_REQUIRE_STORIES_
  // ALLOWLIST`) із per-file rationale.
  //
  // Severity: **error**. Коли додаєш новий публічний компонент у
  // `apps/web/src/shared/components/ui/`, додай поряд `<Name>.stories.tsx`
  // (мінімум — Default story). Якщо файл навмисно НЕ компонент
  // (helper / illustration / sub-module / gesture-обгортка / transient
  // overlay), додай шлях у `DEFAULT_REQUIRE_STORIES_ALLOWLIST` із
  // коментарем-обґрунтуванням у тому ж commit-і.
  {
    files: ["apps/web/src/shared/components/ui/**/*.tsx"],
    rules: {
      "sergeant-design/require-stories-for-ui-components": "error",
    },
  },
  // DataState adoption canary — initiative 0011 Phase 2.9 (foundation
  // adoption — DataState rollout). Phases 2.4–2.8 мігрували існуючі
  // manual-ladder callsite-и у `apps/web/src/modules/**` на
  // `<DataState>` (finyk Mono / fizruk Workouts / nutrition Menu /
  // routine Timeline / digest). Canary був warn-only від merge PR-#1823
  // (2026-05-05) — за baseline-вікно 0 hits across 174 модульних
  // файлів (success-criterion з
  // `docs/90-work/initiatives/0011-foundation-adoption-and-process-discipline.md`
  // § 6 — `<DataState>` adopted; carry-over `2026-06-30` Phase 2.9 finalize
  // закрита 2026-05-10). Severity promoted до `error` — нові manual-ladder
  // callsite-и блокуються у CI. Default allowlist (DataState.tsx сама +
  // `apps/web/src/core/auth/**` для auth-form patterns) живе у самому
  // правилі (`packages/eslint-plugin-sergeant-design/index.js`
  // § prefer-data-state).
  {
    files: ["apps/web/src/modules/**/*.{ts,tsx}"],
    rules: {
      "sergeant-design/prefer-data-state": "error",
      // T5 ramp completed 2026-05-21 in #3070 (101 violations migrated across
      // 65 files; 1 eslint-disable escape with TODO(T5) for responsive
      // sm:text-sm in PushupsWidget.tsx). Severity promoted to `error` here
      // so any new module call-site that hand-rolls `text-{size} font-{weight}`
      // fails CI. Other surfaces (`apps/web/src/{core,shared}/**`, packages,
      // tools) still inherit the global `warn` from above.
      "sergeant-design/prefer-text-style": "error",
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
  // react-hooks v7 burndown (initiative 0021) — `purity`, `refs`, and
  // `set-state-in-effect` cleared apps/web (0 violations measured
  // 2026-07-10 via `npx eslint apps/web/src --rule '{"react-hooks/<rule>":"error"}'
  // --no-inline-config`). Promoted from baseline `off` to web-scoped `error`.
  // Mobile still carries legacy violations — stays `off` in baseline.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/purity": "error",
    },
  },
];
