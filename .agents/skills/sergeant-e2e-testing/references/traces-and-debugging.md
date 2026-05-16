---
title: Traces and Debugging
impact: MEDIUM
impactDescription: Without trace retention, flaky test failures in CI are impossible to diagnose. Without the right local flags, debugging is slow.
tags: [playwright, traces, debugging, ci, inspector]
---

# Playwright Traces and Debugging in Sergeant

## Active configuration

`apps/web/playwright.config.ts` sets:

```typescript
trace: "retain-on-failure",   // attaches trace only when a test fails
screenshot: "only-on-failure",
```

Do not change `trace` to `"on"` globally — it bloats CI artifacts on every passing run. `retain-on-failure` is the right balance for CI diagnostics.

## Local debugging

```bash
# Interactive UI mode — full timeline, network tab, DOM snapshots
pnpm playwright test --ui

# Force trace on every test (local only — do not use in CI config)
pnpm playwright test --trace on

# Playwright Inspector — pauses on every step, shows selector suggestions
PWDEBUG=1 pnpm playwright test tests/smoke/auth.spec.ts
```

## Viewing traces from CI

When a CI run fails, download the `playwright-report` artifact from the workflow run. Open the trace locally:

```bash
pnpm playwright show-trace path/to/trace.zip
```

The trace shows: DOM snapshot at every action, network calls (request + response), action timeline. This is usually sufficient to diagnose a flaky failure without reproducing it locally.

## Debugging a flaky test

1. Run with `--trace on` locally 3–5 times.
2. Compare traces between a passing and a failing run — look for timing differences in network calls or animations blocking interaction.
3. Fix with a web-first assertion (`await expect(locator).toBeVisible()`), not `waitForTimeout`. See `references/selectors.md`.
4. If still flaky after adding web-first assertions, consult `docs/playbooks/stabilize-flaky-test.md`.

## Sergeant-specific note

Tests run against `vite preview` (not the dev server). If a test passes locally in dev but fails in CI, the likely cause is a missing build step or a CSP/CORS header that `vite dev` ignores. Reproduce by running `pnpm build && pnpm preview` locally before concluding it is a flaky test.
