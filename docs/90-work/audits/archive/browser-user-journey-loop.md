# Browser user journey loop

> **Last validated:** 2026-07-19 by Codex. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/audits/browser-user-journey-loop.md`.

## Мета

Перевірити Sergeant як веб-користувач, а не лише як набір unit-тестів:
кожна важлива user story має мати браузерний proof, де користувач бачить
екран, виконує дію, отримує очікуваний результат і не ловить fatal browser
error. Loop є продовженням `user-story-loop.md` і
`production-readiness-testing-loop.md`.

## Жорсткі правила

1. Починати з актуального `origin/main` або явно названої PR/worktree.
2. Не логувати secrets, cookies, реальні user IDs або production data.
3. Browser-first: Playwright проти production preview build, не `vite dev`.
4. Selector order: role/label/text/testid; CSS і positional selectors тільки як
   last resort.
5. Не використовувати `waitForTimeout`; чекати стан через web-first assertions.
6. Не проходити sign-up/onboarding у `beforeEach`; для steady-state flows
   використовувати `seedFTUX`. UI auth тестувати тільки в auth-групі.
7. Кожен P0/P1/P2 finding має мати `id`, reproduction, fix або documented
   exception, і post-fix retest.
8. Не claim “усі user stories працюють”, якщо частина сценаріїв тільки
   змонтувалась без глибокої дії або потребує staging-only proof.

## Групи

### Група 0 — Baseline and ledger map

Мета: довести, що ledger валідний, існуючий browser smoke запускається, і є
карта gaps між `user-story-ledger.csv` та Playwright tests.

Команди:

- `node scripts/audits/validate-user-story-ledger.mjs`
- `pnpm --filter @sergeant/web exec playwright test --config playwright.ledger.config.ts --project chromium`
- `pnpm --filter @sergeant/web exec playwright test --config playwright.smoke.config.ts --project chromium --grep "@critical"`

Pass criteria:

- ledger валідний;
- ledger smoke green або має classified findings;
- critical smoke green або має classified findings;
- створено список journeys, які потребують глибшого browser proof.

### Група A — Entry, auth, onboarding, shell

Сценарії:

- cold `/` і `/welcome`;
- `/sign-in`, aliases `/login`, `/signin`, `/auth`;
- real auth smoke з UI sign-up/sign-in тільки в auth specs;
- onboarding happy path;
- hub dashboard, bottom nav, module entry/back;
- unknown route/404.

Pass criteria:

- користувач не застрягає в loader/onboarding loop;
- auth aliases ведуть у canonical route;
- module shell round-trip працює desktop Chromium;
- fatal browser errors відсутні або classified.

### Група B — Core modules

Сценарії:

- Finyk overview, transactions, add expense, PWA pending action;
- Nutrition start, log, pantry, menu, photo-degraded state;
- Routine start, stats, quick-create;
- Fizruk start, workouts, programs, progress/body;
- Insights/settings/reporting entry points.

Pass criteria:

- кожен модуль має хоча б один action-level browser proof;
- деградації API показують retryable/understandable state;
- user-facing copy не змішує сирі технічні помилки з UI.

### Група C — Chat and AI UX

Сценарії:

- `/chat` direct link;
- successful mocked assistant response;
- `/api/chat` 503/429/timeout;
- input re-enabled after failure;
- no duplicate send/double-submit after error;
- HubChat live smoke only when local/staging env supports it.

Pass criteria:

- чат не зависає;
- користувач бачить retryable assistant message;
- no fatal page errors;
- live provider path не claim-иться без real env proof.

### Група D — Offline, PWA, errors, accessibility

Сценарії:

- offline/service-worker smoke;
- PWA pending actions;
- public status/legal/pricing pages;
- error pages and NotFound;
- a11y axe smoke for representative routes.

Pass criteria:

- offline states не блокують базову навігацію;
- public pages render anonymously;
- axe smoke green або має classified exceptions;
- screenshots/traces збережені тільки on failure.

## Fix loop

Для кожного finding:

1. Записати failing command і короткий symptom.
2. Визначити owner skill (`sergeant-web-ui`, `sergeant-hubchat`,
   `better-auth-best-practices`, тощо).
3. Додати або виправити найменший browser/unit regression test.
4. Фіксити найменший product/UX defect без unrelated refactor.
5. Повторити failing scenario і neighboring scenario.
6. Оновити evidence: before → after.

## Evidence формат

| Field       | Value                                          |
| ----------- | ---------------------------------------------- |
| Date/time   | Europe/Kyiv timestamp                          |
| Group       | 0 / A / B / C / D                              |
| Environment | local / preview / staging                      |
| Command     | exact command, без secrets                     |
| Result      | passed / failed / blocked                      |
| Metrics     | tests passed, duration, fatal browser errors   |
| Artifacts   | trace, screenshot, report path, issue/PR link  |
| Findings    | BUG-BRJ-xxx або `none`                         |
| Next action | proceed / fix / retest / external proof needed |

## Handoff prompt

```text
Продовж Browser user journey loop у Sergeant.

Док: docs/90-work/audits/browser-user-journey-loop.md
Ledger: docs/90-work/audits/user-story-ledger.csv

Правила:
- Почни з sergeant-start-here + sergeant-e2e-testing; додай owner skill для
  touched surface.
- Працюй групами 0 -> A -> B -> C -> D.
- Playwright запускай проти preview build.
- Для steady-state використовуй seedFTUX; auth UI проходь тільки в auth group.
- Не використовуй waitForTimeout і fragile CSS selectors.
- Кожен defect отримує id, reproduction, fix/retest або exception.
- Не claim full browser readiness, якщо є staging-only/live-provider gaps.

Перший крок:
1. Перевір git status і актуальність base.
2. Запусти ledger validator.
3. Запусти ledger browser smoke і critical smoke.
4. Знайди найбільші gaps між ledger і action-level Playwright proofs.
5. Почни з найризиковішої групи, фіксуй evidence у dated execution log.
```
