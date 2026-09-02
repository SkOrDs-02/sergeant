// Sergeant ESLint baseline — shared flat-config slice consumed by the root
// `eslint.config.js` (and, eventually, by per-app/per-package configs as
// PR-31 phase-2 lands per-surface extracts).
//
// Phase 1 (this file) ships a *behavioural no-op* extraction: every block
// here was lifted verbatim from `eslint.config.js` lines 33–209 (`ignores`
// + `js.configs.recommended` + `tsRecommendedScoped` + react/flat +
// jsx-a11y/flat + the global "all files" plugin/settings/rules block +
// the TS-only `@typescript-eslint/no-unused-vars` block). The root config
// re-imports and spreads `baseline` so `pnpm exec eslint --print-config`
// stays byte-identical to pre-refactor — covered by the diff-test fixture
// snapshots committed under `apps/web/src/main.tsx`, `apps/server/src/
// index.ts`, `tools/openclaw/src/index.ts`, etc. (run `pnpm
// lint:eslint-config-diff` to regenerate; CI guards in PR-31 phase-2).
//
// Phase 2 (deferred — see `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/
// pr-31-eslint-config-split.md` § Acceptance criteria) extracts each
// surface-specific block (apps/web, apps/server, apps/mobile, apps/
// mobile-shell, tools/openclaw, packages/**) into per-app `eslint.
// config.js` that re-imports `baseline` and adds only its own glob-
// scoped rules. ESLint's flat-config discovery walks up from the linted
// file to the closest `eslint.config.js`, so per-app configs work without
// any monorepo plumbing.
//
// Why phase 1 first: the root config's 31 file-glob blocks have subtle
// interactions (e.g. `apps/server` + `tools/openclaw` share security
// rules; `apps/web` + `apps/mobile` share the i18n burndown). Lifting
// them piecemeal requires a diff-test scaffolding that doesn't yet
// exist — phase 1 ships the scaffolding (this baseline file) without
// per-surface risk.

import js from "@eslint/js";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import sergeantDesign from "./packages/eslint-plugin-sergeant-design/index.js";

const tsRecommendedScoped = tseslint.configs.recommended.map((cfg) => ({
  ...cfg,
  files: ["**/*.{ts,tsx}"],
}));

/**
 * Shared ignores — applied at the root of every flat-config consumer.
 * Keep in sync with `.gitignore` / `.prettierignore` only when the
 * exclusion is *behaviourally* desired for lint (build outputs,
 * dependency trees, lint-irrelevant caches). Do NOT add source paths
 * here — use `files:` overrides in surface-specific blocks instead.
 */
export const baselineIgnores = {
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
    "storybook-static/**",
    "**/storybook-static/**",
    // `.claude/workflows/*` are scripts for the Claude Code Workflow
    // tool. They run inside an async sandbox where `args`, `log`,
    // `agent`, `phase`, `pipeline`, `parallel`, `budget`, and top-level
    // `return` are all legal (and `Date.now`/`Math.random` are NOT).
    // Linting them as ES modules produces only false positives.
    ".claude/workflows/**",
    // `mockups/_shared/components/*` holds no-build-step CDN-React helpers
    // (deck-stage Web Component, design-canvas, tweaks-panel, motion-variants).
    // They reference `React` as a CDN global, use catch-param stubs, and are
    // never bundled — linting them produces only false positives.
    "mockups/_shared/components/**",
  ],
};

/**
 * Shared baseline — flat-config slice consumed by every Sergeant
 * surface. Keeps the design-system guardrails (`sergeant-design/*`),
 * the legacy-palette `no-restricted-syntax` guard, the react-hooks v7
 * rules (initiative 0021 closed — all at `error`), and the `@typescript-eslint/no-unused-vars` rule in
 * exactly one place. Surface-specific extensions live in per-app
 * `eslint.config.js` files (phase 2) or in the root `eslint.config.js`
 * after this spread (current state).
 *
 * Order matters: ESLint flat-config merges `rules` deterministically
 * via array order — later blocks override earlier ones. The root
 * `eslint.config.js` spreads `baseline` then appends surface blocks,
 * so surface-specific overrides win as expected.
 */
export const baseline = [
  baselineIgnores,
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
      // TypeScript-aware resolver lets `import/extensions` see through
      // multi-dot filenames (`hubReports.aggregation.ts`,
      // `hubPrefs.schema.ts`, `webpushSend.webpush.ts`) and through
      // path aliases (`@shared/*` → `./src/shared/*`) so the rule
      // checks the resolved file's real extension instead of the
      // text-suffix after the last dot.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: [
            "apps/web/tsconfig.json",
            "apps/mobile/tsconfig.json",
            "apps/mobile-shell/tsconfig.json",
          ],
        },
        node: true,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "sergeant-design": sergeantDesign,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "import/no-cycle": ["error", { ignoreExternal: true }],
      // Initiative 0021 closed (2026-07-10, PR #177): all react-hooks v7
      // rules cleared monorepo-wide — web/mobile in eslint.web.js /
      // eslint.mobile.js; baseline holds `error` for server, mobile-shell,
      // openclaw. See docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      // `static-components` cleared the monorepo — no component is defined
      // inside the body of another component. Promoted from "off" to
      // "error" so the baseline holds; next regression fails lint loudly.
      "react-hooks/static-components": "error",
      // `use-memo` cleared apps/web — a 2026-06-24 re-measure found 8 sites
      // across 3 files (HubHeader, fizruk Dashboard, finyk useOverviewData),
      // migrated to inline function expressions + simple-expression dependency
      // arrays. Promoted from "off" to "error" so the next regression fails
      // lint loudly.
      "react-hooks/use-memo": "error",
      // Agent marker syntax is repository governance, not visual taste.
      "sergeant-design/ai-marker-syntax": "error",
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
];
