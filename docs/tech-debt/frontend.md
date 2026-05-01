# Frontend Tech Debt — Sergeant Web

> **Last validated:** 2026-04-30 by @Skords-01. **Next review:** 2026-06-29.
> **Status:** Active

Аналіз кодової бази `apps/web/src` (434 source файли, 87k рядків).

> **Оновлено 2026-05-01.** Розділ 11 (Strict TS rollout) розширено Phase 2.2:
> `tsconfig.strict.json` тепер покриває 14 директорій — додано `src/modules/fizruk/**/*` та
> `src/core/lib/**/*`. Типи параметрів функцій у `useFizrukWorkoutReminder.ts`,
> `useTrainingProgram.ts`, `useRestSettings.ts` — explicit (видалено implicit `any`).
> Розділ 2 (localStorage burndown): 9 fizruk-файлів мігровано на `safeReadLS`/`safeWriteLS`/`safeRemoveLS`,
> ESLint allowlist скорочено з 49 до 41 файлів.

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
  файла = видалення рядка зі списку. На 2026-04-29 TODO-список
  містить 46 файлів після міграції PWA action/install slice
  (`core/App.tsx`, `core/app/pwaAction.ts`, `useIosInstallBanner.ts`,
  `usePwaInstall.ts`).
  Фактичних raw `localStorage.*` production-файлів
  (включно з wrappers) — ~78 (`rg -l "\blocalStorage\." apps/web/src` = 119
  файлів разом з тестами; ~532 рядки матчів усього, з них ~246 у
  production-файлах).

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

### 4. Великі файли (>600 рядків) — 24 файли

> `finyk/pages/Assets.tsx` (раніше 1147 рядків) декомпозовано на
> `useAssetsState.ts` (259), `AssetsForm.tsx` (376), `AssetsTable.tsx` (511),
> та `Assets.tsx` (40) — усі < 600 LOC. Див. PR-3.B з аудиту.
>
> `nutrition/lib/foodDb/seedFoodsUk.ts` (раніше 1614 рядків) розбито на
> 19 файлів по категоріях у `seeds/` + barrel re-export (~44 LOC).
> Див. PR-3.C з аудиту.

| Рядків   | Файл                                                |
| -------- | --------------------------------------------------- |
| ~~1614~~ | ~~`nutrition/lib/foodDb/seedFoodsUk.ts`~~           |
| 1064     | `core/DesignShowcase.tsx`                           |
| 1060     | `core/ProfilePage.tsx`                              |
| 949      | `fizruk/components/workouts/ActiveWorkoutPanel.tsx` |
| 907      | `core/onboarding/seedDemoData.ts`                   |
| 902      | `core/hub/HubDashboard.tsx`                         |
| 894      | `fizruk/pages/Workouts.tsx`                         |
| 827      | `finyk/pages/Transactions.tsx`                      |
| 824      | `routine/components/RoutineCalendarPanel.tsx`       |
| 824      | `finyk/FinykApp.tsx`                                |
| 694      | `core/OnboardingWizard.tsx`                         |
| 692      | `fizruk/pages/Progress.tsx`                         |
| 688      | `core/lib/chatActions/fizrukActions.ts`             |
| 686      | `core/lib/hubChatContext.ts`                        |
| 671      | `routine/RoutineApp.tsx`                            |
| 669      | `nutrition/components/LogCard.tsx`                  |
| 662      | `core/hub/HubChat.tsx`                              |
| 642      | `sw.js`                                             |
| 638      | `core/hub/HubReports.tsx`                           |
| 637      | `fizruk/pages/Exercise.tsx`                         |
| 631      | `fizruk/pages/Body.tsx`                             |
| 610      | `nutrition/NutritionApp.tsx`                        |
| 610      | `core/hub/HubSearch.tsx`                            |

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
- `ProfilePage.tsx` (1060 рядків)

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

### 9. `any` типи — 7 рядків (тільки в тестах)

| Файл                                               | Рядки                             |
| -------------------------------------------------- | --------------------------------- |
| `nutrition/hooks/usePhotoAnalysis.test.tsx`        | 1                                 |
| `nutrition/hooks/useNutritionCloudBackup.test.tsx` | 1                                 |
| `nutrition/hooks/useNutritionPantries.test.tsx`    | 4                                 |
| `nutrition/components/PantryCard.tsx`              | 1 (коментар про історичний `any`) |

Production код чистий. Тестові `any` — фабрики фіктур / промісів.

---

### 10. `@ts-expect-error` — 2 рядки (тільки в тестах)

`hubNav.test.ts:28,59` — тестування runtime guard з навмисно невалідним
вводом. Обґрунтоване.

---

### 11. Strict TypeScript rollout — Phase 1 (`strictNullChecks`) in progress

**Контекст:** `apps/web/tsconfig.json` має `strict: false` + `allowJs: true`.
Базовий `packages/config/tsconfig.base.json` — `strict: true`, але web-app
перевизначає його. Це regression risk на найбільшому production surface.

**Триетапний план:**

| Phase | Прапор                                      | Скоуп                                                                                                         | Статус      |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | `strictNullChecks`                          | `src/shared/**`                                                                                               | ✅ Виконано |
| 2     | `strictNullChecks`                          | + `src/test/**`, `src/core/{auth,cloudSync,components,hints,hooks,observability,pricing,profile}/**` (10 дир) | ✅ Виконано |
| 3     | `strictNullChecks`                          | + `src/modules/{routine,nutrition,finyk,fizruk}/**`, `src/core/{app,hub,insights,onboarding,settings,lib}/**` | TODO        |
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

**Phase 3 (наступний PR):** розширити `tsconfig.strict.json` на
`src/modules/{routine,nutrition,finyk,fizruk}/**` і решту `src/core/lib/**`
(залишок ~кілька strict-null помилок у транзитивних імпортах з модулів).
Можна паралелити як 4 під-PR-и (по одному на модуль).

**Phase 4:** увімкнути `strict: true` у головному `tsconfig.json`, видалити
`allowJs`, виправити всі залишкові помилки (основний ROI — на `noImplicitAny`,
`strictPropertyInitialization`).

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
з allowlist. На 2026-04-28 мігровано 2 файли (`Workouts.tsx`,
`useBarcodeScanner.ts`) — через `declare global { interface Window { … } }`
module-augmentation для експериментальних / prefixed DOM-глобалів,
залишилось **9 файлів**.

| Файл                                                                | Патерн          | Кількість |
| ------------------------------------------------------------------- | --------------- | --------- |
| `apps/web/src/shared/components/ui/VoiceMicButton.tsx`              | `as unknown as` | 2         |
| `apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts` | `as unknown as` | 1         |
| `apps/web/src/modules/finyk/hooks/useFinykPersonalization.ts`       | `as unknown as` | 6         |
| `apps/web/src/core/lib/hubChatUtils.ts`                             | `as unknown as` | 2         |
| `apps/web/src/core/App.tsx`                                         | `as unknown as` | 3         |
| `apps/server/src/modules/chat/chat.ts`                              | `as unknown as` | 1         |
| `apps/server/src/lib/anthropic.ts`                                  | `as unknown as` | 1         |
| `apps/server/src/lib/bankProxy.ts`                                  | `as unknown as` | 1         |
| `apps/server/src/lib/webpushSend.ts`                                | `as unknown as` | 1         |

**Fix recipe:** більшість `as unknown as X` замінюються правильним generic
type parameter, type guard (`if ('prop' in obj)`), або `satisfies` +
explicit return type.

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
