---
description: Run E2E tests with Playwright — smoke, full suite, or specific spec
argument-hint: "[smoke|full|<spec-path>]"
---

Run E2E tests using Playwright.

1. If `$ARGUMENTS` is empty or `smoke`: Run smoke tests only — `pnpm --filter @sergeant/web test:e2e --grep "@smoke"`.
2. If `$ARGUMENTS` is `full`: Run full E2E suite — `pnpm --filter @sergeant/web test:e2e`.
3. If `$ARGUMENTS` is a path: Run specific spec — `pnpm --filter @sergeant/web test:e2e $ARGUMENTS`.
4. If tests fail, analyze the failure output and suggest fixes. Do NOT auto-fix unless the user asks.
5. Report: pass/fail count, failed test names, and suggested next step.

For auth-related tests, use test user `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7`.
