import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import sergeantDesign from "./packages/eslint-plugin-sergeant-design/index.js";

const tsRecommendedScoped = tseslint.configs.recommended.map((cfg) => ({
  ...cfg,
  files: ["**/*.{ts,tsx}"],
}));

export default [
  {
    ignores: [
      "dist/**",
      "**/dist/**",
      "dist-server/**",
      "**/dist-server/**",
      "**/node_modules/**",
      "node_modules/**",
      ".agents/**",
      "artifacts/**",
      "mcps/**",
      "playwright-report/**",
      "**/playwright-report/**",
      "test-results/**",
      "**/test-results/**",
      ".turbo/**",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
  ...tsRecommendedScoped,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      "react-hooks": reactHooks,
      "sergeant-design": sergeantDesign,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Design-system guardrail — the canonical eyebrow label must go
      // through <SectionHeading> (or <Label>) so tone/size changes stay
      // in one place. Add the file-scoped override below for the DS
      // primitives themselves.
      "sergeant-design/no-eyebrow-drift": "error",
      // Typography guardrail — user-facing strings must use the single
      // ellipsis glyph `…` (U+2026), not three ASCII dots `...`. The
      // typographic glyph kerns correctly and is what Web Interface
      // Guidelines recommend for truncation cues. Auto-fixable.
      "sergeant-design/no-ellipsis-dots": "error",
      // AI code-marker syntax guardrail — catches malformed AI markers
      // like `AI-NOTES`, `AINOTE`, `AI_NOTE`, or missing colons. Set to
      // "warn" initially so it doesn't block CI; promote to "error" once
      // the codebase is clean.
      "sergeant-design/ai-marker-syntax": "warn",
      // Tailwind opacity guardrail — `<color>/<N>` only renders when N
      // is in `theme.opacity`. Sergeant's preset registers 0/5/8/10/…/100
      // (see `packages/design-tokens/tailwind-preset.js`); any other
      // step (e.g. `/7`, `/12`, `/18`) is silently dropped and the
      // surrounding `dark:` / `hover:` override falls through to the
      // light-mode background — this is what bug #814 was.
      "sergeant-design/valid-tailwind-opacity": "error",
      // Design-system token guardrail — arbitrary hex in className
      // (`bg-[#10b981]`, `text-[#fff]/50`) bypasses the token layer:
      // dark-mode adaptation, WCAG-AA `-strong` promotion and future
      // palette migration all stop working for those literals. Every
      // color must come from the preset (`bg-surface`, `text-muted`,
      // `bg-finyk-surface`, `text-brand-strong`, `bg-success-soft`, …)
      // — if a genuinely new shade is needed, add it to
      // `packages/design-tokens/tailwind-preset.js` first.
      "sergeant-design/no-hex-in-classname": "error",
      // Module-accent containment — inside `apps/<app>/src/modules/<X>/`
      // subtrees only `<X>`'s accent utilities may appear. A fizruk
      // component rendering a coral `ring-routine` reads to the user
      // as "Рутина" — it's a design bug, not stylistic preference.
      // Cross-module shells (`core/`, `shared/`, `stories/`) remain
      // free to reference all four module accents.
      "sergeant-design/no-foreign-module-accent": "error",
      // WCAG-AA `-strong` tier guardrail — every saturated brand `bg-*`
      // utility paired with `text-white` regresses to ~2.4–2.8 : 1
      // contrast (the bug class fixed in PRs #854 / #855). The fix is
      // `bg-{family}-strong text-white`. See docs/design/BRANDBOOK.md →
      // "WCAG-AA `-strong` Tier" for the full mapping. Promoted from
      // "warn" to "error" once the cleanup PR migrated the last 28
      // call-sites — the codebase is now clean against this rule, and
      // any new violation must be intentional.
      "sergeant-design/no-low-contrast-text-on-fill": "error",
      // `sergeant-design/no-raw-dark-palette` is intentionally NOT
      // registered in this top-level rule block — the rule depends on
      // the `--c-{family}-soft*` / `--c-{family}-strong*` CSS variable
      // theme system that lives in `apps/web/src/index.css`. NativeWind
      // (`apps/mobile`) does not consume those CSS variables, and the
      // server / scripts have no Tailwind classNames. The rule is
      // registered scoped to `apps/web/**/*.{ts,tsx}` further down so
      // it only fires where the semantic-token replacement actually
      // resolves to the intended colour.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/prop-types": "off",
      // Prevent reintroduction of the legacy `forest` palette retired when
      // Sergeant migrated to the Emerald/Teal/Coral/Lime palette. The old
      // `accent-*` tonal palette was also retired, but `accent` has since
      // been re-introduced as a semantic alias for the brand accent colour
      // (see tailwind.config.js colors.accent → rgb(var(--c-accent))). The
      // rule therefore forbids `*-forest*` and `*-accent-<number>` (tonal
      // variants) but allows the new semantic `*-accent` / `*-accent/<N>`.
      "no-restricted-syntax": [
        "error",
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
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
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
  // docs/design/DARK-MODE-AUDIT.md) — every existing pair has
  // been migrated, so any new violation is intentional and must
  // be opted out with an `eslint-disable-next-line` + comment.
  //
  // Web-only: the semantic replacements (`bg-{family}-soft`, etc.)
  // resolve through `--c-{family}-soft*` CSS variables defined in
  // `apps/web/src/index.css`. NativeWind (apps/mobile) renders
  // classNames into RN inline styles and does NOT consume those
  // CSS variables, so applying the rule there would force authors
  // toward tokens that resolve to `rgb(undefined)` on mobile.
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
      // `rounded-lg` sits between Marker (6 px) and Control (12 px) without a
      // semantic role; use `rounded-md` or `rounded-xl` instead.
      // See docs/design/RADIUS-RHYTHM.md.
      "sergeant-design/no-rounded-lg": "warn",
      // `no-bare-empty-text` — enforce empty-state tier discipline.
      // Bare JSX text with Ukrainian "Поки немає" / "ще немає" phrases must
      // use <EmptyState> / <ModuleEmptyState> — see docs/design/EMPTY-STATES.md.
      "sergeant-design/no-bare-empty-text": "warn",
      // `prefer-text-style` — semantic typography over hand-rolled combos.
      // Replace (text-sm font-medium) with text-style-label etc.
      // See docs/design/design-system.md § Typography.
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
    },
  },
  // DS primitives that legitimately define the eyebrow treatment.
  // SectionHeading owns the uppercase+tracking+text size tokens, Label
  // owns the field-label eyebrow variant, and chartTheme defines the
  // tooltip label token — all three are the single source-of-truth
  // callers should import from.
  {
    files: [
      "apps/web/src/shared/components/ui/SectionHeading.tsx",
      "apps/web/src/shared/components/ui/FormField.tsx",
      "apps/web/src/shared/charts/chartTheme.ts",
    ],
    rules: {
      "sergeant-design/no-eyebrow-drift": "off",
    },
  },
  // The plugin that defines `no-ellipsis-dots` contains `...` in its
  // own error message + docs — it would be tautological to lint
  // itself.
  {
    files: ["packages/eslint-plugin-sergeant-design/**/*.js"],
    rules: {
      "sergeant-design/no-ellipsis-dots": "off",
    },
  },
  // The plugin's own __tests__ feed offending Tailwind opacity strings
  // (`bg-finyk/7`, `text-danger/18`, …) into the linter as fixtures — the
  // rule would otherwise self-flag every fixture. The same applies to
  // `no-low-contrast-text-on-fill`, whose test fixtures contain the
  // very `bg-brand text-white` patterns the rule is meant to flag, and
  // to `no-hex-in-classname` / `no-foreign-module-accent`, whose
  // fixtures are `bg-[#10b981]` / `ring-routine` literals.
  {
    files: ["packages/eslint-plugin-sergeant-design/**/*.{js,mjs}"],
    rules: {
      "sergeant-design/valid-tailwind-opacity": "off",
      "sergeant-design/no-low-contrast-text-on-fill": "off",
      "sergeant-design/no-hex-in-classname": "off",
      "sergeant-design/no-foreign-module-accent": "off",
      "sergeant-design/no-raw-dark-palette": "off",
      "sergeant-design/prefer-focus-visible": "off",
      "sergeant-design/no-rounded-lg": "off",
      "sergeant-design/no-bare-empty-text": "off",
      "sergeant-design/prefer-text-style": "off",
      "sergeant-design/no-arbitrary-text-size": "off",
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
  // Mobile cloud-sync guardrail — `useLocalStorage` must not be called
  // with a key tracked in `apps/mobile/src/sync/config.ts → SYNC_MODULES`,
  // because MMKV writes bypass JS and would silently break cloud sync.
  // The fix is to call `useSyncedStorage` from `@/sync/useSyncedStorage`
  // instead, which mirrors the write into the sync queue.
  {
    files: ["apps/mobile/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      "apps/mobile/src/sync/useSyncedStorage.ts",
      "apps/mobile/**/__tests__/**",
      "apps/mobile/**/*.test.{js,jsx,ts,tsx}",
    ],
    rules: {
      "sergeant-design/no-raw-tracked-storage": "error",
    },
  },
  // Web localStorage guardrail — direct `localStorage.*` access is a
  // hazard (throws on quota / private-browsing / corrupt JSON). The
  // shared `safeReadLS` / `safeWriteLS` helpers in
  // `apps/web/src/shared/lib/storage.ts`, the `useLocalStorageState`
  // hook, and `createModuleStorage` wrap the API with try/catch and
  // quota fallbacks. New web code MUST go through one of those.
  //
  // The `ignores` list below names every existing call-site as of the
  // rule's introduction (see `docs/tech-debt/frontend.md` §2). Migrate
  // a file → drop it from the list. Test files are exempt entirely:
  // they routinely seed/inspect raw `localStorage` as fixtures and are
  // already isolated from production hazards.
  {
    files: ["apps/web/src/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      // Tests can use `localStorage` freely as fixtures.
      "apps/web/src/**/*.test.{js,jsx,ts,tsx}",
      "apps/web/src/**/__tests__/**",
      // Storage primitives — these are the wrappers everyone else
      // should call into.
      "apps/web/src/shared/lib/storage.ts",
      "apps/web/src/shared/lib/storageManager.ts",
      "apps/web/src/shared/lib/storageQuota.ts",
      "apps/web/src/shared/lib/typedStore.ts",
      "apps/web/src/shared/lib/createModuleStorage.ts",
      "apps/web/src/shared/lib/weeklyDigestStorage.ts",
      "apps/web/src/shared/lib/perf.ts",
      "apps/web/src/shared/hooks/useLocalStorageState.ts",
      "apps/web/src/shared/hooks/useDarkMode.ts",
      "apps/web/src/shared/hooks/usePushNotifications.ts",
      "apps/web/src/shared/hooks/useActiveFizrukWorkout.ts",
      // Cloud-sync internals — the queue / patcher / state writer all
      // need direct access; users should call the cloud-sync API.
      "apps/web/src/core/cloudSync/logger.ts",
      "apps/web/src/core/cloudSync/queue/offlineQueue.ts",
      "apps/web/src/core/cloudSync/state/moduleData.ts",
      "apps/web/src/core/cloudSync/storagePatch.ts",
      // Module storage wrappers (legitimate primitives in their own
      // namespace).
      "apps/web/src/modules/finyk/hooks/useStorage.ts",
      "apps/web/src/modules/finyk/lib/storageManager.ts",
      "apps/web/src/modules/nutrition/domain/nutritionBackup.ts",
      // Files that haven't been migrated yet — TODO: convert each to
      // `safeReadLS` / `useLocalStorageState` / `createModuleStorage`
      // and remove the entry below.
      "apps/web/src/core/insights/AssistantAdviceCard.tsx",
      "apps/web/src/core/insights/TodayFocusCard.tsx",
      "apps/web/src/core/observability/analytics.ts",

      "apps/web/src/core/hints/HintsOrchestrator.tsx",
      // HubSearch was split into apps/web/src/core/hub/search/* — the
      // localStorage parsers (`safeParseLS` + the Fizruk parsers) live
      // in `searchCache.ts` and are called from `searchSources.ts`.
      // Both inherit the original ignore until the migration to
      // `safeReadLS` lands.
      "apps/web/src/core/hub/search/searchCache.ts",
      "apps/web/src/core/hub/search/searchSources.ts",

      "apps/web/src/core/hub/hubBackup.ts",
      "apps/web/src/core/hub/hubSearchEngine.ts",
      "apps/web/src/core/onboarding/presetApply.ts",
      "apps/web/src/core/insights/useWeeklyDigest.ts",
      // useWorkouts.ts: intentional direct-storage access — dispatches
      // FIZRUK_WORKOUTS_STORAGE_ERROR custom event on quota failure so the
      // UI can show a banner. safeWriteLS swallows the error silently.
      "apps/web/src/modules/fizruk/hooks/useWorkouts.ts",
    ],
    rules: {
      "sergeant-design/no-raw-local-storage": "error",
    },
  },
  // Mobile localStorage guardrail — same rule, applied to `apps/mobile/src`
  // and `apps/mobile/app` so the RN/Expo codebase stays MMKV-only.
  // Mobile uses `react-native-mmkv` via `apps/mobile/src/lib/storage.ts`
  // (the `safeRead*LS`/`safeWriteLS`/`safeRemoveLS` adapters) — there is
  // no `localStorage` global in React Native at all, so any direct
  // `localStorage.*` reference would be a runtime crash on device.
  // No allowlist needed: at the time of introduction every mention of
  // the symbol on mobile lives inside JSDoc comments documenting the
  // web→mobile port (which the rule's AST traversal ignores).
  {
    files: [
      "apps/mobile/src/**/*.{js,jsx,ts,tsx}",
      "apps/mobile/app/**/*.{js,jsx,ts,tsx}",
    ],
    ignores: [
      "apps/mobile/src/**/*.test.{js,jsx,ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/app/**/*.test.{js,jsx,ts,tsx}",
      "apps/mobile/app/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-raw-local-storage": "error",
    },
  },
  // Monobank PAT client-storage guardrail — Stage 0 / PR #002 from
  // `docs/planning/storage-roadmap.md`. The PAT lives only on the
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
  // AuthContext migration (Session 4B, PR after #390): "who am I" is
  // single-sourced via `useUser()` from `@sergeant/api-client/react` → GET
  // `/api/v1/me`. Better Auth stays only as the actions layer. Block
  // reintroduction of `useSession` from `better-auth/react` anywhere in the
  // web app except `authClient.ts`, which is the one legitimate adapter
  // module — it owns the Better Auth client and intentionally does NOT
  // re-export `useSession` (see the note in that file).
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
          ],
        },
      ],
    },
  },
  // Server bigint→string guardrail — the `pg` driver returns `int8` /
  // `bigint` columns as JavaScript strings; every `.rows.map(…)` that
  // constructs a response object must wrap numeric-looking columns in
  // `Number(…)`. See AGENTS.md hard rule #1 and issue #708.
  //
  // Scoped to `apps/server/src/**` only — the web app never queries
  // pg directly.
  {
    files: ["apps/server/src/**/*.{js,ts}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-bigint-string": "error",
    },
  },
  // React Query keys factory guardrail — AGENTS.md hard rule #2: all
  // `queryKey` / `mutationKey` values must come from the centralized
  // factory in `apps/web/src/shared/lib/queryKeys.ts`. Inline array
  // literals break bulk invalidation and let typos compile silently.
  // The factory file itself is exempt (it defines the arrays).
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/shared/lib/queryKeys.ts",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/rq-keys-only-from-factory": "error",
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
  // Type-safety bypass guardrail — PR-6.E: forbid new `@ts-expect-error`,
  // `@ts-ignore`, `as any`, and `as unknown as X` in production code.
  // These patterns erode type safety and make refactoring dangerous.
  // Test files are exempt (they legitimately need type-level tricks).
  //
  // Allowlist below now contains only test-file globs — every initial
  // production call-site listed at rule introduction (see
  // `docs/tech-debt/frontend.md` §no-strict-bypass) has been migrated.
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
  // Mobile counterpart of `no-strict-bypass`. Extends the same rule to
  // `apps/mobile/src/**` + `apps/mobile/app/**` so type-safety bypasses
  // can no longer accumulate on the React Native side unnoticed.
  //
  // Allowlist below names every existing `as unknown as X` call-site
  // on mobile as of rule extension (2026-05-01). Migrate a file → drop
  // it from the list. See `docs/tech-debt/mobile.md` §no-strict-bypass
  // (registry tracked separately in PR 3).
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}", "apps/mobile/app/**/*.{ts,tsx}"],
    ignores: [
      // Tests can use type bypasses freely as fixtures.
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/app/**/*.test.{ts,tsx}",
      "apps/mobile/app/**/__tests__/**",
      // ── Existing `as unknown as` call-sites (do not add new ones) ──
      // Domain-shape adapters: web ↔ mobile share `@sergeant/{finyk,fizruk,
      // routine,nutrition}-domain` shapes that mobile RN partial views /
      // chart palettes don't yet match precisely. Migrate by aligning the
      // local view-model type to the domain shape.
      "apps/mobile/src/modules/finyk/pages/Overview/CategoryChartSection.tsx",
      "apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx",
      "apps/mobile/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx",
      "apps/mobile/src/modules/fizruk/hooks/useCustomExercises.ts",
      "apps/mobile/src/modules/fizruk/hooks/useRecovery.ts",
      "apps/mobile/src/modules/fizruk/pages/Exercise.tsx",
      // Notifications API — Expo trigger union widened in SDK 52, mobile
      // codebase hasn't caught up yet. Drop after `expo-notifications`
      // type alignment.
      "apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts",
    ],
    rules: {
      "sergeant-design/no-strict-bypass": "error",
    },
  },
  eslintConfigPrettier,
];
