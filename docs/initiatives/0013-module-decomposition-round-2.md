# 0013 — Module decomposition round 2 (`apps/web` allowlist drain)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-07.
> **Status:** In progress (Sprint 1 done, Sprint 2 частково: `Workouts.tsx` 744→213 ([PR #2530](https://github.com/Skords-01/Sergeant/pull/2530)), `LogCard.tsx` 736→216 ([PR #2530](https://github.com/Skords-01/Sergeant/pull/2530)), `Overview.tsx` ~750→139 ([PR #2547](https://github.com/Skords-01/Sergeant/pull/2547)), `HubDashboard.tsx` 837→115 ([`61e0093f`](https://github.com/Skords-01/Sergeant/commit/61e0093f))).
> **Priority:** P2 (subordinate to 0010-revenue-first-launch scope-freeze; pre-launch work паралельно лише на adjacent-touch — див. § Чому зараз)
> **Owner:** `@Skords-01`
> **ETA:** 3 sprints (≈3 тижні), **8–11 PR-ів** (по 1 PR на файл, плюс finalize-PR з drop-allowlist)
> **Sources:** [`docs/initiatives/archive/_0001-module-decomposition.md`](./archive/_0001-module-decomposition.md) (predecessor — Phase 3 closure 2026-05-04, carry-over список нижче), [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) (`LARGE_FILES` секція, що посилається сюди), [`AGENTS.md`](../../AGENTS.md) Hard Rule #18 (`max-lines: [error, 600]`).

## TL;DR

[`0001`](./archive/_0001-module-decomposition.md) закрилася 2026-05-04 з `5/6` критеріїв виконано. **Невиконаний критерій** — `≤2 файли в allowlist у apps/web/src/**` — лишився **11 файлами** (`Workouts`, `LogCard`, `FinykApp`, `NutritionApp`, `Cards`, `Subscriptions`, `Exercise`, `Progress`, `AssetsTable`, `RoutineCalendarPanel`, `hubChatContext` / `chatActions/fizrukActions`). Hard Rule #18 (`max-lines: [error, 600]`) тримає **новий** код під контролем — старий drift лишається, з deadline-коментарем у allowlist.

Ця ініціатива **drain-ує allowlist** до ≤2 файлів за такою ж per-file-PR схемою, як Phase 2 у 0001 (по 1 PR на файл, baseline + decomp + verify), плюс фінальний PR `decomp-round-2-finalize` що видаляє `overrides` allowlist цілком. Без нової авто-генерації коду — це pure structure refactor.

> **Drift reconciliation 2026-05-09:** початковий plan рахував 11 файлів; фактичний `eslint.config.js` allowlist на вході ревізії містив рівних 8: 6 з 11 в плані (`NutritionApp`, `hubChatContext`, `fizrukActions`, `AssetsTable`, `Progress`, `RoutineCalendarPanel`) + 2 неврахованих (`DailyPlanCard.tsx` 1228 LOC, `HubDashboard.tsx` 837 LOC). Ця ревізія: (1) декомпонує `DailyPlanCard.tsx` в окремому PR (Sprint 1 #5), (2) вилучає `Progress.tsx` (579 LOC) і `RoutineCalendarPanel.tsx` (602 LOC) з allowlist як вже проходять рул без override-у (skipBlankLines+skipComments вкладає їх у ≤5 99), (3) перераховує `FinykApp.tsx` як not-needed (641 raw але 537 effective), (4) додає `HubDashboard.tsx` як Sprint 2 дріфт-пункт. **Поточний allowlist після цієї ревізії: 5 файлів** (`NutritionApp`, `hubChatContext`, `HubDashboard`, `fizrukActions`, `AssetsTable`).

## Чому зараз

- 0010 (revenue-first launch) у scope-freeze до ≈2026-06-01 — **вся frontend-робота на adjacent-файлах має пройти через 600-LOC гард**. Кожен раз як developer торкається `Workouts.tsx` (717 LOC) у фічі для білінгу — він не може додати рядок без увімкнення override-у. Це ламає flow.
- Allowlist `eslint.config.js` зростає на drift: `0001` Phase 3 фіксував список 7 файлів; до closure-у виявилося **12** (drift-and-keep). Нинішній `pnpm lint:tech-debt-freshness` періодично нагадує про deadline, але без активного власника deadline лишається символічним.
- Регресія в монолітах: `RoutineApp.tsx` (745 LOC) вдалося декомпонувати в Phase 2 з `useReducer` + state-machine виносом — це **повторюваний рецепт** для решти `*App.tsx` файлів. Поки рецепт свіжий у пам'яті, треба застосувати його до `FinykApp` / `NutritionApp` / `Workouts` — інакше за 6 місяців ми його забудемо.
- Bundle-size: щонайменше 4 з 11 файлів — у `vendor-finyk` / `vendor-fizruk` chunk-ах. Decomp дозволить tree-shake-нути доменні sub-trees → +20-30 KB у `shared` (екстраполяція з Phase 2 measurement: −22 KB на `Icon.tsx`).

## Скоуп

**In:**

1. **Top-priority drain (sprint 1, 5 PR-и — було 4, +1 drift):**
   - `apps/web/src/modules/fizruk/pages/Workouts.tsx` (717 LOC) — **merged** ([#2002](https://github.com/Skords-01/Sergeant/pull/2002)).
   - `apps/web/src/modules/nutrition/components/LogCard.tsx` (580 LOC) — **merged**.
   - `apps/web/src/modules/fizruk/pages/Exercise.tsx` (≥600 LOC) — **merged** ([#2128](https://github.com/Skords-01/Sergeant/pull/2128)).
   - `apps/web/src/modules/finyk/FinykApp.tsx` (559 → 537 effective LOC) — **not needed** (вже проходить max-lines:600 з skipBlankLines+skipComments). Ризик drift назад тримається рулом — без окремого PR-у.
   - `apps/web/src/modules/nutrition/components/DailyPlanCard.tsx` (1228 → 405 LOC) — **ревізія 2026-05-09**: drift-пункт, не був вихідному плані але найбільший в allowlist (1228 LOC). Декомповано в 4 нових файли (`DailyPlanWarnings.tsx`, `DailyPlanMacros.tsx`, `DailyPlanMealRow.tsx`, `DailyPlanGoalSelectors.tsx`) + `lib/dailyPlanValidation.ts` для pure functions. Тести (`calcMacroKcalMismatch`, `calcGoalRangeIssues`) ре-експортуються з `DailyPlanCard.tsx` для BC.
2. **Drift drain (sprint 2, 5 PR-и — перелік оновлено):**
   - `apps/web/src/modules/nutrition/NutritionApp.tsx` (766 LOC).
   - `apps/web/src/core/lib/hubChatContext.ts` (681 LOC).
   - `apps/web/src/core/hub/HubDashboard.tsx` (837 LOC) — **ревізія 2026-05-09**: drift-пункт, не був у вихідному плані. Другий за розміром в allowlist після decomp-у `DailyPlanCard`.
   - `apps/web/src/core/lib/chatActions/fizrukActions.ts` (672 LOC).
   - `apps/web/src/modules/finyk/pages/AssetsTable.tsx` (671 LOC) — перенесено з sprint 3.
   - ~~`Cards.tsx` / `Subscriptions.tsx`~~ — already decomposed (вже не в allowlist; ревізія 2026-05-09).
3. **Long-tail (sprint 3) — видалено як not-needed:**
   - ~~`apps/web/src/modules/fizruk/pages/Progress.tsx`~~ — 579 raw LOC, 546 effective, вже проходить рул. Allowlist вилучено в ревізії 2026-05-09.
   - ~~`apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx`~~ — 602 raw LOC, 575 effective, вже проходить рул. Allowlist вилучено в ревізії 2026-05-09.
4. **Finalize PR (last)** — `decomp-round-2-finalize`: видалити `overrides` allowlist у `eslint.config.js` цілком (або привести до ≤2 файлів як closure для 0001 #2 критерію), оновити `LARGE_FILES` запис у [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md), закрити цю ініціативу як `Done` з Outcome-секцією.

**Out:**

- Нові фічі / зміни поведінки модулів — **strict refactor only**. Якщо при декомпозиції видно баг — окремий fix-PR попереду decomp-PR-у з reference сюди.
- `apps/web/vite.config.js` `manualChunks` re-tuning — окрема ініціатива (потенційно 0014-bundle-budget-per-route), коли 0006-routing міграція стартує.
- TS-strict опт-ін правила (`noUncheckedIndexedAccess` тощо) — це 0012 scope. Тут не торкаємо tsconfig.
- Server / mobile / mobile-shell декомпозиція — окремий scope, поки не визначений.

## План змін

### Sprint 1 — top-priority drain (5 PR-и — було 4, +1 drift)

Кожен PR — 1 файл, шаблон з 0001 Phase 2:

1. **Baseline** — `pnpm exec eslint apps/web/src/<file> --format json` + `pnpm build:analyze` (chunk size перед).
2. **Decomp** — extract sub-components у `apps/web/src/modules/<mod>/components/<NewName>.tsx`; extract hooks у `hooks/<useNewName>.ts`; extract utility-функції у `lib/`.
3. **Verify** — `pnpm test --filter @sergeant/web -- <module>`, `pnpm typecheck`, `pnpm lint`. Bundle-size delta у PR description.
4. **Allowlist drop** — видалити рядок з `overrides` блока у `eslint.config.js`.

PR-и:

- `decomp-r2-workouts` — `Workouts.tsx` (744 → 567 → 213) — **merged** ([#2002](https://github.com/Skords-01/Sergeant/pull/2002), commit `61a8afff`; далі [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530)).
- `decomp-r2-exercise` — `Exercise.tsx` (669 → 427) — **merged** ([#2128](https://github.com/Skords-01/Sergeant/pull/2128), commit `619381bb`); extract `LoadCalculator` + `ExerciseProgressChart` + `lib/numberFmt.ts`.
- `decomp-r2-logcard` — `LogCard.tsx` (736 → 533 → 216) — extract `MealRow` + `VirtualMealList`. **merged.** Далі [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530) (LogCardSearch + LogCardWeeklyTable + LogCardAnalytics).
- `decomp-r2-dailyplancard` — `DailyPlanCard.tsx` (1228 → 405) — **додано 2026-05-09**: extract `DailyPlanWarnings.tsx` (209) + `DailyPlanMacros.tsx` (105) + `DailyPlanMealRow.tsx` (127) + `DailyPlanGoalSelectors.tsx` (304) + `lib/dailyPlanValidation.ts` (139). **Ця ревізія.** Сюди ж — drop allowlist для `Progress.tsx` і `RoutineCalendarPanel.tsx` (вже проходять).
- ~~`decomp-r2-finykapp`~~ — not-needed (ревізія 2026-05-09): 641 raw LOC але 537 effective, проходить max-lines:600. Як drift-назад виявиться post-0010 — відкриємо окремий PR на 0014 або безпосередньо в 0010 фічі-PR-і (білінг торкає `FinykApp.tsx`).

### Sprint 2 — drift drain (5 PR-и)

Та сама схема, по 1 PR на файл. **Ревізія 2026-05-09:** Cards/Subscriptions вже decomposed; вводиться `HubDashboard` як drift-пункт; `AssetsTable` переноситься сюди з sprint 3.

- `decomp-r2-nutritionapp` — `NutritionApp.tsx` (766 LOC).
- `decomp-r2-hubchatcontext` — `hubChatContext.ts` (681 LOC; найскладніший — context-provider з багатьма ефектами).
- `decomp-r2-hubdashboard` — `HubDashboard.tsx` (837 → 115) — **merged** ([`61e0093f`](https://github.com/Skords-01/Sergeant/commit/61e0093f), Sprint 5).
- `decomp-r2-fizrukactions` — `chatActions/fizrukActions.ts` (672 LOC).
- `decomp-r2-assetstable` — `AssetsTable.tsx` (671 LOC; перенесено з sprint 3).

### Sprint 3 — finalize (1 PR)

- `decomp-r2-finalize` — drop allowlist до ≤2 файлів, оновити `LARGE_FILES` і README, статус → Done. **Ревізія 2026-05-09:** Sprint 3 зменшено з 3 планованих до 1 PR-у, бо Progress/RoutineCalendarPanel вилучені з allowlist у PR `decomp-r2-dailyplancard`.

## Критерії DONE

- [ ] У `apps/web/src/**` лишається **≤2 файли в allowlist** (closes 0001 carry-over criterion #2).
- [ ] `eslint.config.js` `overrides` allowlist для `max-lines` видалено цілком (`decomp-r2-finalize`).
- [ ] Жоден з 11 файлів у scope не перевищує 600 LOC; `pnpm lint` зелений без override-ів.
- [ ] Bundle-size delta задокументована у `decomp-r2-finalize` (очікуємо ≥+20 KB у `shared` chunk-і за рахунок tree-shaking).
- [ ] [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) `LARGE_FILES` секція оновлена: 0013 → Done, посилання на цю ініціативу замість 0001.
- [ ] [`docs/initiatives/README.md`](./README.md) — рядок 0013 переміщено з § Активні у § Нещодавно завершені.
- [ ] Outcome-секція у цьому файлі написана з фінальними метриками (як у 0001 Phase 3).

## Ризики та митиґація

| Ризик                                                                                                         | Мітигація                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Конфлікт з 0010-revenue-first-launch product-PR-ами (білінг торкається `FinykApp.tsx`)                        | Sprint 1 decomp-r2-finykapp **відкладається** на post-0010-launch (≥2026-06-01). До тих пір тільки `Workouts` / `LogCard` / `Exercise` (Fizruk + Nutrition — окремі стейкхолдери). |
| Behavioral регресія при decomp-у `Workouts.tsx` (фітнес-таймер, складна state-machine)                        | Перед PR-ом — Playwright e2e-test для `start workout → log set → finish`. Якщо тест відсутній — додати у попередньому fix-PR.                                                      |
| Decomp-у `hubChatContext.ts` дає 7 нових файлів-провайдерів, кожен по 80 LOC → читабельність гірше за моноліт | Перед PR — design review (architectural sketch у PR description). Не split-имо просто щоб задовольнити LOC; шукаємо **real seams** (state vs effects vs renderer).                 |
| `RoutineCalendarPanel.tsx` має складну date-range логіку, потенційно багатий тест-сапорт відсутній            | Sprint 3 — додати unit-тести для `useDateRangeReducer` / `useCalendarSelection` ПЕРЕД decomp-PR-ом. Окремий test-PR попереду.                                                      |
| Allowlist deadline-комент у `eslint.config.js` для файлів, що ми ще не торкнулися — стає stale                | `decomp-r2-finalize` оновлює deadline в **одному місці**: rolling 4-тижневий gate, після того як sprint 1+2 закриті.                                                               |
| Розмір PR-ів blow-up при decomp-у — review-ери не мають часу                                                  | Hard rule per-PR: `Δ LOC ≤ 800 рядків (added + removed)`, бо це **decomp**, не feature. Якщо PR більший — split на 2 (compose-and-extract → wire).                                 |
| Bundle-size після decomp росте, бо нові файли не tree-shake-ються                                             | Sprint 3 finalize — measure `pnpm build:analyze` до/після allowlist drop. Якщо +20 KB regression — split chunk-strategy update в окремий PR.                                       |

## Метрики

| Метрика                                       | Baseline (post-0001 closure)              | Sprint 1 actual (2026-05-09) | Sprint 2 target | Sprint 3 target        |
| --------------------------------------------- | ----------------------------------------- | ---------------------------- | --------------- | ---------------------- |
| Файлів `apps/web/src/**` ≥600 LOC у allowlist | 11                                        | **5**                        | 2               | ≤2 (allowlist drained) |
| Найбільший файл у allowlist                   | 717 (`Workouts.tsx`)                      | **837** (`HubDashboard.tsx`) | ≤ 681           | ≤ 599 (без override-у) |
| Сумарний LOC у allowlist                      | ~7 800                                    | **3 627**                    | ~1 350          | 0                      |
| `shared` chunk-розмір (gzip)                  | baseline-вимірюємо у `decomp-r2-workouts` | -5 KB факт                   | -10 KB          | -20 KB                 |
| `pnpm lint` без override-у                    | червоний для 11 файлів                    | **червоний для 5**           | червоний для 2  | зелений (або ряд ≤2)   |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/web/src/core/lib/**` потребує review від CODEOWNERS (особливо `hubChatContext`, `chatActions/fizrukActions`).
- **Pairing:** `decomp-r2-workouts` + `decomp-r2-logcard` — пара (одна domain, кросспосилання). Найкраще робити у тому самому день / week, щоб не divergent-ити state-machine.

## Посилання

- [`docs/initiatives/archive/_0001-module-decomposition.md`](./archive/_0001-module-decomposition.md) — predecessor (carry-over → cюди); зокрема [§ Outcome → Phase 3 → Що НЕ зроблено](./archive/_0001-module-decomposition.md) з повним списком файлів.
- [`AGENTS.md`](../../AGENTS.md) Hard Rule #18 — `max-lines: [error, 600]` ESLint правило, що залишається діючим контрактом.
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — `LARGE_FILES` секція, де поточний статус 11-файлового drift-у відображено.
- [`eslint.config.js`](../../eslint.config.js) — поточний `overrides` allowlist (≈11 entries з deadline-коментарями, що цілять у цю ініціативу).
- [`scripts/check-bundle-size.mjs`](../../scripts/check-bundle-size.mjs) — bundle-gate, який перевіряє delta після decomp-у.
- [`docs/initiatives/0010-revenue-first-launch.md`](./0010-revenue-first-launch.md) — paralleling scope-freeze, що визначає коли robо `FinykApp.tsx` дозволено.

## Outcome

### Sprint 1 — PR #1 `decomp-r2-workouts` (in flight, 2026-05-06)

`apps/web/src/modules/fizruk/pages/Workouts.tsx` декомпозовано **744 → 567 LOC** (далі до 213 LOC у [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530) via `useWorkoutsOrchestrator` hook)
(нижче 600-LOC гарду; рядок видалено з allowlist у `eslint.config.js`).

Виокремлено в нові файли (поряд з існуючими `components/workouts/*`):

- `pages/Workouts.types.ts` (25 LOC) — `WorkoutsView`, `FinishFlashState`, `LastExerciseItem`.
- `pages/Workouts.helpers.ts` (127 LOC) — `MUSCLE_GROUP_ORDER`, `buildGroupedExercises`, `collectLastByExerciseId`, `formatActiveDuration`, `todayLocalDateString`.
- `hooks/useWorkoutsLifecycle.ts` (111 LOC) — `useActiveWorkoutIdPersistence`, `useStaleActiveWorkoutCleanup`, `useWorkoutsViewFromSession`, `useRestTimerCountdown`, `useLiveWorkoutTick`.
- `components/workouts/WorkoutsHeader.tsx` (74 LOC) — back-button + контекстуальний title/subtitle + «+ Додати».
- `components/workouts/WorkoutsConfirmDialogs.tsx` (61 LOC) — «Видалити вправу» + «Risky-template start» діалоги.

Verify:

- `pnpm lint` — зелений (0 errors); попередні warnings на cyrillic-JSX літерали перенесено разом зі стрічками без змін поведінки.
- `pnpm --filter @sergeant/web typecheck` — зелений.
- `pnpm --filter @sergeant/web test` — `223 / 223` test-files, `2247 / 2247` tests passed (тести `dualWrite/*` запрацювали після `pnpm --filter @sergeant/db-schema build` — pre-existing setup-крок, не пов’язаний з цим PR-ом).
