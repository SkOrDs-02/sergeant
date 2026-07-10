// PR-31 phase 2 — mobile-only (React Native / Expo) flat-config blocks
// extracted from the root `eslint.config.js`. Composed back via
// `...mobileBlocks` so `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: `apps/mobile/{src,app}/**`.
export const mobileBlocks = [
  // Mobile cloud-sync guardrail — `useLocalStorage` must not be called
  // with a key tracked in `packages/shared/src/sync/modules.ts → SYNC_MODULES`
  // (the cross-platform registry, PR #007), because MMKV writes bypass
  // JS and would silently break cloud sync. The fix is to call
  // `useSyncedStorage` from `@/sync/useSyncedStorage` instead, which
  // mirrors the write into the sync queue.
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
  // Mirror of the web umbrella ban for the mobile app — Metro tolerates
  // `node:fs` shims today, but the latent dual breakage (audit §8) means
  // we lock all client-side surfaces to the safe sub-segments.
  {
    files: ["apps/mobile/src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@sergeant/db-schema/migrate",
              message:
                "Import the runner from `@sergeant/db-schema/migrate/runner` (or the dialect-specific sub-segment `…/migrate/sqlite` / `…/migrate/pg`). The umbrella `…/migrate` re-exports `loadMigrationFiles` from `./files.js`, which top-level imports `node:fs`/`node:path`. See `docs/90-work/audits/2026-05-07-app-audit.md` §1.",
            },
          ],
        },
      ],
    },
  },
  // Mobile counterpart of `no-strict-bypass`. Extends the same rule to
  // `apps/mobile/src/**` + `apps/mobile/app/**` so type-safety bypasses
  // can no longer accumulate on the React Native side unnoticed.
  //
  // Allowlist below names every existing `as unknown as X` call-site
  // on mobile as of rule extension (2026-05-01). Migrate a file → drop
  // it from the list. See `docs/90-work/tech-debt/mobile.md` §no-strict-bypass
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
      // Finyk allowlist entries (CategoryChartSection.tsx, TransactionsPage.tsx)
      // dropped 2026-05-15: M4 (mobile.md roadmap) done — palette uses
      // `readonly string[]` from `chartPaletteList`, manual-expense undo
      // path routes the persisted record through `upgradeCategory()`.
      // Fizruk × 4 allowlist entries (WorkoutJournalSection.tsx,
      // useCustomExercises.ts, useRecovery.ts, Exercise.tsx) dropped
      // 2026-05-15: M3 (mobile.md roadmap) done — journal selectors
      // widened to `WorkoutSummaryInput`/`WorkoutForJournal` in
      // `@sergeant/fizruk-domain/domain/workouts/journal.ts`, and the
      // remaining FizrukWorkout → DomainWorkout conversions route
      // through the new `apps/mobile/src/modules/fizruk/lib/toDomain.ts`
      // adapter. `useCustomExercises.add` constructs the literal per
      // known field so the index signature does not widen via spread.
      // Notifications API allowlist entry for `useRoutineReminders.ts`
      // was dropped on 2026-05-13: M5 (mobile.md roadmap) is done and the
      // hook now builds a typed `WeeklyTriggerInput` inline. Re-adding it
      // would mask future regressions.
    ],
    rules: {
      "sergeant-design/no-strict-bypass": "error",
    },
  },
  // §9-mobile @typescript-eslint/no-explicit-any → warn for apps/mobile/src/**
  // Mirror of the web §9 guardrail above, tuned to `warn` (not `error`)
  // because the mobile source has one by-design `any` alias that already
  // carries an inline disable:
  //   • `core/hub/search/searchCache.ts:55` — `LooseRecord = Record<string, any>`
  //     (legacy LS shape parser; eslint-disable-next-line present).
  // New `any` in mobile production code surfaces immediately in CI lint
  // output. Promote to "error" once the burn-down reaches zero. See
  // `docs/90-work/tech-debt/mobile.md` §no-explicit-any.
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `immutability` cleared
  // apps/mobile: Sheet.tsx shared-value deps + CategoryDonut render accumulator.
  // Promoted from baseline `off` to mobile-scoped `error`. See
  // `docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`.
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}", "apps/mobile/app/**/*.{ts,tsx}"],
    ignores: [
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/app/**/*.test.{ts,tsx}",
      "apps/mobile/app/**/__tests__/**",
    ],
    rules: {
      "react-hooks/immutability": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `purity` cleared apps/mobile:
  // OnboardingWizard step timestamp ref init + useRecovery `nowMs` state
  // (parity with web `useRecovery`). Promoted from baseline `off` to
  // mobile-scoped `error`. See initiative 0021.
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}", "apps/mobile/app/**/*.{ts,tsx}"],
    ignores: [
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/app/**/*.test.{ts,tsx}",
      "apps/mobile/app/**/__tests__/**",
    ],
    rules: {
      "react-hooks/purity": "error",
    },
  },
  // react-hooks v7 burndown (initiative 0021) — `preserve-manual-memoization`
  // cleared apps/mobile: 4 call-sites fixed by extracting `computeInitialExpenseDate`
  // (ManualExpenseSheet — drop the memo the Compiler couldn't preserve) and by
  // centralising `pantryItems` in `useNutritionPantries` with a narrowed
  // `activePantryItems` dependency (mirrors web hook). Promoted from the
  // baseline `off` to mobile-scoped `error` so the next regression fails lint
  // loudly. Stays `off` in the shared baseline until other surfaces clear.
  // See `docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`.
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/preserve-manual-memoization": "error",
    },
  },
];
