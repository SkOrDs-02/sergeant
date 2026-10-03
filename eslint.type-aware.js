// Type-aware lint slice — the only block in this repo that asks the
// TypeScript compiler for types instead of reading the AST alone.
//
// Why it exists: `no-floating-promises` is the rule that catches the class
// of bug PR #82 fixed by hand — four SQLite mirror writes on mobile were
// fired without a `.catch`, so a failed write vanished with no log, no
// Sentry event and no user-visible symptom. An AST-only linter cannot see
// that: it has to know the expression's type is a Promise.
//
// Cost: the parser builds a TS program for `apps/**`, which roughly doubles
// a cold lint of `apps/web/src` (measured 2026-09-16: 84 s → 168 s cold,
// whole-repo `turbo run lint` is cached per workspace and per file, so the
// everyday number is far smaller). `projectService: true` lets the parser
// pick each app's own tsconfig instead of us hand-listing five of them.
//
// Scope is `apps/**` by owner decision (2026-09-16), not `packages/**`.
import tseslint from "typescript-eslint";

import { floatingPromisesBaseline } from "./eslint.floating-promises-baseline.js";

// Files the TS project service cannot resolve. Type-aware linting needs a
// tsconfig that CONTAINS the file; when none does, the parser fails the file
// outright (`was not found by the project service`) instead of reporting
// rules, so every one of these would be a hard lint error rather than a
// finding. Each exclusion below is a real gap, not a preference:
//
//   - `apps/web/tests/**` — Playwright specs; `apps/web/tsconfig.json`
//     includes only `src/**/*`. The biggest gap (51 files) and the one most
//     worth closing later, since E2E code floats promises easily.
//   - `apps/web/src/sw*` — service worker, deliberately `exclude`d from the
//     app tsconfig and owned by `tsconfig.sw.json`.
//   - `*.config.ts`, `.storybook/**`, `apps/server/scripts/**`,
//     `apps/mobile/plugins/**` — tooling that no app tsconfig includes.
//   - two `*.test.tsx` files that sit next to a `*.test.ts` of the same base
//     name: TypeScript resolves the `.ts` and never sees the `.tsx`, so those
//     two specs are untyped today. That is a bug in its own right, tracked
//     separately — listing them here keeps this PR to one cause.
export const PROJECT_SERVICE_BLIND_SPOTS = [
  "apps/web/tests/**",
  "apps/web/src/sw.ts",
  "apps/web/src/sw/**",
  "apps/web/.storybook/**",
  "apps/server/scripts/**",
  "apps/mobile/plugins/**",
  "apps/*/*.config.ts",
  "apps/web/middleware.ts",
  "apps/web/src/shared/hooks/useCloudPullPending.test.tsx",
  "apps/web/src/modules/fizruk/hooks/useWorkoutsOrchestrator.test.tsx",
];

const typeAwareBlock = {
  files: ["apps/**/*.{ts,tsx}"],
  ignores: PROJECT_SERVICE_BLIND_SPOTS,
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: { "@typescript-eslint/no-floating-promises": "error" },
};

// Debt allowance: files that already float a promise keep the rule off, so
// the gate blocks NEW offenders only. Regenerate with
// `node scripts/ci/check-floating-promises-baseline.mjs --bump`.
//
// The spread is conditional because flat-config rejects `files: []` outright
// — which is exactly the shape this file takes on the day the debt reaches
// zero. Without the guard, finishing the burn-down would break lint.
const baselineBlock =
  floatingPromisesBaseline.length > 0
    ? [
        {
          files: floatingPromisesBaseline,
          rules: { "@typescript-eslint/no-floating-promises": "off" },
        },
      ]
    : [];

export const typeAwareBlocks = [typeAwareBlock, ...baselineBlock];
