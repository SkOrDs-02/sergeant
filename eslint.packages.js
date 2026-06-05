// PR-31 phase 2 — workspace-package-only flat-config blocks extracted from
// the root `eslint.config.js`. Composed back via `...packageBlocks` so
// `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: the design-system eslint plugin's
// own sources/tests, which must not self-lint their fixtures.
export const packageBlocks = [
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
      // Test fixtures for `require-toast-error-action` feed bare
      // `toast.error(...)` strings to the linter; turn the rule off so
      // the plugin doesn't self-flag its own fixtures.
      "sergeant-design/require-toast-error-action": "off",
    },
  },
  // The ESLint plugin's own test fixtures contain raw storage key literals and
  // small-button class strings — disable both new rules on the plugin itself.
  {
    files: ["packages/eslint-plugin-sergeant-design/**/*.{js,mjs}"],
    rules: {
      "sergeant-design/no-raw-storage-key": "off",
      "sergeant-design/no-small-button-touch-target": "off",
    },
  },
];
