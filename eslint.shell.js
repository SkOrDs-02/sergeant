// PR-31 phase 2 — mobile-shell-only flat-config blocks extracted from the
// root `eslint.config.js`. Composed back via `...shellBlocks` so
// `eslint --print-config` stays byte-identical
// (`pnpm lint:eslint-config-diff`). Scope: `apps/mobile-shell/src/**`.
export const shellBlocks = [
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
];
