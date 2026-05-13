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
// index.ts`, `tools/console/src/index.ts`, etc. (run `pnpm
// lint:eslint-config-diff` to regenerate; CI guards in PR-31 phase-2).
//
// Phase 2 (deferred — see `docs/initiatives/stack-pulse-2026-05/
// pr-31-eslint-config-split.md` § Acceptance criteria) extracts each
// surface-specific block (apps/web, apps/server, apps/mobile, apps/
// mobile-shell, tools/console, packages/**) into per-app `eslint.
// config.js` that re-imports `baseline` and adds only its own glob-
// scoped rules. ESLint's flat-config discovery walks up from the linted
// file to the closest `eslint.config.js`, so per-app configs work without
// any monorepo plumbing.
//
// Why phase 1 first: the root config's 31 file-glob blocks have subtle
// interactions (e.g. `apps/server` + `tools/console` share security
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
  ],
};

/**
 * Shared baseline — flat-config slice consumed by every Sergeant
 * surface. Keeps the design-system guardrails (`sergeant-design/*`),
 * the legacy-palette `no-restricted-syntax` guard, the react-hooks v7
 * suppressions, and the `@typescript-eslint/no-unused-vars` rule in
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
            "tools/console/tsconfig.json",
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
      // `eslint-plugin-react-hooks` v7 promoted a batch of new rules
      // (`set-state-in-effect`, `preserve-manual-memoization`,
      // `static-components`, `use-memo`, `immutability`, `purity`,
      // `refs-during-render`) to "error" in its `recommended` config
      // (see #1572 dev-deps bump). The pre-v7 codebase has dozens of
      // legacy `setState`-inside-effect, manual-memo, and ref-read
      // patterns that pre-date the rules — they're queued for a
      // dedicated cleanup initiative (see roadmap). Until that
      // cleanup lands, disable the rules so:
      //   1. lint-staged on touched files doesn't fail with errors
      //      authored by other contributors before the rule existed,
      //   2. `pnpm lint` keeps a clean signal for genuine regressions.
      // Promote back to "error" after the cleanup PR has migrated the
      // last call-site (mirrors the WCAG-`-strong` policy below).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
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
      // `bg-{family}-strong text-white`. See docs/design/brandbook.md →
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
];
