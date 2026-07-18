<!-- AUTO-GENERATED: false - authored loop contract -->

# User Story QA Loop

> **Last validated:** 2026-07-09 by @claude (freshness-cadence refresh — контракт лупу без змін). **Next review:** 2026-10-07.
> **Status:** Reference — повторюваний протокол; актуальні результати живуть у ledger.

## Goal

Create and maintain one canonical spreadsheet of app features, user stories,
expected behavior, test status, errors, fixes, and retest results.

Canonical spreadsheet: [`user-story-ledger.csv`](./user-story-ledger.csv).

Validator:

```bash
node scripts/audits/validate-user-story-ledger.mjs
```

## Loop State Machine

1. **Inventory phase**
   - Source features from executable code first: web route registry, module
     route roots, bottom-nav definitions, page switchers, server route
     handlers, and mobile navigation entrypoints.
   - Add one row per user-observable behavior, not one row per component.
   - Status moves from `discovered` to `story_drafted` only when the row has
     a user story and expected behavior grounded in source evidence.

2. **Testing phase**
   - Switch the loop only after every discovered feature row is
     `story_drafted`.
   - For each row, run the smallest reliable verification: automated unit
     test, integration test, Playwright/browser flow, mobile unit flow, or
     manual-blocked note when a device/secret is required.
   - Document every failure in the same spreadsheet using stable `error_ids`.
   - Batch by `test_type`:
     - `contract`: server contract tests and schema assertions.
     - `integration`: server route tests, API smoke tests, or mocked external
       service tests.
     - `mobile-unit`: focused React Native/Jest tests for native screens,
       hooks, and route helpers.
     - `playwright`: browser/PWA flows and visual/logistical UX checks.

3. **Fix phase**
   - Fix logistical errors and UX errors only after they are tied to a tested
     user story row.
   - Preserve unrelated dirty worktree changes.
   - Use owner skills for touched surfaces before coding fixes.

4. **Retest phase**
   - Re-run every behavior that failed or was touched by a fix.
   - Mark `retested_passed` only when the original user story passes with the
     same expected behavior.

## Guardrails

- Keep this work in `E:\.claude\Sergeant\.claude\worktrees\qa-feature-audit`
  unless the owner explicitly asks to move it.
- Do not run fix edits in the dirty main checkout
  `E:\.claude\Sergeant` while it contains unrelated AI quota changes.
- Prefer codebase-memory MCP for code discovery; fall back to `rg` for
  strings, docs, configs, and route literal extraction.
- Do not create separate spreadsheets per module; append to
  `user-story-ledger.csv`.
- Run `node scripts/audits/validate-user-story-ledger.mjs` after every ledger
  edit.
- Before broad QA, run surface-specific sanity checks rather than one opaque
  aggregate pass.

## Execution Notes

- 2026-06-29: `apps/web/tests/smoke/start-smoke-webserver.mjs` initially failed
  on Windows with `spawn EINVAL` when Node spawned `pnpm.cmd` directly. The
  smoke starter now invokes `pnpm` through `cmd.exe /d /s /c` on Windows.
- 2026-06-29: Docker Desktop was started and the real-DB Playwright critical
  smoke lane passed with `pnpm --filter @sergeant/web exec playwright test
--config playwright.smoke.config.ts --project chromium --grep "@critical"`
  (17 / 17). The first cold start exposed a Postgres readiness race after
  `docker compose up -d`; `apps/web/tests/smoke/start-smoke-webserver.mjs`
  now waits for `hub-postgres` to become `healthy` before running migrations.
- 2026-06-29: fix/retest phase closed 23 warning/error rows as
  `retested_passed`; after the live chat pass below, the canonical ledger has
  152 rows, 128 `tested_passed`, 24 `retested_passed`, and 0 open error rows.
- 2026-06-29: live browser chat was tested with real Docker Postgres and the
  configured Anthropic key via `pnpm --filter @sergeant/web exec playwright
test --config playwright.smoke.config.ts --project chromium --grep
"@live-chat"` (2 / 2 passed). The first live run exposed a production-path
  database constraint drift: migration 077 removed the allowed
  `anthropic:<model>` usage bucket family, causing `anthropic_usage_ledger`
  persistence to fail for `anthropic:claude-haiku-4-5-20251001`. Migration 078
  restores that bucket family and the retest confirmed the provider usage row
  is stored.
- 2026-06-29: a full `pnpm --filter @sergeant/mobile exec jest --runInBand
--config jest.config.js` pass timed out after 5 minutes on this machine.
  Post-fix mobile verification used ledger-scoped clean batches for core,
  Finyk, Nutrition, and Routine behavior instead.
- 2026-06-29: final post-fix verification passed:
  `node scripts/audits/validate-user-story-ledger.mjs`, server ledger
  route batch (18 files / 202 tests), mobile ledger-scoped batches, and
  `pnpm --filter @sergeant/web exec playwright test --config
playwright.ledger.config.ts --project chromium` (49 / 49).
- 2026-06-29: post-fix type safety check passed with
  `pnpm --filter @sergeant/mobile typecheck`.

## Exit Conditions

- Inventory done: every URL-addressable and module-nav feature has a
  `story_drafted` row with source evidence. Child flows inside a route should
  also be represented when they create, mutate, import, export, authenticate,
  navigate, call AI, schedule reminders, or cross module boundaries.
- Testing done: every `story_drafted` row has `test_status` set to
  `passed`, `failed`, or `blocked`.
- Fix done: every fixable logistical or UX failure has `fix_status=fixed` and
  a linked code/test change.
- Retest done: every fixed row has `retest_status=passed`.
