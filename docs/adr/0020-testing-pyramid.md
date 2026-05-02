# ADR-0020: Testing pyramid — unit / integration / a11y / smoke-e2e

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`AGENTS.md`](../../AGENTS.md) — Module ownership map → колонка "Test stack" per path.
  - [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — jobs `check`, `coverage`, `a11y`, `smoke-e2e`, `commitlint`, `migration-lint`, `secret-scan`.
  - [`apps/web/vitest.config.js`](../../apps/web/vitest.config.js), [`apps/server/vitest.config.ts`](../../apps/server/vitest.config.ts) — per-package coverage floors.
  - [`apps/web/playwright.config.ts`](../../apps/web/playwright.config.ts) (a11y), [`apps/web/playwright.smoke.config.ts`](../../apps/web/playwright.smoke.config.ts) (smoke).
  - [`apps/web/src/test/msw/`](../../apps/web/src/test/msw/) — MSW handlers + setupServer (web fetch mocking).
  - [`apps/server/src/modules/mono/read.integration.test.ts`](../../apps/server/src/modules/mono/read.integration.test.ts) — приклад Testcontainers integration.
  - PR-історія: MSW [#729](https://github.com/Skords-01/Sergeant/pull/729), Testcontainers [#728](https://github.com/Skords-01/Sergeant/pull/728), Playwright a11y/smoke [#717](https://github.com/Skords-01/Sergeant/pull/717), serializer snapshots [#718](https://github.com/Skords-01/Sergeant/pull/718).

---

## 0. TL;DR

Sergeant використовує **5 рівнів тестів**, кожен з explicit-тригером і власним gate-ом у CI. Без міксу — кожен рівень тестує свій invariant, не дублює інших.

| Layer                | Stack                                                         | Run                                                       | Gate (CI job) | Покриває                                          |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | ------------- | ------------------------------------------------- |
| 1. Unit              | Vitest (web, server, packages); `node --test` (eslint-plugin) | `pnpm test`                                               | `check`       | Pure functions, hooks, утіліти, ESLint-rules.     |
| 2. Component         | Vitest + React Testing Library + MSW (`web`)                  | `pnpm test`                                               | `check`       | React-компоненти + хуки, що викликають `fetch`.   |
| 3. Integration       | Vitest + Testcontainers (real Postgres) (`server`)            | `pnpm test` (suffix `.integration`)                       | `check`       | Серверні serializer-и, мутаційні endpoint-и, RLS. |
| 4. a11y (Playwright) | Playwright + axe-core (Chromium)                              | `pnpm test:a11y`                                          | `a11y`        | WCAG `serious`/`critical` violations on Hub.      |
| 5. Smoke E2E         | Playwright + Postgres + API + Web preview                     | `pnpm exec playwright test -c playwright.smoke.config.ts` | `smoke-e2e`   | Login → dashboard → транзакція → digest, ~15 хв.  |

Per-package coverage floors enforced (`server`: lines 65 / branches 74 / fns 69; `web`: lines 15 / branches 63 / fns 50; baseline-2pp). Зниження floor-у — окремий PR з обґрунтуванням.

---

## ADR-10.1 — Чому 5 шарів, а не один Cypress / E2E-тільки

### Status

accepted.

### Context

З огляду на rule-of-thumb «E2E-тести коштують у 10× більше, ніж unit», 80%+ покриття логіки на рівні E2E неможливе економічно. До формалізації pyramid-а у нас було:

- ~80% Vitest-юнітів (без розрізнення component / integration).
- 0 Testcontainers — серверні тести використовували mock-і `pool.query`, що ламалося від реальних SQL-rules (RLS, foreign keys).
- 0 Playwright — a11y і smoke жили "in QA's head".

Симптоми:

1. **RLS regression-и** ([#788](https://github.com/Skords-01/Sergeant/issues/788) — model hallucination видалила чужу транзакцію). Mock-and `pool.query` пропустив, що `RLS POLICY` блокувала би запит на real-Postgres.
2. **Serializer-shapes drift-или** — bigint→string регресії (rule #1 у `AGENTS.md`). Snapshot-тест на real-data row би зловив; mock-data — не зловив.
3. **a11y violations** на проді — кнопка без `aria-label`, focus trap у dialog зламаний. axe-core у браузері би зловив.
4. **Login flow ламався** мовчки після зміни Better Auth headers — без E2E юзер бачив 401, але smoke-test би зловив за 30 секунд.

### Decision

**5-шарова піраміда:**

#### 1. Unit (Vitest, ~3 с per package)

Pure functions, домен-логіка, ESLint-rules. **Без I/O, без `fetch`, без DOM, без React.** Файл-pattern `*.test.{ts,tsx,mjs}` (для ESLint-плагіна — `__tests__/*.test.mjs` через `node --test`, бо плагін на чистому Node).

Місце:

- `packages/{shared,api-client,insights,*-domain}/**/*.test.ts`
- `apps/server/src/modules/**/*.test.ts` без I/O (utility helpers)
- `apps/web/src/shared/**/*.test.ts`

#### 2. Component (Vitest + RTL + MSW, ~5 с per file)

Поведінка React-компонентів та хуків, що ходять у мережу. MSW (`apps/web/src/test/msw/`) перехоплює `fetch` на boundary `apps/web` → API. Кожен handler в `handlers.ts` дзеркалить серверну форму response-у; це **не** integration-test (DB не задіяна), але це більш ніж unit (повноцінний render + interaction).

Місце:

- `apps/web/src/modules/**/*.test.tsx`
- `apps/web/src/core/**/*.test.tsx`

Setup — `apps/web/src/test/setup.ts` (`server.listen()` / `server.resetHandlers()` / `server.close()`).

#### 3. Integration (Vitest + Testcontainers, ~30 с per file)

Серверні endpoint-и проти **real Postgres** через Testcontainers. Файл-pattern `*.integration.test.ts` — vitest-config exclude-ить його з `pnpm test` за замовчуванням, runs окремо в CI-job `check`.

Покриває:

- Snapshot-shapes serializer-ів (виявляє rule #1 violations).
- RLS policies (виявляє #788-style баги).
- Sequential migrations (auto-apply у Testcontainers fixture; ловить broken migration).
- Mono webhook idempotency.

Файл `apps/server/src/modules/mono/read.integration.test.ts` — еталон.

#### 4. a11y (Playwright + axe-core)

`apps/web/playwright.config.ts` → `tests/a11y/axe.spec.ts`. Запускається у Chromium на 4 ключових поверхнях Hub-у (Hub home, Finyk home, Fizruk home, Profile). Falи build при WCAG `serious` / `critical` violations.

CI-job `a11y` — окремий, паралельно з `check` (без `needs:`, щоб lint-fail не приховував a11y-fail).

#### 5. Smoke E2E (Playwright)

`apps/web/playwright.smoke.config.ts` → `tests/smoke/`. Бoot-ить:

- Postgres (services у GitHub-Actions).
- API server (`@sergeant/server` :3000).
- Web preview (`@sergeant/web` :4173, build first).

Запускає **golden-path** flow: login → dashboard → створити транзакцію → перевірити digest. Час — ~15 хв на CI-runner. Job `smoke-e2e` теж паралельний `check`.

### Consequences

**Позитивні:**

- Кожен баг має «правильний» рівень тесту: serializer drift → integration; a11y → Playwright + axe; full flow regression → smoke. Не доводиться bloat-ити unit-тести симуляціями DB.
- Per-layer час: unit < 3 с, integration < 30 с per file, smoke 15 хв — розробник запускає лише потрібний layer локально.
- 5 окремих CI-jobs запускаються паралельно — час до мерджа залежить від найдовшого, не від суми.

**Негативні:**

- 5 stack-ів = 5 наборів configuration. Розробник, який нiколи не писав Playwright, не одразу починає писати a11y-тести. Mitigation: module ownership map у `AGENTS.md` фіксує, який stack — для якого path.
- Testcontainers за дизайном повільні (Docker pull + Postgres warmup). Тримаємо integration-тести під 100 (один Postgres на whole-suite через `globalSetup`), не per-test.

### Alternatives considered

1. **Лише Cypress E2E (один stack).**
   Економічно не тягнемо: Cypress runner ~1 хв per test, при 200 тестах це 3+ години у CI. Також Cypress погано тестує bigint-coercion і RLS — він на UI-рівні.
2. **Storybook + Chromatic для component layer.**
   Окрема платна підписка ($$$), зайвий vendor. Vitest + RTL + MSW — open-source і працює.
3. **Контракт-тестування (Pact / OpenAPI).**
   Працює для API drift, але не покриває логіку. Розглянемо коли openapi-driven `api-client` (PR-4.D) приземлиться — окремий ADR.

---

## ADR-10.2 — Per-package coverage floors з 2pp буфером

### Status

accepted.

### Context

Команда раніше використовувала `coverage: 80%` як global threshold. Реальність:

- `apps/server` пишеться навколо PG-row-shapes, де branch-coverage natural-ish ~76%. Ставити 80% — змусило б писати «фальшиві» if-branch-тести.
- `apps/web` має коли ~17% line coverage — переважно UI-glue, що не testable у unit (component layer ще не мігрував у RTL). 80% — недостижимий ниж'я найближчого року.
- `packages/*-domain` — pure functions, легко 100%. 80% розслабляє.

Глобальний threshold або занадто слабкий, або занадто сильний.

### Decision

**Per-package coverage floors з ~2pp буфером від baseline.** Кожен `vitest.config.{js,ts}` декларує:

```ts
thresholds: {
  // Baseline (YYYY-MM-DD): lines X.YZ / branches Y.YZ / fns Z.YZ.
  // Floors set ~2pp below baseline to absorb flake; raise per sprint.
  lines: ⌊baseline⌋ - 2,
  branches: ⌊baseline⌋ - 2,
  functions: ⌊baseline⌋ - 2,
  statements: ⌊baseline⌋ - 2,
}
```

Drop coverage нижче floor-у → CI-job `coverage` fail-ить. Нижчий floor — окремий PR з обгрунтуванням (зазвичай — велика legacy-частина переміщена з web → packages).

`scripts/strict-coverage.mjs` (PR-6.F, [#872](https://github.com/Skords-01/Sergeant/pull/872)) додатково публікує `$GITHUB_STEP_SUMMARY` із coverage % per package — для visualization у PR.

### Consequences

**Позитивні:**

- Реалістичний baseline-driven gate, не фантастичний.
- 2pp буфер абсорбує flake (новий тест мав 79% при baseline 80% — не завадить).
- Per-package поле — модулі прогресують у власному темпі.

**Негативні:**

- Розсихання baseline ↔ floor — потрібно вручну апдейтити, коли coverage надовго стабілізується вище. Поки робимо раз на спринт.

### Alternatives considered

— **Codecov / Coveralls integration з historical-baseline.** Зовнішній сервіс. Поки не потрібен; per-package floor + step-summary вистачає.

---

## ADR-10.3 — Flaky-test policy

### Status

accepted.

### Context

3 відомі flaky тести в `apps/mobile/src/core/**` (документовані в `AGENTS.md`). Без policy flaky тести або тихо ігноруються (`test.skip`), або blow-out CI 4 рази підряд, або retry-mask-ять real regression.

### Decision

1. **Документуй flaky тест у `AGENTS.md`** (поточний формат — список path-ів з reason). Без entry — flaky тест не має права жити в репі.
2. **Тікет на стабілізацію** з owner-ом (`PR-7.E` на triage існуючих 3-х).
3. **Stabilization-PR-template** у `docs/playbooks/stabilize-flaky-test.md` — чек-ліст: відтворення локально (loop 100×), root cause, fix, переконатися що 200 запусків поспіль зелені.
4. **CI retry лише для `smoke-e2e`** (1 retry) — по-перше, цей шар реально transient через мережу/postgres-init; по-друге, інші lay-и не мають retry (real regression стає видимим одразу).

### Consequences

**Позитивні:**

- Flaky test-и видимі — список у `AGENTS.md` тримає їх в одному місці.
- Smoke-e2e retry поглинає Docker-warmup transient-и.

**Негативні:**

- Без proactive stabilization-PR-ів flaky list може рости. Обмежуємо до ~5 одночасно.

### Alternatives considered

— **Vitest `retry` per test-file.** Бере неприпустимий ризик: маскує real-bug. У нас `retries: 0` за дизайном для unit/component/integration.

---

## Implementation status

- ✅ Vitest configs з per-package coverage floors (server, web, mobile-shell).
- ✅ MSW у `apps/web/src/test/msw/` (handlers + setupServer + setup.ts).
- ✅ Testcontainers (`apps/server/src/modules/**/*.integration.test.ts`).
- ✅ Playwright a11y (`apps/web/playwright.config.ts`).
- ✅ Playwright smoke (`apps/web/playwright.smoke.config.ts`).
- ✅ ESLint-plugin тести через `node --test` (`packages/eslint-plugin-sergeant-design/__tests__/*.test.mjs`).
- ✅ `scripts/strict-coverage.mjs` для $GITHUB_STEP_SUMMARY.
- ✅ AGENTS.md module ownership map → "Test stack" колонка.
- ⏳ Flaky-test triage (`PR-7.E`) — 3 mobile тести.
- ⏳ Weekly flaky-tests dashboard (`PR-7.D`) — пropose в audit doc.

## Open questions

- **Mutation testing (Stryker).** Високий ROI для domain-packages (`packages/*-domain` — pure functions, 100%-line-coverage). Чи є branch-coverage реальним indicator-ом? Mutation-testing би показав. Поки відкладено — не критично при 100%-line.
- **Visual regression (Chromatic / Percy).** Ловить CSS-regress на kомпонентах, які a11y-axe не зловить. Платно, vendor-lock. Вирішимо після PostHog rollout.
- **Contract testing.** Коли `api-client` стане openapi-driven (PR-4.D), додамо per-endpoint contract-тест. Окремий ADR при потребі.
