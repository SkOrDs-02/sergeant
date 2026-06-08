// PR-31 phase 2 — openclaw-only flat-config blocks extracted from the root
// `eslint.config.js`. Composed back via `...openclawBlocks` so
// `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: `tools/openclaw/src/**`.
export const openclawBlocks = [
  // M16: Telegram legacy `parse_mode: "Markdown"` is forbidden in Console
  // sources — use `MarkdownV2` (or `HTML`). The legacy parser silently
  // truncates on unbalanced markers and ignores zero-width Unicode
  // sequences; V2 fails loudly. The custom rule lives in
  // `packages/eslint-plugin-sergeant-design/index.js` so `no-restricted-syntax`
  // does not collide with the M11 templated-query selectors that
  // also live on `tools/openclaw/**`. See
  // `docs/security/hardening/M16-telegram-markdown-v2.md`.
  {
    files: ["tools/openclaw/src/**/*.{js,ts}"],
    rules: {
      "sergeant-design/no-legacy-telegram-parse-mode": "error",
    },
  },
];
