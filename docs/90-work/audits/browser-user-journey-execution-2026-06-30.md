# Browser user journey execution log

> **Last validated:** 2026-07-19 by Codex. **Next review:** 2026-10-17.
> **Status:** Closed — execution snapshot завершено.

## Мета

Виконати `browser-user-journey-loop.md` проти поточного `origin/main`, зафіксувати
докази, виправити логістичні блокери тестового harness, а UX/product findings не
змішувати з локальними env gaps.

## Контекст запуску

- Робоча гілка для змін: `codex/browser-user-journey-loop`.
- Робоче дерево для змін:
  `E:\.claude\Sergeant\.claude\worktrees\browser-user-journey-loop`.
- Execution mirror для браузерних прогонів:
  `E:\.claude\Sergeant\.claude\worktrees\production-readiness-loop`.
- Причина mirror: fresh worktree install у browser-гілці зависав довше 20 хвилин, а
  production-readiness worktree мав готові залежності та той самий tree content від
  `origin/main` перед тестовими патчами.

## Самопромпт

1. Почати з валідного ledger та production preview build, не з `vite dev`.
2. Розділити Playwright на групи: baseline, auth/onboarding/shell, core modules,
   HubChat/AI UX, offline/PWA/redirects.
3. Кожен failure класифікувати як product bug, UX bug, test harness bug або env gap.
4. Логістичні harness bugs фіксити одразу й робити post-fix retest.
5. Не claim “усе працює”, якщо частина сценаріїв лише cold-load або залежить від
   відсутніх локальних secrets.

## Результати

| Група                         | Команда                                                                                                                                                                                                                                                                                                               | Результат           | Примітка                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| 0 Ledger                      | `node scripts/audits/validate-user-story-ledger.mjs`                                                                                                                                                                                                                                                                  | Passed: `152 rows`  | Ledger валідний.                                                     |
| 0 Ledger browser              | `pnpm --filter @sergeant/web exec playwright test --config playwright.ledger.config.ts --project chromium`                                                                                                                                                                                                            | Passed: `49 passed` | Після збільшення timeout і ручного build/preview у execution mirror. |
| Setup                         | `pnpm --filter @sergeant/web exec playwright test --config playwright.smoke.config.ts --project setup --global-timeout 600000 --timeout 90000`                                                                                                                                                                        | Passed: `1 passed`  | Після очищення stale `:3000` і збільшення API readiness timeout.     |
| A Entry/auth/onboarding/shell | `pnpm --filter @sergeant/web exec playwright test tests/smoke/auth.spec.ts tests/smoke/onboarding-happy-path.spec.ts tests/smoke/bottom-nav.spec.ts tests/smoke/dashboard-health.spec.ts --config playwright.smoke.config.ts --project chromium --grep "@critical" --no-deps --global-timeout 900000 --timeout 90000` | Passed: `9 passed`  | Auth, onboarding, bottom nav, dashboard health.                      |
| B Core modules                | `pnpm --filter @sergeant/web exec playwright test tests/smoke/finyk-smoke.spec.ts tests/smoke/nutrition-smoke.spec.ts tests/smoke/routine-smoke.spec.ts tests/smoke/fizruk-smoke.spec.ts --config playwright.smoke.config.ts --project chromium --grep "@critical" --no-deps --global-timeout 900000 --timeout 90000` | Passed: `4 passed`  | Cold-load proof for Finyk, Nutrition, Routine, Fizruk.               |
| C HubChat/AI UX               | `pnpm --filter @sergeant/web exec playwright test tests/smoke/hub-chat-smoke.spec.ts tests/smoke/hub-chat-live-smoke.spec.ts --config playwright.smoke.config.ts --project chromium --grep "@critical" --no-deps --global-timeout 900000 --timeout 90000`                                                             | Passed: `2 passed`  | Local no-key `/api/chat` 503 renders retryable assistant message.    |
| D Redirects                   | `pnpm --filter @sergeant/web exec playwright test tests/smoke/navigation-offline-sw.spec.ts tests/smoke/hash-redirect-smoke.spec.ts --config playwright.smoke.config.ts --project chromium --grep "@critical" --no-deps --global-timeout 900000 --timeout 90000`                                                      | Passed: `1 passed`  | Only hash redirect is tagged `@critical`.                            |
| D Offline/PWA                 | `pnpm --filter @sergeant/web exec playwright test tests/smoke/navigation-offline-sw.spec.ts --config playwright.smoke.config.ts --project chromium --no-deps --global-timeout 900000 --timeout 90000`                                                                                                                 | Passed: `3 passed`  | Extended nav/offline/SW proof.                                       |

## Виправлення

### BRJ-001: Ledger webServer timeout замалий

- Type: test harness bug.
- Symptom: `playwright.ledger.config.ts` падав на cold build із timeout `180000ms`.
- Fix: збільшено webServer timeout до `360_000`.
- Post-fix proof: ledger browser suite пройшов `49 passed`.

### BRJ-002: Smoke API readiness timeout замалий

- Type: test harness bug.
- Symptom: setup падав із `API server did not become ready at
http://127.0.0.1:3000/health: fetch failed`.
- Fix: `start-smoke-webserver.mjs` розділяє Postgres timeout `60_000` і API timeout
  `180_000`.
- Post-fix proof: setup пройшов `1 passed`, потім усі групи A-D пройшли.

## Відкриті ризики

### BRJ-003: Fresh worktree install зависає на Windows

- Type: local setup / reliability debt.
- Evidence: `pnpm install --frozen-lockfile`, `pnpm install --frozen-lockfile
--prefer-offline`, і filtered install зависали на 10-20 хвилин у browser worktree.
- Impact: чиста нова сесія може не запустити browser loop без готового dependency
  cache/worktree.
- Next loop: окремо дослідити pnpm store, Windows junction strategy, filtered install
  для `@sergeant/web` + server dependencies.

### BRJ-004: Локальні env gaps очікувано деградують AI/push/backup paths

- Type: env gap, not product finding in this run.
- Evidence: local warnings for missing `ANTHROPIC_API_KEY`, `REDIS_URL`,
  `VAPID_PUBLIC_KEY`, `NUTRITION_BACKUP_KEY_SECRET`, `SENTRY_DSN`.
- Impact: live AI answer, push subscription, nutrition backup, global Redis rate limit
  не були підтверджені цим локальним loop.
- Next loop: staging/live env smoke з тестовими secrets і sanitized evidence.

### BRJ-005: Better Auth/Postgres connection timeout шум у extended run

- Type: reliability signal.
- Evidence: під час `navigation-offline-sw.spec.ts` після pass з'являвся
  `DrizzleQueryError` / `Connection terminated due to connection timeout` у Better Auth
  session lookup.
- Impact: UX test passed, але лог не чистий; це варто винести в DB/session reliability
  loop.
- Next loop: окремо зібрати server logs, pool settings, Docker Postgres health, and
  session lookup retry behavior.

## Що можна чесно стверджувати

- Ledger, critical smoke groups A-C, hash redirect, offline/PWA extended proof пройшли
  у Chromium production preview.
- UI chat was tested in local degraded mode: chat surface opens, API failure is shown
  as retryable UX.
- Deep CRUD inside every module was not exhaustively proven by this loop; current smoke
  coverage for core modules is mainly cold-load and shell proof.
- Native mobile and Capacitor are outside this loop.
