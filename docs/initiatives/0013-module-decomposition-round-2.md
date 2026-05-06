# 0013 — Module decomposition round 2 (`apps/web` allowlist drain)

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** In progress (Sprint 1 — 1/4 PR-ів)
> **Priority:** P2 (subordinate to 0010-revenue-first-launch scope-freeze; pre-launch work паралельно лише на adjacent-touch — див. § Чому зараз)
> **Owner:** `@Skords-01`
> **ETA:** 3 sprints (≈3 тижні), **8–11 PR-ів** (по 1 PR на файл, плюс finalize-PR з drop-allowlist)
> **Sources:** [`docs/initiatives/0001-module-decomposition.md`](./0001-module-decomposition.md) (predecessor — Phase 3 closure 2026-05-04, carry-over список нижче), [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) (`LARGE_FILES` секція, що посилається сюди), [`AGENTS.md`](../../AGENTS.md) Hard Rule #18 (`max-lines: [error, 600]`).

## TL;DR

[`0001`](./0001-module-decomposition.md) закрилася 2026-05-04 з `5/6` критеріїв виконано. **Невиконаний критерій** — `≤2 файли в allowlist у apps/web/src/**` — лишився **11 файлами** (`Workouts`, `LogCard`, `FinykApp`, `NutritionApp`, `Cards`, `Subscriptions`, `Exercise`, `Progress`, `AssetsTable`, `RoutineCalendarPanel`, `hubChatContext` / `chatActions/fizrukActions`). Hard Rule #18 (`max-lines: [error, 600]`) тримає **новий** код під контролем — старий drift лишається, з deadline-коментарем у allowlist.

Ця ініціатива **drain-ує allowlist** до ≤2 файлів за такою ж per-file-PR схемою, як Phase 2 у 0001 (по 1 PR на файл, baseline + decomp + verify), плюс фінальний PR `decomp-round-2-finalize` що видаляє `overrides` allowlist цілком. Без нової авто-генерації коду — це pure structure refactor.

## Чому зараз

- 0010 (revenue-first launch) у scope-freeze до ≈2026-06-01 — **вся frontend-робота на adjacent-файлах має пройти через 600-LOC гард**. Кожен раз як developer торкається `Workouts.tsx` (717 LOC) у фічі для білінгу — він не може додати рядок без увімкнення override-у. Це ламає flow.
- Allowlist `eslint.config.js` зростає на drift: `0001` Phase 3 фіксував список 7 файлів; до closure-у виявилося **12** (drift-and-keep). Нинішній `pnpm lint:tech-debt-freshness` періодично нагадує про deadline, але без активного власника deadline лишається символічним.
- Регресія в монолітах: `RoutineApp.tsx` (745 LOC) вдалося декомпонувати в Phase 2 з `useReducer` + state-machine виносом — це **повторюваний рецепт** для решти `*App.tsx` файлів. Поки рецепт свіжий у пам'яті, треба застосувати його до `FinykApp` / `NutritionApp` / `Workouts` — інакше за 6 місяців ми його забудемо.
- Bundle-size: щонайменше 4 з 11 файлів — у `vendor-finyk` / `vendor-fizruk` chunk-ах. Decomp дозволить tree-shake-нути доменні sub-trees → +20-30 KB у `shared` (екстраполяція з Phase 2 measurement: −22 KB на `Icon.tsx`).

## Скоуп

**In:**

1. **Top-priority drain (sprint 1, 4 PR-и)** — найбільші файли з найбільшим behavioral-risk surface:
   - `apps/web/src/modules/fizruk/pages/Workouts.tsx` (717 LOC) — пара з `LogCard`.
   - `apps/web/src/modules/nutrition/components/LogCard.tsx` (580 LOC) — пара з `Workouts`.
   - `apps/web/src/modules/fizruk/pages/Exercise.tsx` (≥600 LOC) — drift, окремий PR.
   - `apps/web/src/modules/finyk/FinykApp.tsx` (559 LOC) — Top-7 #6 з 0001 Phase 2 plan.
2. **Drift drain (sprint 2, 5 PR-и)** — файли, що дрифтнули у allowlist після Phase 1:
   - `apps/web/src/modules/nutrition/NutritionApp.tsx`.
   - `apps/web/src/core/lib/hubChatContext.ts`.
   - `apps/web/src/core/lib/chatActions/fizrukActions.ts`.
   - `apps/web/src/modules/finyk/pages/Cards.tsx`.
   - `apps/web/src/modules/finyk/pages/Subscriptions.tsx`.
3. **Long-tail (sprint 3, 2-3 PR-и)** — за пріоритетом behavioral-risk vs LOC:
   - `apps/web/src/modules/finyk/pages/AssetsTable.tsx`.
   - `apps/web/src/modules/fizruk/pages/Progress.tsx`.
   - `apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx`.
4. **Finalize PR (last)** — `decomp-round-2-finalize`: видалити `overrides` allowlist у `eslint.config.js` цілком, оновити `LARGE_FILES` запис у [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md), закрити цю ініціативу як `Done` з Outcome-секцією.

**Out:**

- Нові фічі / зміни поведінки модулів — **strict refactor only**. Якщо при декомпозиції видно баг — окремий fix-PR попереду decomp-PR-у з reference сюди.
- `apps/web/vite.config.js` `manualChunks` re-tuning — окрема ініціатива (потенційно 0014-bundle-budget-per-route), коли 0006-routing міграція стартує.
- TS-strict опт-ін правила (`noUncheckedIndexedAccess` тощо) — це 0012 scope. Тут не торкаємо tsconfig.
- Server / mobile / mobile-shell декомпозиція — окремий scope, поки не визначений.

## План змін

### Sprint 1 — top-priority drain (4 PR-и)

Кожен PR — 1 файл, шаблон з 0001 Phase 2:

1. **Baseline** — `pnpm exec eslint apps/web/src/<file> --format json` + `pnpm build:analyze` (chunk size перед).
2. **Decomp** — extract sub-components у `apps/web/src/modules/<mod>/components/<NewName>.tsx`; extract hooks у `hooks/<useNewName>.ts`; extract utility-функції у `lib/`.
3. **Verify** — `pnpm test --filter @sergeant/web -- <module>`, `pnpm typecheck`, `pnpm lint`. Bundle-size delta у PR description.
4. **Allowlist drop** — видалити рядок з `overrides` блока у `eslint.config.js`.

PR-и:

- `decomp-r2-workouts` — `Workouts.tsx` (717 → ≤599 + 2-3 child компоненти).
- `decomp-r2-logcard` — `LogCard.tsx` (580 → ≤599; швидкий, бо вже близько).
- `decomp-r2-exercise` — `Exercise.tsx` (≥600 → ≤599).
- `decomp-r2-finykapp` — `FinykApp.tsx` (559 → ≤599; швидкий, але хочемо запобігти drift-у назад).

### Sprint 2 — drift drain (5 PR-и)

Та сама схема, по 1 PR на файл:

- `decomp-r2-nutritionapp` — `NutritionApp.tsx`.
- `decomp-r2-hubchatcontext` — `hubChatContext.ts` (це найскладніший — context-provider з багатьма ефектами).
- `decomp-r2-fizrukactions` — `chatActions/fizrukActions.ts`.
- `decomp-r2-finyk-cards` — `pages/Cards.tsx`.
- `decomp-r2-finyk-subs` — `pages/Subscriptions.tsx`.

### Sprint 3 — long-tail + finalize (3 PR-и)

- `decomp-r2-assetstable` — `AssetsTable.tsx`.
- `decomp-r2-progress` — `Progress.tsx`.
- `decomp-r2-routinecalendar` — `RoutineCalendarPanel.tsx`.
- `decomp-r2-finalize` — drop allowlist цілком, оновити `LARGE_FILES` і README, статус → Done.

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

| Метрика                                       | Baseline (post-0001 closure)              | Sprint 1 target | Sprint 2 target | Sprint 3 target        |
| --------------------------------------------- | ----------------------------------------- | --------------- | --------------- | ---------------------- |
| Файлів `apps/web/src/**` ≥600 LOC у allowlist | 11                                        | 7               | 2               | 0 (allowlist removed)  |
| Найбільший файл у allowlist                   | 717 (`Workouts.tsx`)                      | ≤ 599           | ≤ 599           | ≤ 599 (без override-у) |
| Сумарний LOC у allowlist                      | ~7 800                                    | ~5 100          | ~1 800          | 0                      |
| `shared` chunk-розмір (gzip)                  | baseline-вимірюємо у `decomp-r2-workouts` | -5 KB           | -10 KB          | -20 KB                 |
| `pnpm lint` без override-у                    | червоний для 11 файлів                    | червоний для 7  | червоний для 2  | зелений                |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/web/src/core/lib/**` потребує review від CODEOWNERS (особливо `hubChatContext`, `chatActions/fizrukActions`).
- **Pairing:** `decomp-r2-workouts` + `decomp-r2-logcard` — пара (одна domain, кросспосилання). Найкраще робити у тому самому день / week, щоб не divergent-ити state-machine.

## Посилання

- [`docs/initiatives/0001-module-decomposition.md`](./0001-module-decomposition.md) — predecessor (carry-over → cюди); зокрема [§ Outcome → Phase 3 → Що НЕ зроблено](./0001-module-decomposition.md) з повним списком файлів.
- [`AGENTS.md`](../../AGENTS.md) Hard Rule #18 — `max-lines: [error, 600]` ESLint правило, що залишається діючим контрактом.
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — `LARGE_FILES` секція, де поточний статус 11-файлового drift-у відображено.
- [`eslint.config.js`](../../eslint.config.js) — поточний `overrides` allowlist (≈11 entries з deadline-коментарями, що цілять у цю ініціативу).
- [`scripts/check-bundle-size.mjs`](../../scripts/check-bundle-size.mjs) — bundle-gate, який перевіряє delta після decomp-у.
- [`docs/initiatives/0010-revenue-first-launch.md`](./0010-revenue-first-launch.md) — paralleling scope-freeze, що визначає коли robо `FinykApp.tsx` дозволено.

## Outcome

### Sprint 1 — PR #1 `decomp-r2-workouts` (in flight, 2026-05-06)

`apps/web/src/modules/fizruk/pages/Workouts.tsx` декомпозовано **744 → 567 LOC**
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
