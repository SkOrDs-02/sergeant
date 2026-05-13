import { readFileSync } from "node:fs";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";
import sergeantDesign from "./packages/eslint-plugin-sergeant-design/index.js";

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
      "storybook-static/**",
      "**/storybook-static/**",
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
      // See docs/design/radius-rhythm.md.
      "sergeant-design/no-rounded-lg": "warn",
      // `no-bare-empty-text` — enforce empty-state tier discipline.
      // Bare JSX text with Ukrainian "Поки немає" / "ще немає" phrases must
      // use <EmptyState> / <ModuleEmptyState> — see docs/design/empty-states.md.
      "sergeant-design/no-bare-empty-text": "warn",
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
    },
  },
  // Stack-pulse PR-07 — body-size declarative policy.
  // Inline `express.json({ limit })` / `express.raw({ ..., limit })`
  // у server-коді (поза `apps/server/src/http/bodySizePolicy.ts`)
  // обходить декларативну `BODY_SIZE_POLICY`-таблицю — додавай rule
  // у policy замість того, щоб mount-ити inline-парсер. Скоупимо
  // виключно у `apps/server/**`, бо лише там Express body-парсери
  // мають значення (web/mobile не мають Express-сервера).
  {
    files: ["apps/server/**/*.{ts,js,mjs}"],
    rules: {
      "sergeant-design/no-inline-body-size-limit": "error",
    },
  },
  // Stack-pulse PR-16 — Pino redaction policy.
  // Pino logger у `apps/server/src/obs/logger.ts` має
  // `redact: { paths: [...] }` зі списком ~50 sensitive-полів
  // (Authorization, Cookie, password, email, …). Але redact-paths
  // працюють тільки на КЛЮЧАХ, які явно перераховані. Якщо хтось
  // пише `logger.info(req)` — у JSON-output потрапляють УСІ поля
  // Express Request, включно з тими, що не у redact-list (custom
  // proxy headers, `req.signedCookies`, `req.user` від Better Auth,
  // `req.body` для нових endpoint-ів). Це rule змушує робити явний
  // destructure (`logger.info({ url: req.url, status: res.statusCode },
  // 'msg')`) — контракт стає видимим у diff. Доповнення до
  // redact-paths, не заміна. Test-файли свідомо лишаємо у scope:
  // тести теж не мають логувати raw req/res. Скоупимо виключно у
  // `apps/server/**` — лише там живе Pino-stack. Hard rule #21,
  // докладніше у `docs/security/logging-redaction-policy.md`.
  {
    files: ["apps/server/**/*.{ts,js,mjs}"],
    rules: {
      "sergeant-design/no-raw-req-in-pino-log": "error",
    },
  },
  // Mobile-shell sunset guardrail — initiative 0002 (mobile platform
  // decision). `apps/mobile-shell/` is on the locked-in deprecation
  // schedule defined in ADR-0010 § Sunset schedule (T₀ 2026-09-01,
  // T₁ 2026-11-30, T₂ 2026-12-30). To make that deprecation real,
  // we forbid net-new files in `apps/mobile-shell/src/**` — any new
  // feature should grow inside `apps/mobile/src/**` (RN) or
  // `apps/web/src/**` (web) instead. The rule itself owns the
  // allowlist of existing shell-glue files (snapshot 2026-05-03);
  // adding a *legitimate* new shim requires updating the
  // SHELL_GLUE_ALLOWLIST in
  // `packages/eslint-plugin-sergeant-design/index.js` together with
  // an ADR-0010 / initiative 0002 outcome reference.
  {
    files: ["apps/mobile-shell/src/**/*.{ts,tsx}"],
    rules: {
      "sergeant-design/forbid-shell-only-feature": "error",
    },
  },
  // Hash-router migration canary — initiative 0006 (frontend routing &
  // code-split). `apps/web` зараз стоїть на самописному hash-router
  // (`useHashRouter` / `useHashRoute` / raw `window.location.hash = ...`
  // assignments) у ~14 модульних callsite-ах; план — поетапна міграція на
  // `react-router@7` з route-based code-split. Поки міграція in-flight,
  // ця rule працює як **warn-only canary**: підсвічує нові callsite-и в
  // `apps/web/src/modules/**` (vite-overlay, lint-staged, CI lint), але
  // НЕ блокує існуючі. Після завершення Phase 2 (per-domain route
  // міграція) rule піднімається до `error`. Реалізація + поточний baseline
  // у `docs/initiatives/0006-frontend-routing-and-code-split.md`.
  {
    files: ["apps/web/src/modules/**/*.{ts,tsx}"],
    rules: {
      "sergeant-design/no-hash-router-in-modules": "warn",
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
  // `docs/initiatives/archive/_0007-design-system-tooling.md`). Решта 23
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
  // `docs/initiatives/0011-foundation-adoption-and-process-discipline.md`
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
    },
  },
  // Import-extension hygiene — bans `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs`
  // suffixes in import specifiers for the bundler-fed frontend apps. Codemod
  // #3 stripped 436 historical extension-suffixed imports in `apps/web/src`
  // (see `docs/tech-debt/frontend.md` §"Уже закрито"); without an enforcing
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
      "tools/console/src/**/*.{ts,tsx,js,jsx}",
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
  //
  // Same block also bans the `@sergeant/db-schema/migrate` umbrella entry —
  // that re-exports `loadMigrationFiles` from `./files.js`, which top-level
  // imports `node:fs` / `node:path` and breaks Vite's browser bundle (white
  // screen on boot — see audit `docs/audits/2026-05-07-app-audit.md` §1).
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
                "Import the runner from `@sergeant/db-schema/migrate/runner` (or the dialect-specific sub-segment `…/migrate/sqlite` / `…/migrate/pg`). The umbrella `…/migrate` re-exports `loadMigrationFiles` from `./files.js`, which top-level imports `node:fs`/`node:path` and breaks Vite's browser bundle. See `docs/audits/2026-05-07-app-audit.md` §1.",
            },
          ],
        },
      ],
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
                "Import the runner from `@sergeant/db-schema/migrate/runner` (or the dialect-specific sub-segment `…/migrate/sqlite` / `…/migrate/pg`). The umbrella `…/migrate` re-exports `loadMigrationFiles` from `./files.js`, which top-level imports `node:fs`/`node:path`. See `docs/audits/2026-05-07-app-audit.md` §1.",
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
  // SAST guardrail — `eslint-plugin-security` taint-flow heuristics on
  // production server + console code. Closes the M11 audit gap from
  // `docs/security/hardening/M11-eslint-plugin-security.md`: SQL
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
    files: ["apps/server/src/**/*.{js,ts}", "tools/console/src/**/*.{js,ts}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/*.integration.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
      "apps/server/src/test/**",
      "tools/console/src/**/*.test.{js,ts}",
      "tools/console/src/**/__tests__/**",
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
      // `docs/security/hardening/M11-eslint-plugin-security.md`
      // verification ("baseline run produces no new errors on the
      // existing codebase") the rules ship at "warn" — review-time
      // signal in CI lint output without blocking on the audited
      // baseline. Promote to "error" once the baseline is migrated;
      // see `docs/security/audit-exceptions.md` for the inventory.
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
            "Templated `pool.query(`…${…}…`)` is risky — use parameterised `pool.query('… $1 …', [value])` instead. See docs/security/hardening/M11-eslint-plugin-security.md.",
        },
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
          message:
            "Templated `query(`…${…}…`)` is risky — use parameterised `query('… $1 …', [value])` instead. See docs/security/hardening/M11-eslint-plugin-security.md.",
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
  // M16: Telegram legacy `parse_mode: "Markdown"` is forbidden in Console
  // sources — use `MarkdownV2` (or `HTML`). The legacy parser silently
  // truncates on unbalanced markers and ignores zero-width Unicode
  // sequences; V2 fails loudly. The custom rule lives in
  // `packages/eslint-plugin-sergeant-design/index.js` so `no-restricted-syntax`
  // does not collide with the M11 templated-query selectors that
  // also live on `tools/console/**`. See
  // `docs/security/hardening/M16-telegram-markdown-v2.md`.
  {
    files: ["tools/console/src/**/*.{js,ts}"],
    rules: {
      "sergeant-design/no-legacy-telegram-parse-mode": "error",
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
  // Module-size guardrail (initiative 0001) — `max-lines: [error, 600]`
  // for `apps/web/src/**/*.{ts,tsx}`. Enforces decomposition discipline:
  // a single TS/TSX file in the web bundle must not exceed 600 LOC
  // (skipBlankLines + skipComments). New violations fail CI; existing
  // monoliths are explicitly allowlisted with a deadline TODO so the
  // queue stays visible. See `docs/initiatives/archive/_0001-module-decomposition.md`.
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
  // Allowlist for existing >600 LOC monoliths in `apps/web/src/**`.
  // Each entry MUST stay paired with a Phase 2 PR in
  // `docs/initiatives/archive/_0001-module-decomposition.md`. When a file is
  // decomposed below 600 LOC, drop its entry from this list — the
  // top-level rule above will then enforce it going forward.
  //
  // TODO(0001-module-decomposition): deadline 2026-06-15 — drop entries
  // as the matching PR (decomp-routine-app, decomp-finyk-storage, etc.)
  // ships. The allowlist is intentionally explicit (not a glob) so each
  // file shows up in `git blame` / `git log` against this rule.
  {
    files: ["apps/web/src/core/lib/hubChatContext.ts"],
    rules: {
      "max-lines": "off",
    },
  },
  eslintConfigPrettier,
];
