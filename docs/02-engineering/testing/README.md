# Testing

> **Last validated:** 2026-06-06 by @claude (bulk-bump artifact corrected — file was content-modified 2026-06-02 adding Property-based testing row; date was still showing the 2026-05-13 batch-bump). **Next review:** 2026-09-06.
> **Status:** Active

Meta-документація на тестову стратегію Sergeant — правила, threshold-и, як додавати
нові скоупи покриття. Тести самі живуть у `apps/web/src/**/*.test.ts(x)`,
`apps/server/src/**/*.test.ts`, `apps/mobile/__tests__/`, `apps/web/e2e/`.

## Документи

> Stryker mutation testing meta-doc (`mutation.md`) було видалено разом з cloudSync v1 engine у PR #052b (commit `a97b8cc8` — `chore(web): retire cloudSync Stryker mutation infra`). CloudSync-v1 mutation scope більше не релевантний, але tier-1 mutation testing повернуто для shared utils: `packages/shared/stryker.utils.conf.json` мутує `src/utils/{macros,date}.ts`, weekly workflow `.github/workflows/mutation-testing.yml` публікує HTML + JSON artifact.

## Тестові шари — як вони лежать

| Шар               | Локація                                              | Тулінг                                       |
| ----------------- | ---------------------------------------------------- | -------------------------------------------- |
| Unit              | `apps/{web,server,mobile}/src/**/*.test.ts(x)?`      | Vitest                                       |
| Integration       | `apps/server/src/**/*.integration.test.ts`           | Vitest + testcontainers                      |
| E2E (web)         | `apps/web/e2e/`                                      | Playwright                                   |
| E2E (mobile)      | `apps/mobile/e2e/`                                   | Detox                                        |
| Critical-flow CI  | `apps/web/e2e/` + `playwright.smoke.config.ts`       | Playwright (canary on every PR)              |
| Visual regression | `apps/web/e2e/visual/`                               | Argos + Playwright                           |
| Property-based    | `packages/shared/src/utils/*.property.test.ts`       | Vitest (seeded PRNG; fast-check pending dep) |
| Mutation          | `packages/shared/stryker.utils.conf.json`            | Stryker + vitest-runner                      |
| Performance       | `tests/perf/` (Lighthouse CI у `.github/workflows/`) | Lighthouse, web-vitals                       |

## Flaky-test quarantine

Проактивний механізм проти flaky-тестів (item #20) — суто на наявному тулінгу
(Vitest), без нових залежностей.

### 1. CI-only retry (перший рівень захисту)

`baseVitestConfig.test.retry` у [`packages/config/vitest.base.js`](../../../packages/config/vitest.base.js)
виставлено в `process.env.CI ? 1 : 0`. Той самий inline-знак продубльовано в
[`apps/web/vitest.config.js`](../../../apps/web/vitest.config.js) та
[`apps/server/vitest.config.ts`](../../../apps/server/vitest.config.ts) (вони не
спредять `baseVitestConfig`, а збирають свій `test`-блок вручну).

- **На CI:** тест, що впав, виконується ще раз. Стабільний тест ніколи не
  ретраїться. Тест, який зеленіє лише з другої спроби, Vitest позначає як
  `flaky` у підсумку запуску — це сигнал на тріаж, а не «зелено й забули».
- **Локально:** `retry: 0` — flake не маскується, поки ти пишеш тест.

Retry приховує транзієнтні timing-флапи (throttled-раннери), але **не лікує
справді зламаний тест** — обидві спроби мусять зійтися.

### 2. Quarantine-конвенція (другий рівень — для відомих flaky)

Коли тест флапає системно (видно в CI-summary як `flaky` кілька разів):

1. Познач його `it.skip(...)` (або `describe.skip`) і додай поряд коментар
   `// QUARANTINE: <причина> — <issue/PR посилання> — <дата>`.
2. Додай рядок у таблицю нижче.
3. Заведи follow-up issue на корінь проблеми. Quarantine — тимчасовий, не
   постійний прихисток: ціль таблиці — щоб вона була **порожньою**.

Не використовуй `it.skip` без рядка в таблиці — інакше тест тихо зникає назавжди.

| Тест (файл → назва) | Причина flake | Issue | У карантині з |
| ------------------- | ------------- | ----- | ------------- |
| _(порожньо)_        | —             | —     | —             |

## Coverage ratchet (apps/web + apps/server)

Поверх статичних line-floors (`coverage-thresholds.json` + `thresholds` у
vitest-конфігах) працює **ratchet-гейт «не гірше ніж зараз»** для `apps/web`
і `apps/server`:

- **Baseline:** [`coverage-ratchet.json`](../../../coverage-ratchet.json)
  (repo root) — останній зафіксований `total.lines.pct` кожного workspace-у.
- **Гейт:** крок `Coverage ratchet` у job `coverage`
  (`.github/workflows/ci.yml`) запускає
  [`scripts/ci/coverage-ratchet.mjs`](../../../scripts/ci/coverage-ratchet.mjs)
  після `pnpm test:coverage`. Падає, якщо покриття нижче
  `baseline − 0.5пп` (epsilon поглинає шум v8-інструментації).
- **Auto-bump:** коли покриття зросло, скрипт переписує baseline, а наступний
  CI-крок комітить bump у PR-гілку від імені `github-actions[bot]`
  (тільки same-repo PRs; push із `GITHUB_TOKEN` не тригерить новий CI-ран).
- **CI-only навмисно:** локальний повний suite на Windows флакі
  (heavy-command guard блокує локальний `pnpm test`), тому жоден локальний
  скрипт/hook ratchet не викликає — джерело істини лише CI-ран.
- **Свідоме зниження:** якщо покриття легітимно падає (видалення добре
  покритого коду тощо) — знизь число в `coverage-ratchet.json` у тому ж PR
  і обґрунтуй у описі.

Відмінність від floors: floors — ручна нижня межа (страхує інші workspaces),
ratchet — автоматична «гребінка», що рухається тільки вгору.

## Cross-links

- Initiative 0009 (Agent OS hardening, M3 — testing posture): [`docs/90-work/initiatives/archive/_0009-agent-os-hardening.md`](../../90-work/initiatives/archive/_0009-agent-os-hardening.md).
- Testing & DevX PR-план 2026-05: [`docs/90-work/planning/pr-plan-testing-devx-2026-05.md`](../../90-work/planning/archive/pr-plan-testing-devx-2026-05.md) — активні картки T-1…T-8 + D-1…D-4, dependency-граф, acceptance gates.
- Web deep-dive §7 (testing diagnostic): [`docs/90-work/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../../90-work/audits/archive/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md).
- Critical-flow E2E config: [`apps/web/playwright.smoke.config.ts`](../../../apps/web/playwright.smoke.config.ts) (job `critical-flow` у `.github/workflows/ci.yml` запускає `--grep @critical`).
