---
name: sergeant-e2e-testing
description: Use when writing, reviewing, or debugging Playwright E2E tests in apps/web; for auth fixtures, network mocking, trace debugging, or CI retry config; UA: Playwright, E2E тести, e2e, smoke test.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# E2E Testing (Playwright) у Sergeant

Playwright tests in Sergeant run against a preview build (`vite build && vite preview`). The test suite lives in `apps/web/tests/` split into `tests/smoke/` (auth and critical path) and `tests/a11y/` (axe-core accessibility snapshots). Config: `apps/web/playwright.config.ts`.

## 8 Golden Rules

1. **Web-first assertions** — use `await expect(locator).toBeVisible()` not `await page.waitForSelector()`. Web-first assertions auto-retry; raw selectors block immediately.
2. **No `waitForTimeout`** — replace any `page.waitForTimeout(N)` with a web-first assertion on the element that must appear. Timing-based waits are always wrong.
3. **Role-based selectors first** — prefer `page.getByRole("button", { name: "..." })` over CSS or `nth-child`. Fallback to `data-testid` (`getByTestId`) only when ARIA role is insufficient.
4. **State seeding via `seedFTUX`** — use `apps/web/tests/utils/seedFTUX.ts` (`"cold"`, `"pre-ftux"`, `"post-ftux"`, `"module-first-run"`) to seed `localStorage` state before navigation. Never drive the full UI sign-up/onboarding flow to reach steady state.
5. **Trace retention** — active config uses `trace: "retain-on-failure"`. Do not change to `"on"` (bloats CI artifacts). For local debugging run with `--trace on`.
6. **Screenshot on failure only** — `screenshot: "only-on-failure"` in config. Do not commit golden screenshots for non-visual-qa tests; `tests/a11y/ds-visual-qa.spec.ts` is the only allowed visual baseline.
7. **Workers = 1** — config sets `workers: 1` because tests share a single preview server. Do not change to `fullyParallel: true` without making each spec spin up its own server.
8. **Tag critical tests** — prefix test descriptions with `@critical` for auth and onboarding happy-path tests. CI can filter with `--grep @critical` for fast smoke runs.

## Reference files

For deeper guidance on specific scenarios:

- [`references/selectors.md`](references/selectors.md) — selector hierarchy, when to use `data-testid`, common anti-patterns.
- [`references/network-mocking.md`](references/network-mocking.md) — when to mock vs. use real API; MSW integration patterns.
- [`references/auth-flow.md`](references/auth-flow.md) — Sergeant-specific auth fixture using `seedFTUX` and Better Auth cookie patterns.
- [`references/traces-and-debugging.md`](references/traces-and-debugging.md) — trace flags, `--ui` mode, Playwright Inspector, CI artifact retrieval.

## Running tests

```bash
cd apps/web
pnpm build && pnpm preview &           # start preview server (required)
pnpm playwright test tests/smoke/      # smoke suite
pnpm playwright test tests/a11y/       # accessibility suite
pnpm playwright test --ui              # interactive UI mode (local debug)
pnpm playwright test --trace on        # force-enable traces locally
```

## What NOT to do

- Do not use `page.waitForTimeout()` — ever.
- Do not seed auth state by driving the login UI in `beforeEach` — use `seedFTUX`.
- Do not use CSS class or nth-child selectors — they break on design-system refactors.
- Do not commit snapshot updates without visual review.
- Do not change `workers` or `fullyParallel` without understanding the shared-server constraint.
- Do not run tests against the dev server (`vite dev`) — tests must run against `vite preview` to match CI.

## Playbooks

- `docs/playbooks/write-e2e-test.md` — execution order for writing or debugging an E2E/a11y test (seedFTUX, web-first assertions, preview run, trace debug).
- `docs/playbooks/stabilize-flaky-test.md` — when a test becomes flaky in CI.
- Skill catalog: `docs/agents/agent-skills-catalog.md`.
