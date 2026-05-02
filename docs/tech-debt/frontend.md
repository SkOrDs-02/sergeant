# Frontend Tech Debt — Sergeant Web

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

Аналіз кодової бази `apps/web/src` (434 source файли, 87k рядків).

> **Оновлено 2026-05-02.** Sync з реальним станом коду після кількох wave-ів decomposition:
> Розділ 2 (localStorage burndown) — TODO-allowlist у `eslint.config.js` скорочено з 41 до **17 файлів**
> (нові хвилі міграцій у `routine`/`finyk`/`onboarding`/`chatActions`/`insights`/`recommendations`).
> Розділ 4 (великі файли) — у `apps/web/src` залишилось **22 файли >600 LOC** (раніше 24);
> декомпозовано `Transactions.tsx`, `HubSearch.tsx`, `Budgets.tsx`, `Overview.tsx`, `DesignShowcase.tsx`,
> `ActiveWorkoutPanel.tsx`; водночас виросли нові: `VoiceMicButton.tsx` (852), `core/App.tsx` (645).
> Розділ 9 (`any` типи) — production тепер містить **10 файлів** із `: any`
> (7 у finyk sub-pages + `BudgetsGoalsSection.tsx` + 2 нові у fizruk після decomposition).
> `no-strict-bypass` — allowlist на 9 production-файлів **обнулено**: усі call-сайти мігровані,
> правило `error` тепер працює без винятків на `apps/server/src/**` + `apps/web/src/**`.

> **Як читати:** позначки в стовпчику «Статус» оновлюються в момент злиття PR.
> Це жива сторінка — не «звіт», а контроль міграцій. Кожен запис стандартизує:
> в чому проблема, як ловити нові випадки в CI, і де вже стоїть guardrail.

> **CI freshness gate (audit PR-3.E).** Маркер `**Оновлено YYYY-MM-DD.**`
> у заголовку (рядок ~5) перевіряє
> [`scripts/check-tech-debt-freshness.mjs`](../../scripts/check-tech-debt-freshness.mjs)
> у складі `pnpm lint`. PR падає, якщо маркер старший за 60 днів
> (поріг — `FRESHNESS_THRESHOLD_DAYS`). Re-validate сторінку (статуси,
> цифри, нові пункти) і онови дату — будь-який інший edit без бампу
> маркера лічильник не скидає.

---

## 🔴 Критичне

<details>
<summary>1. ~~Зламані тести~~ — Виконано (розгорнути)</summary>

### 1. ~~Зламані тести~~ — Виконано

Раніше виглядало як «141 failed test file / 29 unresolved imports». Зараз
`apps/web/vitest.config.js` має повний alias-блок (`@shared`, `@finyk`,
`@fizruk`, `@routine`, `@nutrition`), що збігається з `tsconfig.json paths`.
`pnpm --filter @sergeant/web test` дає 80 test files / 722 теста, всі
зелені.

</details>

---

### 2. Прямі `localStorage` виклики — guardrail додано, міграція в процесі

**Раніше:** 71 файл напряму звертався до `localStorage.getItem/setItem` без
error handling — будь-який `JSON.parse(localStorage.getItem(...))` без
try/catch крашить на quota exceeded, corrupted storage або private browsing.

**Зараз:** додано власне ESLint-правило
[`sergeant-design/no-raw-local-storage`](../../packages/eslint-plugin-sergeant-design/index.js)
зі scope `apps/web/src/**`. Воно блокує і `localStorage.foo`, і
`window.localStorage.foo` / `globalThis.localStorage.foo`. У
[`eslint.config.js`](../../eslint.config.js) явний allowlist:

- **Тести** (`**/*.test.{ts,tsx,js,jsx}`, `**/__tests__/**`) — повний opt-out,
  бо виконують роль фікстур і ізольовані від production-ризиків.
- **Storage primitives** — самі обгортки (`safeReadLS`, `storageManager`,
  `storageQuota`, `typedStore`, `createModuleStorage`, `weeklyDigestStorage`,
  `useLocalStorageState`, `useDarkMode`, `usePushNotifications`,
  `useActiveFizrukWorkout`, `perf`).
- **Cloud-sync internals** — черга, патчер, state writer.
- **Module storage wrappers** — `modules/finyk/lib/storageManager`,
  `modules/finyk/hooks/useStorage`, `modules/nutrition/domain/nutritionBackup`.
- **TODO-список немігрованих файлів** — кожен файл, що ще
  читає/пише напряму, перерахований у `eslint.config.js` явно. Міграція
  файла = видалення рядка зі списку. **На 2026-05-01 TODO-список
  містить 17 файлів** (попередня хвиля: 46 → 41 → 27 → 17 після міграції
  routine/finyk/onboarding/chatActions/insights/recommendations-сайтів).
  Фактичних production-файлів у `apps/web/src` з прямим `localStorage.*` —
  **35** (з них ~18 — легітимні wrappers/primitives, 17 — у TODO-списку).
  Тести (`*.test.*`, `__tests__/`) повний opt-out і не лічаться.

**Що це дає:** новий код / нові файли НЕ зможуть додати прямий
`localStorage.*` без явного оновлення allowlist (видно в diff). Існуючі
call-сайти продовжують працювати, але зафіксовані як борг — список
greppable в одному місці.

**Fix recipes для міграції:**

- Прочитати JSON з безпечним fallback: `safeReadLS<T>(key, fallback)` з
  `@shared/lib/storage`.
- Записати JSON з обробкою quota: `safeWriteLS(key, value)`.
- Реактивне джерело істини в компоненті: хук
  `useLocalStorageState<T>(key, initial)` з `@shared/hooks/useLocalStorageState`.
- Цілий модуль зі своїм префіксом ключів: `createModuleStorage(prefix)`.

---

## 🟡 Бажане

<details>
<summary>3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано (розгорнути)</summary>

### 3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано

**Раніше:** 413 рядків з імпортами виду `from "./foo.js"` /
`from "./bar.jsx"` у `.ts`/`.tsx` файлах — працювало через Vite resolve, але
плутало IDE auto-imports і нових контриб'юторів.

**Зараз:** виконано codemod
[`scripts/strip-js-extensions.mjs`](../../scripts/strip-js-extensions.mjs) —
видалив `.js`/`.jsx` з 436 first-party-імпортів у 180 файлах. Зачіпає тільки
шляхи, що починаються з `.`, `@shared/`, `@finyk/`, `@fizruk/`, `@routine/`,
`@nutrition/` або `@sergeant/`. Зовнішні пакети (`@zxing/...`) спеціально
не торкається — їхні subpath-імпорти можуть вимагати реальної `.js`.

Codemod ідемпотентний: повторний запуск дасть `would rewrite 0 import(s)`.

> **Не робилось:** ESLint-правило `import/extensions: never`. Воно б
> вимагало `eslint-plugin-import` (зараз не встановлено) і одразу б
> пофейлило зовнішній zxing-імпорт. Поки покладаємось на codemod +
> код-рев'ю; додамо правило окремим PR разом з імпорт-плагіном.

</details>

---

### 4. Великі файли (>600 рядків) — 22 файли (тільки `apps/web/src`)

> `finyk/pages/Assets.tsx` (раніше 1147 рядків) декомпозовано на
> `useAssetsState.ts` (259), `AssetsForm.tsx` (376), `AssetsTable.tsx` (511),
> та `Assets.tsx` (40) — усі < 600 LOC. Див. PR-3.B з аудиту.
>
> `nutrition/lib/foodDb/seedFoodsUk.ts` (раніше 1614 рядків) розбито на
> 19 файлів по категоріях у `seeds/` + barrel re-export (~44 LOC).
> Див. PR-3.C з аудиту.
>
> **2026-05-01 sync:** додатково декомпозовано `finyk/pages/Transactions.tsx`
> (767 → multiple sub-pages під `pages/transactions/`), `core/hub/HubSearch.tsx`
> (610 → `hub/search/HubSearch.tsx`), `finyk/pages/Budgets.tsx`
> (727 → split на `BudgetsLimitsSection`, `BudgetsGoalsSection`, `budgetsLib`,
> `useProactiveAdvice`), `Overview.tsx` (split на `HeroCard`, `FlowRow`,
> `MonthPulseCard`, etc.). Загалом count для `apps/web/src` 24 → 22.
>
> `core/ProfilePage.tsx` (раніше 1060 рядків) декомпозовано на
> `core/profile/ProfilePage.tsx` (96), `PersonalInfoSection.tsx` (383),
> `MemoryBankSection.tsx` (242), `SessionsSection.tsx` (134),
> `ChangePasswordSection.tsx` (122), `DeleteAccountDialog.tsx` (104),
> `DangerZoneSection.tsx` (97) + barrel re-export `index.ts`.
> Усі < 600 LOC. Count 22 → 21.
>
> **Скоуп таблиці нижче** — лише `apps/web/src`. Mobile (`apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx` 1215),
> packages (`packages/shared/src/lib/assistantCatalogue.ts` 1133, `schemas/api.ts` 986,
> `openapi/routes.ts` 837), server (`modules/chat/chat.ts` 783) — трекаються окремо
> (mobile tracker — TODO, див. `docs/audits/2026-04-28-sergeant-comprehensive-audit.md` P2-3).

| Рядків | Файл                                                  |
| ------ | ----------------------------------------------------- |
| 897    | `core/onboarding/seedDemoData.ts`                     |
| 852    | `shared/components/ui/VoiceMicButton.tsx`             |
| 788    | `core/lib/chatActions/crossActions.ts`                |
| 774    | `modules/fizruk/pages/Body.tsx`                       |
| 758    | `core/lib/chatActions/finykActions.ts`                |
| 733    | `modules/nutrition/components/LogCard.tsx`            |
| 732    | `modules/routine/RoutineApp.tsx`                      |
| 697    | `modules/fizruk/pages/Progress.tsx`                   |
| 685    | `modules/finyk/hooks/useStorage.ts`                   |
| 679    | `core/lib/hubChatContext.ts`                          |
| 676    | `core/hub/HubDashboard.tsx`                           |
| 672    | `core/lib/chatActions/types.ts`                       |
| 668    | `core/lib/chatActions/fizrukActions.ts`               |
| 667    | `modules/finyk/pages/AssetsTable.tsx`                 |
| 666    | `modules/fizruk/pages/Workouts.tsx`                   |
| 663    | `modules/nutrition/components/DailyPlanCard.tsx`      |
| 660    | `shared/components/ui/Icon.tsx`                       |
| 651    | `modules/nutrition/NutritionApp.tsx`                  |
| 647    | `modules/fizruk/pages/Exercise.tsx`                   |
| 645    | `core/App.tsx`                                        |
| 612    | `sw.ts`                                               |
| 602    | `modules/routine/components/RoutineCalendarPanel.tsx` |

**Імпакт:** повільніший code review, важче тестувати окремі частини, можливі
circular deps.

**Fix:** поступовий split — витягувати sub-components, hooks, utils. Окремі
PR на кожен файл; великі data-файли (`seedFoodsUk.ts`) — кандидати на
розбиття за категоріями.

---

<details>
<summary>5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (розгорнути)</summary>

### 5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (документація)

21 disable-сайт залишається, але тепер кожен має явне обґрунтування поряд
(intentional ref-based callback, mount-only effect, навмисне виключення
залежності щоб не зациклитись тощо). Див. зведений каталог
[`docs/architecture/apps-web-exhaustive-deps.md`](../architecture/apps-web-exhaustive-deps.md). Якщо
з'являється новий disable без коментаря — рев'ю має його блокувати.

</details>

---

### 6. Тестове покриття — 126 test файлів на 529 source

~24% файлів мають тести. Критичні модулі без тестів / з тонким покриттям
(актуально):

- `HubReports.tsx` (638 рядків, складна агрегація)
- `TodayFocusCard.tsx` (recommendation engine інтеграція)
- ~~`ProfilePage.tsx` (1060 рядків)~~ — декомпозовано на `core/profile/` (max 383 LOC)

**Зроблено 2026-04-28:** додано focused coverage для `HubDashboard.tsx`
(`HubDashboard.test.tsx`: module previews / empty states, inactive modules,
quick actions, callback routing, weekly digest footer).

**Fix:** пріоритетно додати тести на recommendation engine, reports
aggregation, cloud sync flows.

---

## 🟢 Nice-to-have

### 7. `console.log/debug` у production коді — 9 рядків

```
core/settings/GeneralSection.tsx:193  console.log("[sw] snapshot", snap)
core/settings/GeneralSection.tsx:215  console.log("[sw] caches cleared", res)
core/observability/analytics.ts:58                  console.log("[analytics]", event)
core/cloudSync/logger.ts:39-41        console.debug("[cloud-sync]")
core/cloudSync/hook/useCloudSyncDebug.ts:15  (docstring reference)
shared/lib/perf.ts:28                 console.debug("[perf]")
sw.js:491                             console.log("[sw] debug enabled", …)
```

Усі 9 — навмисні. `cloud-sync` / `perf` / `analytics` — debug-mode logger,
що пишеться через `console.debug` і не відображається в default-консолі.
`GeneralSection` — кнопки «Діагностика SW», що цілеспрямовано виводять
снапшот у консоль (toast: «SW-діагностика виведена в консоль»). `sw.js` —
service worker власний debug toggle. Виправлень не потрібно.

---

### 8. `eslint-disable no-eyebrow-drift` — 25 рядків

Custom DS-rule пригнічується 25 разів. Усі з обґрунтуваннями в коментарях
(кастомні hero kickers, calendar headers). Не критично; колись варто
розширити `SectionHeading` API, щоб ці випадки відпали.

---

### 9. `any` типи — 10 production-файлів + кілька тестів

**Production (оновлено 2026-05-02):** після decomposition `Transactions.tsx` /
`Budgets.tsx` у `apps/web/src/modules/finyk/pages/{transactions,budgets}/**`
з'явилися `: any` у локальних типах sortable-полів / filter-предикатів;
додатково знайдено нові в fizruk після відповідного decomposition:

| Файл                                                          |
| ------------------------------------------------------------- |
| `modules/finyk/pages/transactions/Transactions.tsx`           |
| `modules/finyk/pages/transactions/TransactionList.tsx`        |
| `modules/finyk/pages/transactions/useTransactionSelection.ts` |
| `modules/finyk/pages/transactions/useTransactionFilters.ts`   |
| `modules/finyk/pages/budgets/Budgets.tsx`                     |
| `modules/finyk/pages/budgets/BudgetsGoalsSection.tsx`         |
| `modules/finyk/pages/budgets/BudgetsLimitsSection.tsx`        |
| `modules/finyk/pages/budgets/useProactiveAdvice.ts`           |
| `modules/fizruk/components/workouts/QuickStartSheet.tsx`      |
| `modules/fizruk/pages/Exercise.tsx`                           |

**Fix recipe:** замінити `: any` на explicit union (`SortField`/`FilterKey`)
або `unknown` + type-guard. Окремий PR.

**Tests (без змін):**

| Файл                                               | Рядки                             |
| -------------------------------------------------- | --------------------------------- |
| `nutrition/hooks/usePhotoAnalysis.test.tsx`        | 1                                 |
| `nutrition/hooks/useNutritionCloudBackup.test.tsx` | 1                                 |
| `nutrition/hooks/useNutritionPantries.test.tsx`    | 4                                 |
| `nutrition/components/PantryCard.tsx`              | 1 (коментар про історичний `any`) |

---

### 10. `@ts-expect-error` — 2 рядки (тільки в тестах)

`hubNav.test.ts:28,59` — тестування runtime guard з навмисно невалідним
вводом. Обґрунтоване.

---

### 11. Strict TypeScript rollout — Phases 1–3.1 complete, Phase 4 sized

**Контекст:** `apps/web/tsconfig.json` має `strict: false` + `allowJs: true`.
Базовий `packages/config/tsconfig.base.json` — `strict: true`, але web-app
перевизначає його. Це regression risk на найбільшому production surface.

**Триетапний план:**

| Phase | Прапор                                      | Скоуп                                                                                                         | Статус      |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | `strictNullChecks`                          | `src/shared/**`                                                                                               | ✅ Виконано |
| 2     | `strictNullChecks`                          | + `src/test/**`, `src/core/{auth,cloudSync,components,hints,hooks,observability,pricing,profile}/**` (10 дир) | ✅ Виконано |
| 3     | `strictNullChecks`                          | + `src/modules/{routine,nutrition,finyk,fizruk}/**`, `src/core/{app,hub,insights,onboarding,settings,lib}/**` | ✅ Виконано |
| 3.1   | `strictNullChecks`                          | + `src/core/designShowcase/**`, `src/core/stories/**`                                                         | ✅ Виконано |
| 4     | повний `strict: true` + видалення `allowJs` | всі файли                                                                                                     | TODO        |

**Phase 1 деталі (PR-6.A):**

- Додано `apps/web/tsconfig.strict.json` — extends основний tsconfig,
  додає `strictNullChecks: true`, includes тільки `src/shared/**`.
- Typecheck script оновлено: `tsc -p tsconfig.strict.json --noEmit` додано
  до pipeline.
- **Baseline error count (з `strictNullChecks` на весь `apps/web`):** 518 помилок.
  - `src/shared/**` — 7 помилок → виправлено (non-null assertions у тестах).
  - `src/core/lib/**` — 16 помилок → TODO Phase 3 (було Phase 2 у первісному плані).
  - Інші модулі (`modules/`, `core/` без lib) — ~495 помилок → Phase 3+.
- Жодних `@ts-expect-error` або runtime-змін не додано.

**Phase 2 деталі (PR — audit high-priority #1 крок 1):**

- `tsconfig.strict.json` розширено до 10 директорій:
  `src/shared`, `src/test`, `src/core/{auth, cloudSync, components, hints, hooks, observability, pricing, profile}`.
- **Виправлено cross-file SpeechRecognition type-collision** між
  `useSpeech.ts` (`declare global Window`) і `VoiceMicButton.tsx` (локальна
  форма). Глобальну augmentation знято — `useSpeech.ts` читає `window`
  через приватний cast (`WindowWithSpeech`), що не навʼязує єдиної
  сигнатури іншим call-сайтам.
- **1 null-check error виправлено** у `useCloudSync.behavior.test.ts`
  (`localStorage.getItem(...)` → додано `expect(...).not.toBeNull()`
  - `as string` перед `JSON.parse`).
- Жодних змін у runtime-коді (лише типи + один тест assertion).

**Phase 2.1 деталі (audit high-priority #1, крок 2 — `core/hub` + `core/settings`):**

- `tsconfig.strict.json` розширено ще на 2 директорії: `src/core/hub/**`
  і `src/core/settings/**` (разом 12 директорій).
- Strict-null помилки в **імпортованих із цих директорій** файлах
  виправлені in-place (16 помилок у 5 файлах):
  - `core/lib/hubChatContext.ts` — guard на `x.startedAt` (optional) і
    `sorted[0]?.items` перед викликом `.length`.
  - `modules/finyk/hooks/useStorage.ts` — explicit `NetworthSnap` тип
    для `networthSnapshotRef`, щоб перестати інферити `value: null`
    літерально.
  - `modules/finyk/lib/lsStats.ts` — explicit generics
    `safeReadLS<string[]>` / `safeReadLS<Record<string,string>>` /
    `safeReadLS<Array<{linkedTxIds?: string[]}>>` замість inference
    від дефолта `[]`.
  - `modules/routine/components/HabitDetailSheet.tsx` — явний
    `habit.weekdays && habit.weekdays.length > 0` замість
    optional-chain + `> 0`.
  - `modules/routine/lib/finykSubscriptionCalendar.ts` — generic
    `safeReadLS<unknown[] | null>` замість дефолта `null`.
- Жодних `@ts-expect-error` і жодних runtime-змін — лише сигнатури
  `safeReadLS`/`readJSON` та null-guards.

**Phase 3 деталі (strict-null rollout — routine + nutrition + fizruk + finyk + core/lib):**

- `tsconfig.strict.json` розширено на всі 4 модулі та решту `src/core/`:
  `src/modules/{routine,nutrition,finyk,fizruk}/**`,
  `src/core/{app,hub,insights,onboarding,settings,lib}/**`.
- `src/modules/routine/**` та `src/modules/nutrition/**` — 0 strict-null
  помилок; модулі вже були clean завдяки null-guards доданим у Phase 2.1.
- `src/modules/fizruk/hooks/useRestSettings.ts` — `MergedSettings` тип
  змінено з `typeof REST_DEFAULTS` (literal `as const` types) на
  `Record<keyof typeof REST_DEFAULTS, number>`, оскільки user overrides
  повертають `number`, а не літеральні `90 | 60 | 30`.
- `src/core/lib/` тест-файли (4 файли, 8 помилок) — додано explicit
  array type annotations для `never[]` inference (`const txs: Array<...> = []`)
  та non-null assertions (`!`) після `expect(...).toBeDefined()` guards.
- Жодних `@ts-expect-error`, `as any`, або runtime-змін не додано.

**Phase 4 (TODO):** увімкнути `strict: true` у головному `tsconfig.json`,
видалити `allowJs`, виправити всі залишкові помилки.

- **Заміряний скоуп (2026-05-02):** **768 помилок у 69 файлах** (повний
  `strict: true` + `allowJs: false` без жодних змін у коді). Розподіл
  за кодами: `TS7006` (parameter implicitly any) — 431, `TS7031`
  (binding element implicitly any) — 289, `TS7053` (element implicitly
  any) — 21, `TS7005` (var without type) — 12, `TS18046` (`error` is
  of type `unknown`) — 10, інші — 5.
- **Топ-блокери** (одиничний фікс розблокує найбільше):
  `modules/finyk/hooks/useStorage.ts` (71), `modules/fizruk/hooks/useWorkouts.ts`
  (35), `modules/fizruk/components/workouts/WorkoutJournalSection.tsx` (31),
  `modules/finyk/pages/AssetsTxPickerView.tsx` (30),
  `modules/fizruk/components/workouts/ActiveWorkoutPanel.tsx` (29),
  `modules/finyk/pages/AssetsTable.tsx` (26), `modules/finyk/hooks/usePrivatbank.ts`
  (26). Решта помилок розпорошені по `~50` файлах finyk/fizruk/onboarding/insights.
- **Чому Phase 4 не дробиться через `tsconfig.noimplicitany.json`-include:**
  TypeScript застосовує `noImplicitAny` ко всій програмі (всі transitively
  reached файли), не тільки до `include`-списку. Спроба додати
  `core/{lib,hub,insights,onboarding,settings,stories,designShowcase}` в
  `tsconfig.noimplicitany.json` дає **801 помилку**, бо ці директорії
  імпортують з `modules/finyk` та `modules/fizruk`, які тягнуть всі їхні
  implicit-any. Тобто **noImplicitAny scope-розширення без попереднього
  fix-у `modules/{finyk,fizruk}` не зменшує scope** — це була б та сама
  Phase 4. Висновок: рухатись треба per-file (починаючи з топ-блокерів),
  без проміжного "Phase 3.2".

**Strict-pipeline regression-фікси (2026-05-02):** Pull-to-refresh PR #1330
вніс 3 strict-помилки, що ламали `tsc -p tsconfig.strict.json`. Виправлено
in-place перед initiation Phase 4:

- `shared/components/ui/PullToRefresh.tsx` — `useRef<HTMLDivElement>(null)`
  робить `current` read-only; уточнено як `useRef<HTMLDivElement | null>(null)`.
- `core/auth/ResetPasswordPage.tsx` — `{...pwValidation.getFieldProps(...)}`
  після `className={INPUT_CLS}` клобрив `INPUT_CLS` (повертає `className:
"border-danger …"`). Дістаємо `passwordFieldProps` / `confirmFieldProps`
  явно, зливаємо через `cn()`, проброс `onBlur` окремо. Це і `TS2783`-фікс,
  і реальний стилевий регрес — інпути пароля втрачали базові стилі при
  validation-error.

---

### 12. Strict TS coverage tracking (CI)

**Скрипт:** [`scripts/strict-coverage.mjs`](../../scripts/strict-coverage.mjs) —
сканує всі `tsconfig.json` у `apps/*/` та `packages/*/`, резолвить `extends`
ланцюги, виводить markdown-таблицю з прапорами `strict`, `strictNullChecks`,
`noImplicitAny`, `allowJs` для кожного пакету.

**CI:** job `strict-coverage` у `.github/workflows/ci.yml` — інформативний
(не блокує CI), пише результат у `$GITHUB_STEP_SUMMARY`. Видно на вкладці
Summary кожного workflow run.

**Локально:** `pnpm strict:coverage` або `node scripts/strict-coverage.mjs --json`.

**Тести:** `node --test scripts/__tests__/strict-coverage.test.mjs`.

Ref: PR-6.F (sergeant-audit-devin.md).

---

## Recently completed

- ✅ Vitest path aliases — 80/80 файлів зелені
- ✅ Codemod `.js`/`.jsx` extensions — 436 імпортів очищено
- ✅ ESLint guardrail для прямих `localStorage.*` (нові виклики блокуються)
- ✅ `react-hooks/exhaustive-deps` disable-сайти — задокументовано
- ✅ `no-raw-local-storage` top-3 міграція (55 → 52 файли):
  - `core/settings/FinykSection.tsx` — 20 raw calls → `safeReadStringLS`/`safeWriteLS`/`safeRemoveLS`
  - `core/lib/chatActions/fizrukActions.ts` — 7 raw calls → `safeReadLS` + `readWorkouts()` helper
  - `core/hub/HubDashboard.tsx` — вже використовував `localStorageStore` (KVStore adapter), прибрано з allowlist
- ✅ `no-raw-local-storage` fizruk burndown (49 → 41 файлів, Phase 2.2):
  - `useTrainingProgram.ts` — `safeReadStringLS`/`safeWriteLS`/`safeRemoveLS`
  - `useFizrukWorkoutReminder.ts` — `safeReadStringLS`/`safeWriteLS` + typed params
  - `useMonthlyPlan.ts` — `safeReadLS<Partial<MonthlyPlanState>>`/`safeWriteLS`
  - `useExerciseCatalog.ts` — `safeReadStringLS`/`safeWriteLS`
  - `useFizrukProgramStart.ts` — `safeWriteLS`
  - `TodayPlanCard.tsx`, `Body.tsx`, `Dashboard.tsx`, `Progress.tsx`, `Workouts.tsx` — safe helpers
  - `useWorkouts.ts` залишився в allowlist (використовує CustomEvent для quota UX)
- ✅ Mobile APM: `tracesSampleRate` підвищено з 0 до 0.05 в продакшн Sentry RN
- ✅ `no-raw-local-storage` PWA + Finyk-hub burndown (52 → 49 файлів):
  - `core/app/pwaAction.ts` — `localStorage.getItem`/`removeItem` → `safeReadStringLS` + `safeRemoveLS`
  - `core/hooks/usePwaActions.ts` — `localStorage.setItem` у `useState` lazy-initializer → `safeWriteLS`
  - `core/hub/useFinykHubPreview.ts` — `localStorage.getItem` + `JSON.parse` у `readHasMonoData()` → типізований `safeReadLS<{ txs?: unknown[] }>`
- ✅ `no-raw-local-storage` Hub-search burndown (−4 entries в allowlist):
  - `core/hub/search/searchCache.ts` — `localStorage.getItem(key)` всередині `safeParseLS()` → `safeReadStringLS(key, null)`. Кеш `cachedParse` лишається без змін (ключ ↔ raw-string invalidation).
  - `core/hub/search/searchSources.ts` — `localStorage.getItem("fizruk_workouts_v1")` та `localStorage.getItem("fizruk_custom_exercises_v1")`, що передавалися як raw у `parseFizrukWorkouts`/`parseFizrukCustomExercises`, тепер `safeReadStringLS(...)`.
  - `core/hub/hubBackup.ts`, `core/hub/hubSearchEngine.ts` — вже не мали raw `localStorage.*`-викликів; стейл-записи прибрані з allowlist.
- ✅ `no-raw-local-storage` Modules burndown (−4 entries в allowlist):
  - `shared/lib/storage.ts` — додано `safeListLSKeys()`: безпечний `try/catch`-обгорток над `localStorage.length` + `localStorage.key(i)` для prefix-based GC-проходів (private-mode Safari → `[]`).
  - `modules/finyk/pages/Overview.tsx` — `finyk_first_insight_seen_v1` flag: `localStorage.getItem` у `useState`-lazy-initializer → `safeReadStringLS(_, null) === null`; `localStorage.setItem(_, "1")` у `useEffect` → `safeWriteLS(_, "1")` (string passthrough).
  - `modules/nutrition/hooks/useNutritionReminders.ts` — `nutrition_last_reminder_notif_key`: `readLastNotifyKey()`/`writeLastNotifyKey()` тепер делегують у `safeReadStringLS`/`safeWriteLS`.
  - `modules/routine/hooks/useRoutineReminders.ts` — `cleanupStaleRoutineNotifyKeys` GC-loop переписано на `safeListLSKeys() + safeRemoveLS()`; per-habit `routine_notify_*` flag (`getItem`+`setItem`) → `safeReadStringLS`/`safeWriteLS`. SW-postMessage side-effect збережено.
  - `modules/routine/components/RoutineCalendarPanel.tsx` — стейл-запис в allowlist (мав лише `localStorage.setItem` у коментарі, без реальних `MemberExpression`-викликів) — прибрано.
- ✅ `no-raw-local-storage` Onboarding-preset burndown (−1 entry в allowlist):
  - `core/onboarding/presetApply.ts` — прибрано локальні `safeReadJSON`/`safeWriteJSON` дублікати; усі чотири `applyXPreset()` (Finyk, Routine, Fizruk, Nutrition) переведено на `safeReadLS`/`safeWriteLS` з `@shared/lib/storage`. `safeWriteLS(FINYK_MANUAL_ONLY_KEY, "1")` зберігає попередню raw-string-семантику (string passthrough без `JSON.stringify`).

---

### `no-strict-bypass` — TODO files

**PR-6.E:** додано ESLint-правило
[`sergeant-design/no-strict-bypass`](../../packages/eslint-plugin-sergeant-design/index.js)
зі scope `apps/web/src/**` + `apps/server/src/**`. Ловить 4 патерни:
`// @ts-expect-error`, `// @ts-ignore`, `as any`, `as unknown as X`.

Тести (`**/*.test.*`, `**/__tests__/**`, `**/*.spec.*`) — повний opt-out.

На момент введення правила (2026-04-26) в production-коді знайдено
**11 файлів** з `as unknown as X` (інших патернів — 0). Файли додані
до allowlist у `eslint.config.js`. Міграція файла = видалення рядка
з allowlist.

**2026-05-01 — allowlist обнулено.** Усі 9 файлів, що залишались на
2026-04-28, мігровані; `grep -E 'as\s+unknown\s+as|@ts-(ignore|expect-error)|\bas\s+any\b'`
на `apps/web/src/**` та `apps/server/src/**` (без тестів) повертає 0
матчів. Allowlist у `eslint.config.js` скорочено до самих лише
test-file glob-ів — правило `sergeant-design/no-strict-bypass` тепер
заblock-ить будь-яке нове введення цих патернів у production.

| Файл (мігровано)                                                    | Патерн                  |
| ------------------------------------------------------------------- | ----------------------- |
| `apps/web/src/shared/components/ui/VoiceMicButton.tsx`              | `as unknown as` (2 → 0) |
| `apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts` | `as unknown as` (1 → 0) |
| `apps/web/src/modules/finyk/hooks/useFinykPersonalization.ts`       | `as unknown as` (6 → 0) |
| `apps/web/src/core/lib/hubChatUtils.ts`                             | `as unknown as` (2 → 0) |
| `apps/web/src/core/App.tsx`                                         | `as unknown as` (3 → 0) |
| `apps/server/src/modules/chat/chat.ts`                              | `as unknown as` (1 → 0) |
| `apps/server/src/lib/anthropic.ts`                                  | `as unknown as` (1 → 0) |
| `apps/server/src/lib/bankProxy.ts`                                  | `as unknown as` (1 → 0) |
| `apps/server/src/lib/webpushSend.ts`                                | `as unknown as` (1 → 0) |

**Fix recipe (для майбутніх кейсів):** більшість `as unknown as X` замінюються
правильним generic type parameter, type guard (`if ('prop' in obj)`), або
`satisfies` + explicit return type.

---

## Recommended next steps

1. **Міграція TODO-списку `no-raw-local-storage`** — пріоритетно файли з
   найбільшою кількістю викликів (наступні за пріоритетом після вже
   мігрованих top-3).
2. **File splitting** — Assets, ProfilePage, ActiveWorkoutPanel.
3. **Test coverage** — recommendation engine, reports aggregation, cloud
   sync flows; `HubDashboard` focused coverage вже додано.
4. Опційно — `eslint-plugin-import` + `import/extensions: never`, щоб
   codemod #3 був самозабезпечений правилом.
