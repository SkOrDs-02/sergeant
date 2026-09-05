# Testing

> **Last validated:** 2026-06-06 by @claude (bulk-bump artifact corrected — file was content-modified 2026-06-02 adding Property-based testing row; date was still showing the 2026-05-13 batch-bump). **Next review:** 2026-12-05.
> **Status:** Active

Meta-документація на тестову стратегію Sergeant — правила, threshold-и, як додавати
нові скоупи покриття. Тести самі живуть у `apps/web/src/**/*.test.ts(x)`,
`apps/server/src/**/*.test.ts`, `apps/mobile/__tests__/`, `apps/web/tests/`.

## Документи

| Документ                                                       | Про що                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`smoke-tests.md`](./smoke-tests.md)                           | Critical-flow smoke-сюїта: що покрито, як запускати, як розширяти.                 |
| [`pact-drift-runbook.md`](./pact-drift-runbook.md)             | Реакція на розходження contract-тестів (Pact drift).                               |
| [`2026-05-05-tests-pr-plan.md`](./2026-05-05-tests-pr-plan.md) | Історичний план PR-серії з тестів (травень 2026).                                  |
| [`2026-05-05-tests-review.md`](./2026-05-05-tests-review.md)   | Ревʼю тестового покриття на ту саму дату.                                          |
| [`verification/`](./verification/README.md)                    | Повторювані комплекти, профілі, сценарії та шлях передачі результатів між сесіями. |

> Stryker mutation testing meta-doc (`mutation.md`) було видалено разом з cloudSync v1 engine у PR #052b (commit `a97b8cc8` — `chore(web): retire cloudSync Stryker mutation infra`). CloudSync-v1 mutation scope більше не релевантний, але mutation testing повернуто поетапно: tier-1 — `packages/shared/stryker.utils.conf.json` (`src/utils/{macros,date}.ts`) і `apps/server/stryker.normalizers.conf.json` (нормалізатори food-провайдерів); tier-2 (2026-08) — `packages/finyk-domain/stryker.core.conf.json` (грошова доменна логіка: budget, debtEngine, balanceReconciliation, transferMatching, monoCardDebt) і `apps/web/stryker.time.conf.json` (Kyiv/DST time-утиліти). Weekly workflow `.github/workflows/mutation-testing.yml` (Пн 06:00 UTC + `workflow_dispatch`) публікує HTML + JSON artifact на кожну ціль; червоний cron-прогін створює/оновлює idempotent issue з label `mutation-testing` (той самий патерн, що `pact-drift.yml`).

## Тестові шари — як вони лежать

| Шар               | Локація                                                                                                                                                           | Тулінг                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unit              | `apps/{web,server,mobile}/src/**/*.test.ts(x)?`                                                                                                                   | Vitest                                       |
| Integration       | `apps/server/src/**/*.integration.test.ts`                                                                                                                        | Vitest + testcontainers                      |
| E2E (web)         | `apps/web/tests/{a11y,ledger,mobile,smoke}/`                                                                                                                      | Playwright (по конфігу на сюїту)             |
| Route-ledger      | `apps/web/tests/ledger/` + `playwright.ledger.config.ts`                                                                                                          | Playwright (nightly 01:00 UTC)               |
| E2E (mobile)      | `apps/mobile/e2e/` — ⛔ **заморожено**, див. нижче                                                                                                                | Detox                                        |
| Critical-flow CI  | `apps/web/tests/smoke/` + `playwright.smoke.config.ts`                                                                                                            | Playwright (canary on every PR)              |
| Visual regression | `apps/web/tests/a11y/` + `playwright.visual.config.ts`                                                                                                            | Playwright (лише локально — див. нижче)      |
| Property-based    | `packages/shared/src/utils/*.property.test.ts`                                                                                                                    | Vitest (seeded PRNG; fast-check pending dep) |
| Mutation          | `stryker.*.conf.json`: `packages/shared` (tier-1 utils), `apps/server` (tier-1 normalizers), `packages/finyk-domain` (tier-2 core), `apps/web` (tier-2 kyiv time) | Stryker + vitest-runner                      |
| Mutation ratchet  | `mutation-ratchet.json` + `scripts/ci/mutation-ratchet.mjs`                                                                                                       | Node (джоба `mutation-ratchet`)              |
| Over-mock cap     | `vi-mock-baseline.json` + `scripts/ci/check-vi-mock-cap.mjs`                                                                                                      | Node (у складі `pnpm lint`)                  |
| Performance       | `apps/web/lighthouserc.json` + `.github/workflows/lighthouse-ci.yml`                                                                                              | Lighthouse CI, web-vitals                    |

> **Visual regression запускається лише локально** — `pnpm --filter @sergeant/web test:visual`.
> Воркфлоу `.github/workflows/visual-regression.yml` (і Argos-інтеграцію) прибрано рішенням
> [ADR-0082](../../04-governance/adr/0082-private-storage-repo-posture.md) §4, тож у CI цей шар не проганяється.

## ⛔ Mobile quality gates — заморожено (web-first)

Detox E2E (13 сьютів), coverage-floor `apps/mobile` і parity-тести mobile
sqliteWriter **свідомо не є активними гейтами** з 2026-08-25: мобільні
застосунки запускаємо лише якщо web доведе потребу в продукті. Це продуктове
рішення, а не забутий борг — повний обсяг, причини і **порядок розморозки** живуть
у [`docs/90-work/tech-debt/mobile.md`](../../90-work/tech-debt/mobile.md), блок
«Оновлено 2026-08-25». Сьюти в `apps/mobile/e2e/` не видаляємо: вони актив на
момент розморозки. Не заводь PR на «полагодити Detox», доки заморозку не знято.

## Route-ledger lane (nightly)

[`.github/workflows/web-route-ledger.yml`](../../../.github/workflows/web-route-ledger.yml)
— щоночі о 01:00 UTC ганяє `apps/web/tests/ledger/user-story-ledger.spec.ts`:
49 web-маршрутів, `/api/**` замокано, для кожного маршруту перевіряється видимий
корінь і **відсутність** `pageerror` / fatal console-помилок. Локально —
`pnpm --filter @sergeant/web e2e:ledger`.

**Що саме він ловить і чому це не дублює `@critical` smoke.** Critical-flow
перевіряє, що кілька ключових сценаріїв працюють наскрізь проти реального
сервера; route-ledger — що **жоден із 49 маршрутів не падає в білий екран на
буті**. Це різні класи: white-screen-регресія проходить повз typecheck, юніти і
навіть повз smoke, якщо ламає маршрут поза happy-path-ом. Прецедент
задокументовано в [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md) — розділ про
`AuthContext × @sergeant/shared`, де runtime-import перекроював eager-чанки і
застосунок не рендерився взагалі.

**Знахідка 2026-08-25 — очікування було майже порожнім.** До цієї дати спека
чекала на `main, [role='main'], [data-a11y-root], #root > *`. Але `AppShell`
([`RootLayout.tsx:150`](../../../apps/web/src/core/app/RootLayout.tsx)) першим
прямим нащадком `#root` рендерить `<SkipLink />`, а його клас `sr-only` навмисно
**не** `display: none` (елемент має лишатись у a11y-дереві) — тобто має
ненульовий 1×1 бокс і для Playwright **видимий**. Union-локатор резолвиться в
порядку документа, тож `.first()` завжди чіплявся за skip-link: очікування
завершувалось у мить монтування шелу, ще до рендеру `<Outlet/>`, і маршрут, який
не відрендерив нічого, гейт проходив. Виправлено на
`#root > *:not(.sr-only)`. **Урок:** `sr-only` ≠ невидимий для браузерного
драйвера; будуючи «сторінка щось відрендерила»-асерт, виключай візуально
приховані службові елементи явно.

## Mutation ratchet

`thresholds.break: 70` у кожному `stryker.*.conf.json` — це підлога, а не
храповик: score міг просісти з 95 до 71 без жодного червоного прогону. Тому
джоба `mutation-ratchet` у
[`.github/workflows/mutation-testing.yml`](../../../.github/workflows/mutation-testing.yml)
після всіх чотирьох таргетів рахує score з їхніх Stryker-JSON і звіряє з
[`mutation-ratchet.json`](../../../mutation-ratchet.json) — за тією ж логікою, що
й coverage-ratchet: просідання понад `epsilonPp` = червоно, сіра зона = pass,
зростання = кандидат на bump.

Формула канонічна Stryker: `(Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) × 100`;
`Ignored` і `CompileError` у знаменник не входять, порожній знаменник → `score: null`.

Три свідомі рішення: (1) baseline-и стартують як `null` — «ще не виміряно»: гейт
друкує число і проходить, поки власник не внесе його руками або через `--bump`
(прогнати Stryker при написанні гейта було нічим); (2) **немає автокоміту**
baseline-у з крона — weekly-прогін ходить по `main`, і автоматичний запис у
`main` нам не потрібен; (3) гейт **fail-closed**: відсутній або непарсабельний
звіт = `exit 1`, бо падіння самого Stryker не має тихо ставати зеленим гейтом.
Просідання score підхоплює наявна джоба `report-red-run` і кладе в ту саму
ідемпотентну issue з label `mutation-testing`.

## Over-mock cap (`vi.mock` baseline)

Аудит 2026-08-04 зафіксував over-mocking у web page-тестах: файли, де все
застаблено до `<div data-testid>`, асерти зводяться до «монтується без краху», а
контракт props сторінка↔дитина не захищений. Механічного стримування не було,
тож борг міг лише рости. [`scripts/ci/check-vi-mock-cap.mjs`](../../../scripts/ci/check-vi-mock-cap.mjs)
(у складі `pnpm lint`) тримає храповик: cap — 5 моків на файл, наявні порушники
записані у [`vi-mock-baseline.json`](../../../vi-mock-baseline.json) з поточними
числами і можуть лише **зменшуватись**, новий файл понад cap = червоно.

**Фактичні числа (замір 2026-08-25, 1977 просканованих тестових файлів):** 69
файлів понад cap — 61 у `apps/web/src`, 8 у `apps/server/src`; `packages/**` і
`apps/mobile-shell` дають нуль порушень, `apps/mobile` працює на `jest.mock` і в
скоуп не потрапляє. Хвіст плаский: 30 із 69 записів — це рівно 6–7 моків, тобто
щойно за порогом. Топ-5: `NutritionApp.extra.test.tsx` 36,
`FinykApp.extra.test.tsx` 26, `server/src/index.test.ts` 25,
`AddMealSheet.test.tsx` 21, `cross-domain-routes.contract.test.ts` 20.

> **Поправка до аудиту.** Аудит називав рекордсменами `NutritionApp.test.tsx`
> (37), `FinykApp.test.tsx` (26) і `RootLayout.test.tsx` (26). Ці файли
> існують, але важкі моки лежать не в них: `NutritionApp.test.tsx` має **2**
> моки, а 36 — у сусідньому `NutritionApp.extra.test.tsx`; те саме з
> `FinykApp` (1 проти 26). `RootLayout.test.tsx` має **12**, а не 26. Тобто
> числа аудиту правильні за величиною, але приписані не тим іменам — імовірно,
> зріз робився до розщеплення файлів на `.extra`-сіблінги. **Baseline
> згенеровано з реального прогону, а не з чисел аудиту** — саме тому цифра 69,
> а не 62.

Це навмисно **не** правило в `eslint-plugin-sergeant-design`: зміна ESLint
design-правил тягне bump harness-версії і governance-синхронізацію, а тут
потрібен простий baseline-храповик. Правильна реакція на червоний гейт — не
«додати файл у baseline», а замінити моки на MSW-інтеграційний тест (інфра вже
є в репо).

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

### Floor-гейт (fail-closed) — той самий скрипт, `--floors`

Крок `Check coverage threshold` у job `coverage` запускає
`node scripts/ci/coverage-ratchet.mjs --floors`: кожен workspace, перелічений
у [`coverage-thresholds.json`](../../../coverage-thresholds.json) (крім
`apps/mobile` — web-focus skip), **мусить** мати
`coverage/coverage-summary.json`, інакше job червоний. До 2026-08-04 гейт був
shell-циклом, що глобив лише наявні summary — workspace, який переставав
емітити coverage (наприклад, після втрати `json-summary` репортера у
vitest-конфігу), тихо випадав з гейта (fail-open діра, аудит
[`2026-08-04-test-coverage-depth-audit.md`](../../90-work/audits/2026-08-04-test-coverage-depth-audit.md)).
Workspace-и з summary, але без явного floor-а гейтяться за `default`. Тим же
аудитом floors ратчетнуто до факт−5пп і додано всі domain-packages
(до того вони сиділи на default 75 при факті 97–100%).

## Cross-links

- Initiative 0009 (Agent OS hardening, M3 — testing posture): [`docs/90-work/initiatives/archive/_0009-agent-os-hardening.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0009-agent-os-hardening.md).
- Testing & DevX PR-план 2026-05: [`docs/90-work/planning/pr-plan-testing-devx-2026-05.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/pr-plan-testing-devx-2026-05.md) — активні картки T-1…T-8 + D-1…D-4, dependency-граф, acceptance gates.
- Web deep-dive §7 (testing diagnostic): [`docs/90-work/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md).
- Critical-flow E2E config: [`apps/web/playwright.smoke.config.ts`](../../../apps/web/playwright.smoke.config.ts) (job `critical-flow` у `.github/workflows/ci.yml` запускає `--grep @critical`).
