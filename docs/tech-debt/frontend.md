# Frontend Tech Debt — Sergeant Web

> **Last validated:** 2026-05-13 by @Skords-01 / Devin (re-audit після Storage-roadmap Stage 7 / 9 — `webKVStore` мігровано на SQLite-backed `kv_store` (PR-и #063 / #064 / #065, 2026-05-07), `localstorage-allowlist-budget.json` production: 0, allowlist `eslint.config.js` лишає тільки test-fixtures; `core/auth/AuthPage.tsx` декомпозовано 694 → 150 LOC). **Next review:** 2026-08-11.
> **Status:** Active

Аналіз кодової бази `apps/web/src` (790 source файлів, ~123k рядків — без тестів, `__tests__/` і `.stories.*`; 2026-05-13 re-audit).

> **Оновлено 2026-05-13.** Sync з реальним станом коду після Stage 7 / 9 storage-roadmap-у та подальших decomposition-ів:
> Розділ 2 (localStorage burndown) — production-allowlist у `eslint.config.js` **обнулено**
> (PR #054 final, 2026-05-06). `webKVStore` фізично переключено на SQLite-backed
> `kv_store(key TEXT PK, value JSON)` через PR #063 (web swap із LS dual-write canary)
> → PR #064 (drop LS mirror, SQLite-only) → PR #065 (mobile `mobileKVStore` mirror).
> Двоступенева драбина у `apps/web/src/shared/lib/storage/storage.ts:resolveStore()`:
> SQLite warm-cache (bootstrap-resolved) → `localStorage`-fallback (pre-bootstrap / SSR /
> private mode). Out-of-scope follow-up з §2 закритий.
> Розділ 4 (великі файли) — у `apps/web/src` залишилось **5 файлів >600 LOC** (раніше 14 на 2026-05-04;
> lookup-таблиця нижче синхронізована з `wc -l` 2026-05-13). Додатково декомпозовано (після 2026-05-04):
> `RoutineApp.tsx`, `Progress.tsx` (fizruk), `useStorage.ts` (finyk), `HubDashboard.tsx` (676 → 115 LOC,
> stale entry в `max-lines` allowlist прибрано у цьому PR),
> `chatActions/types.ts`, `fizrukActions.ts`, `AssetsTable.tsx`, `Workouts.tsx` (fizruk),
> `DailyPlanCard.tsx`, `Icon.tsx`, `NutritionApp.tsx`, `sw.ts`, `Exercise.tsx`, `LogCard.tsx`,
> `core/auth/AuthPage.tsx` (694 → 150 LOC; винесено `LoginForm`, `RegisterForm`,
> `ForgotPasswordPanel` + `useForgotPassword`, `GoogleSignInButton`, `authFormPrimitives`,
> `authSchemas`).
> Нові leakers (раніше у doc не трекалися, тепер додані до таблиці §4):
> `core/onboarding/OnboardingWizard.tsx` (691),
> `modules/fizruk/lib/dualWrite/adapter.ts` (641). Початково запланований carry-over
> з Initiative 0001 — лише `FinykApp.tsx` і `RoutineCalendarPanel.tsx` досі активні.
> Розділ 9 (`any` типи) — таблиця з 10 файлів **повністю закрита**
> (Phase 5a finyk-pages [#1452](https://github.com/Skords-01/Sergeant/pull/1452) + закриття
> `useAnalytics.ts` / `usePrivatbank.ts` через PR #1475). `grep ': any\b|<any>'` на
> `apps/web/src/modules/{finyk,fizruk}` — 0 матчів. Залишається тільки **3** свідомо
> залишених `Record<string, …>` патерни з in-line обґрунтуваннями
> (`parseFizrukWorkouts.ts`, `searchCache.ts`, `lazyImport.ts ComponentType<any>`).
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

<details>
<summary>2. ~~Прямі `localStorage` виклики~~ — Виконано (розгорнути)</summary>

### 2. ~~Прямі `localStorage` виклики~~ — Виконано

**Раніше:** 71 файл напряму звертався до `localStorage.getItem/setItem` без
error handling — будь-який `JSON.parse(localStorage.getItem(...))` без
try/catch крашить на quota exceeded, corrupted storage або private browsing.

**Closed (2026-05-06, PR #054 final).** ESLint-правило
[`sergeant-design/no-raw-local-storage`](../../packages/eslint-plugin-sergeant-design/index.js)
тепер працює без production-allowlist-у — у
[`eslint.config.js`](../../eslint.config.js) лишилися виключно
тестові ignore-ри (`**/*.test.{ts,tsx,js,jsx}`, `**/__tests__/**`).
Бюджет у
[`.tech-debt/localstorage-allowlist-budget.json`](../../.tech-debt/localstorage-allowlist-budget.json)
зафіксовано на `production: 0` (раніше 15 → 6 → 0).

**Як ми сюди прийшли:** burndown пройшов хвилями
46 → 41 → 27 → 17 → 16 → 15 (routine / finyk / onboarding /
chatActions / insights / recommendations / `useDarkMode` / `perf` /
`useActiveFizrukWorkout`) → 6 (PR #054a — drop стейлових
cloudSync v1 entry-їв після PR #052b/#052c видалили engine tree;
PR #053a видалив `apps/web/src/core/cloudSync/enqueue` no-op shim

- web `syncedKV` фасад) → 0 (PR #054 final — переписали 6 storage-
  primitive файлів так, щоб делегували у `webKVStore` з
  `@sergeant/shared`).

**Архітектура після PR #054 final.** `webKVStore` — KVStore-адаптер
над `window.localStorage` з cross-tab `onChange`-у — створюється у
`apps/web/src/shared/lib/storage/storage.ts` і реекспортується.
Решта 5 storage-primitive файлів (`storageManager.ts`, `storageQuota.ts`,
`typedStore.ts`, `createModuleStorage.ts`,
`shared/hooks/useLocalStorageState.ts`) імпортує singleton і
делегує всі `getString` / `setString` / `remove` / `listKeys` / `onChange`
у нього. Єдина пряма `Storage` згадка лишилася у `storageQuota.ts` —
там через renamed local binding (`const storage = globalThis.localStorage`),
бо хелпер `safeSetItem` мусить пробрасувати `setItem`-виключення
калерові (детектуючи quota / private-mode), а `webKVStore.setString`
їх свідомо swallow-ить. Renamed binding eslint-rule не тригерить
(rule перевіряє лише `localStorage.x` / `window.localStorage.x` /
`globalThis.localStorage.x` member-access patterns).

**Fix recipes для нових call-сайтів** (рекомендований порядок):

- **`webKVStore`** з `@shared/lib/storage/storage` — прямий доступ до
  KVStore-адаптера: `getString` / `setString` / `remove` / `listKeys` /
  `onChange`. Тиха обробка quota / private-mode помилок.
- **`safeReadLS<T>(key, fallback)` / `safeWriteLS(key, value)`** з
  `@shared/lib/storage/storage` — JSON-обгортка з типами і `JSON.parse`
  catch-ом для legacy-сайтів.
- **`useLocalStorageState<T>(key, initial)`** з
  `@shared/hooks/useLocalStorageState` — реактивне джерело істини у
  компоненті з debounce / serialize / validate.
- **`createModuleStorage(prefix)`** — цілий модуль зі своїм префіксом
  ключів і debounced-write-ами.
- **`safeJsonSet(key, value)` / `safeSetItem(...)`** з
  `@shared/lib/storage/storageQuota` — коли потрібно знати, чи запис
  пройшов (повертає `{ ok, reason, error }`); usual call-site —
  storage manager-міграції, які мають перезапускатись на write
  failure.

**Closed (2026-05-07, PR-и #063 / #064 / #065).** Фізичний свап `webKVStore` з
`window.localStorage` на SQLite-backed `kv_store(key TEXT PK, value JSON)` —
виконано трьома хвилями:

- **PR #063 (web swap із dual-write canary).** `webKVStore` фасад тепер делегує
  через `apps/web/src/shared/lib/storage/storage.ts:resolveStore()` — двоступенева
  драбина: (1) SQLite warm-cache (`getActiveSqliteKvStore()` після
  `bootstrapKvStore()` із PR #062) → reads з in-memory `Map<string, string>`
  popul-нутою на boot, writes — fire-and-forget `INSERT … ON CONFLICT(key) DO
UPDATE` у `kv_store`; cross-tab `onChange` через `BroadcastChannel("kv-store")`.
  (2) `localStorage`-fallback — pre-bootstrap, на bootstrap failure, у SSR / private
  mode / very old iOS WebView. (3) In-memory fallback — SSR + private mode без
  DOM `Storage`. PR #063 запустив 4-тижневий dual-write canary (writes у LS
  паралельно для rollback safety).
- **PR #064 (drop LS mirror, SQLite-only).** Stage 9 storage-roadmap-у —
  прибрано dual-write mirror, тепер SQLite — primary store, LS — лише fallback
  rung. Stage 7 → 9 closure.
- **PR #065 (mobile mirror).** `apps/mobile/src/lib/storage.ts:mobileKVStore`
  переключено на той самий SQLite-backed `kv_store` (через op-sqlite RN bridge
  замість sqlite-wasm). MMKV-fallback для legacy reads збережено на період
  міграційного покриття.

Це закриває §2 повністю: eslint-боундарі unified, споживачі бачать ту саму
`KVStore`-сигнатуру, а бекенд — durable SQLite з cross-tab fanout.

</details>

---

## 🟡 Бажане

<details>
<summary>3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано (розгорнути)</summary>

### 3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано

**Раніше:** 413 рядків з імпортами виду `from "./foo.js"` /
`from "./bar.jsx"` у `.ts`/`.tsx` файлах — працювало через Vite resolve, але
плутало IDE auto-imports і нових контриб'юторів.

**Зараз:** виконано codemod
[`scripts/codemods/strip-js-extensions/script.mjs`](../../scripts/codemods/strip-js-extensions/script.mjs) —
видалив `.js`/`.jsx` з 436 first-party-імпортів у 180 файлах. Зачіпає тільки
шляхи, що починаються з `.`, `@shared/`, `@finyk/`, `@fizruk/`, `@routine/`,
`@nutrition/` або `@sergeant/`. Зовнішні пакети (`@zxing/...`) спеціально
не торкається — їхні subpath-імпорти можуть вимагати реальної `.js`.

Codemod ідемпотентний: повторний запуск дасть `would rewrite 0 import(s)`.

> **Доповнено [PR #1411](https://github.com/Skords-01/Sergeant/pull/1411):** додано
> `eslint-plugin-import@^2.32.0` + правило `import/extensions: never` для
> bundler-fed apps (`apps/web`, `apps/mobile`). Зовнішні `@zxing/*` subpath-імпорти
> у allowlist. Новий код тепер не може реінтродукувати `.js`/`.jsx` extensions.

</details>

---

### 4. Великі файли (>600 рядків) — 4 файли (тільки `apps/web/src`) — **Initiative 0001 closed; majority of carry-over decomposed**

> **Status (2026-05-04):** [`Initiative 0001 — Module decomposition`](../initiatives/archive/_0001-module-decomposition.md)
> закрита як **Done**. Phase 1 (lint guard + allowlist), Phase 2 (5 з 5
> запланованих топ-1 моноліт-файлів декомпоновано — `useStorage.ts`,
> `chatActions/types.ts`, `Icon.tsx`, `sw.ts`, `RoutineApp.tsx`) і Phase 3
> (фінальна документація + status update) виконані. Lint guard `max-lines:
[error, 600]` для `apps/web/src/**/*.{ts,tsx}` залишається активним —
> будь-який новий файл `apps/web/src/**` ≥ 600 LOC далі падає на `pnpm lint`.
>
> Carry-over status (2026-05-13). З 12 файлів, які Initiative 0001 переніс у
> successor, **10 вже декомпозовано** після 2026-05-04: `Workouts.tsx`,
> `LogCard.tsx`, `NutritionApp.tsx`, `Subscriptions.tsx`, `fizrukActions.ts`,
> `Exercise.tsx`, `Progress.tsx`, `AssetsTable.tsx`, плюс decomposition
> `HubDashboard.tsx` (676 → 115 LOC) і `hubChatContext.ts` (681 → 32 LOC,
> PR #2517 round-2 0013). `max-lines` allowlist у `eslint.config.js` тепер
> **порожній**. Активних carry-over залишилось **2**: `FinykApp.tsx`
> (640 LOC) і `RoutineCalendarPanel.tsx` (602 LOC). Плюс **2 нових leakers**,
> які з'явились після audit-у 0001: `OnboardingWizard.tsx`,
> `dualWrite/adapter.ts` — поки що під `skipBlankLines + skipComments`
> max-lines lint не падає (LOC > 600 raw, але <600 не-blank/не-comment),
> моніторити окремо. `core/auth/AuthPage.tsx` (раніше 694 LOC) було
> декомпозовано на `AuthPage.tsx` (150 — shell + mode-switch composition),
> `LoginForm.tsx` (133), `RegisterForm.tsx` (152), `ForgotPasswordPanel.tsx`
> (85), `useForgotPassword.ts` (87 — reset-panel state + 6-сек auto-close),
> `GoogleSignInButton.tsx` (43), `authFormPrimitives.tsx` (99 — `FieldError` +
> `PasswordStrengthBar` + `PasswordVisibilityToggle`), `authSchemas.ts` (38 —
> zod-схеми login/register + типи). Всі < 200 LOC. Деталі — в Outcome секції
> [`_0001-module-decomposition.md`](../initiatives/archive/_0001-module-decomposition.md).
>
> Свіжість таблиці нижче — на 2026-05-04; перерахунок виконується вручну
> через `find apps/web/src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec wc -l {} +`
> (см. також `pnpm lint` — `max-lines` правило точне джерело істини).

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
> Усі < 600 LOC.
>
> `core/App.tsx` (раніше 645 рядків) декомпозовано на
> `core/App.tsx` (224 — outer provider tree + AppInner shell), `app/appPaths.ts`
> (52 — URL constants + `KNOWN_PATHS`), `app/RedirectTo.tsx` (14),
> `app/useAppEffects.ts` (153 — idle-prefetch / SW message / cloud-pull /
> hub-bus / `HUB_OPEN_MODULE_EVENT` listeners), `app/StandaloneRoutes.tsx`
> (181 — `/sign-in`, `/reset-password`, `/profile`, `/design`, `/pricing`,
> `/assistant`, `/chat`, `/welcome`, 404 dispatch), `app/HubHomeView.tsx`
> (141 — no-active-module hub home surface), `app/ActiveModuleView.tsx`
> (132 — active-module shell з лінивими `FinykApp`/`FizrukApp`/`RoutineApp`/
> `NutritionApp`). Усі < 200 LOC. Count 22 → 21.
>
> `shared/components/ui/VoiceMicButton.tsx` (раніше 852 рядків) декомпозовано на
> `VoiceMicButton.tsx` (256 — публічний компонент + re-export `useVoiceInput`/
> `UseVoiceInputOptions`/`UseVoiceInputReturn` для backward-compat),
> `voice/useVoiceInput.ts` (139 — Web Speech API hook + типи),
> `voice/useGroqVoiceInput.ts` (270 — Groq Whisper recorder hook через
> `/api/transcribe` + утиліти `pickRecorderMimeType`/`isGroqSupported`),
> `voice/PendingVoiceChip.tsx` (188 — 3-сек preview/undo чип з countdown
> ring + portal-positioning), `voice/resolveVoiceProvider.ts` (12 — env-flag
> resolver `auto`/`groq`/`webspeech`). Count 21 → 20.
>
> `core/lib/chatActions/finykActions.ts` (раніше 758 рядків, 17 case-branchів)
> декомпозовано на thin dispatcher `finykActions.ts` (96 LOC) + 7 модулів у
> `finykActions/`: `search.ts` (248 — `change_category`/`find_transaction`/
> `batch_categorize` + helpers `toIsoDay`/`toDisplayAmount`/`readSearchTransactions`/
> `matchesFinykSearch`/`clampLimit`/`formatTxList` + тип `FinykSearchTx`),
> `transactions.ts` (134 — `create_transaction`/`hide_transaction`/
> `delete_transaction`/`split_transaction` з undo на manual-entries),
> `debts.ts` (112 — `create_debt`/`create_receivable`/`mark_debt_paid`),
> `budgets.ts` (114 — `set_budget_limit`/`set_monthly_plan`/`update_budget`
> з `limit`/`goal` scope), `assets.ts` (84 — `add_asset` з shape-equality
> undo + `recurring_expense`), `monobank.ts` (50 — `import_monobank_range`
> з cache-clear + `hub:finyk-mono-import-range` event), `report.ts` (53 —
> `export_report` для week/month/custom). Усі тести (68) зелені, публічний
> API (`handleFinykAction`) ідентичний. Count 20 → 19.
>
> `core/lib/chatActions/crossActions.ts` (раніше 788 рядків) декомпозовано на
> `crossActions.ts` (78 — thin dispatcher над `action.name` switch),
> `crossActions/helpers.ts` (68 — `weekLabelToMondayKey`/`previousWeekKey`/
> `formatWeekRangeLabel`/`diffLine`), `crossActions/briefingHandlers.ts` (159 —
> `morning_briefing` + `weekly_summary`), `crossActions/goalAndUtility.ts` (94 —
> `set_goal` + `convert_units`), `crossActions/financeAnalytics.ts` (173 —
> `spending_trend` + `category_breakdown` + `detect_anomalies`),
> `crossActions/noteHandlers.ts` (64 — `save_note` + `list_notes`),
> `crossActions/memoryHandlers.ts` (84 — `remember` + `forget` + `my_profile`),
> `crossActions/exportHandler.ts` (46 — `export_module_data` з вкладеним
> per-module switch), `crossActions/compareWeeksHandler.ts` (121 — `compare_weeks`
> з 4 module-секціями). Усі < 200 LOC. Count 19 → 18.
>
> `modules/fizruk/pages/Body.tsx` (раніше 774 рядків) декомпозовано на
> `Body.tsx` (414 — публічний `Body` компонент: форма + конфігурація графіків +
> композиція), `Body/storage.ts` (33 — `TREND_STORAGE_PREFIX`/
> `JOURNAL_OPEN_STORAGE_KEY`/`JOURNAL_ENTRY_OPEN_PREFIX` константи +
> `JournalEntry` тип + `readTrendOpen`/`readPersistedOpen`/
> `writePersistedOpen` обгортки), `Body/trendUtils.ts` (19 —
> `lastValidValue`/`firstValidValue` для даних графіків), `Body/ScoreButton.tsx`
> (45 — energy/mood 1–5 кнопки + `ENERGY_LABELS`/`MOOD_LABELS`),
> `Body/CollapsibleTrendCard.tsx` (95 — collapsible картка графіка зі
> збереженим станом відкриття), `Body/JournalEntryCard.tsx` (126 — окремий
> щоденниковий запис із міткою дати + підсумком + видаленням), `Body/JournalSection.tsx`
> (78 — обгортка для журналу зі згортанням верхнього рівня). Усі < 200 LOC. Count 19 → 18.
>
> `core/onboarding/seedDemoData.ts` (раніше 897 рядків) декомпозовано на
> `seedDemoData.ts` (131 — публічна обгортка: `SEEDED_KEYS` + `seedDemoData()` +
> `resetDemoData()` + `runDemoSeedFromUrl()`),
> `seedDemoData/keys.ts` (31 — всі localStorage-ключі),
> `seedDemoData/utils.ts` (100 — write/remove helpers + `dateKey`/`daysAgo`/
> `shortId`/`buildMonoTx` + типи `MonoTx`/`ManualExpense`),
> `seedDemoData/seedFinyk.ts` (282 — фікстура для Finyk: 23 Mono-транзакції + 4 ручні
> витрати + місячний план), `seedDemoData/seedFizruk.ts` (120 — 2 тренування +
> 1 вимір), `seedDemoData/seedRoutine.ts` (100 — 5 звичок + сітка
> виконань на 14 днів + план віджимань), `seedDemoData/seedNutrition.ts` (140 —
> прийоми їжі / вода / преференції за 2 дні), `seedDemoData/seedHubQuickStats.ts`
> (43 — попередній вміст рядка статусу хаба). Усі < 200 LOC. Серед seeded об'єктів всі
> промарковані `demo: true`, щоб `cleanupDemoData` коректно стрипнув їх на first-boot. Count 18 → 17.
>
> **Скоуп таблиці нижче** — лише `apps/web/src`. Mobile (CelebrationModal 671 LOC декомпозовано на оркестратор + confetti/hooks/types — max 297 LOC; раніше тут лідирував `TransactionsPage.tsx` 1215, теж декомпозовано на 14 модулів, max 523 LOC),
> packages (`packages/shared/src/lib/assistantCatalogue.ts` 1133, `schemas/api.ts` 986,
> `openapi/routes.ts` 837), server (`modules/chat/chat.ts` 783) — трекаються окремо
> (mobile tracker — `docs/tech-debt/mobile.md`).

| Рядків | Файл                                                  | Категорія                       |
| ------ | ----------------------------------------------------- | ------------------------------- |
| 691    | `core/onboarding/OnboardingWizard.tsx`                | Новий leaker (не в Init. 0001)  |
| 641    | `modules/fizruk/lib/dualWrite/adapter.ts`             | Новий leaker (не в Init. 0001)  |
| 640    | `modules/finyk/FinykApp.tsx`                          | Init. 0001 carry-over (активне) |
| 602    | `modules/routine/components/RoutineCalendarPanel.tsx` | Init. 0001 carry-over (активне) |

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

### 6. Тестове покриття — 243 test файлів на 790 source

~31% файлів мають тести (re-audit 2026-05-13). Критичні модулі без тестів / з тонким покриттям
(актуально):

- `HubReports.tsx` (592 рядків, складна агрегація) — досі без тестів
- ~~`TodayFocusCard.tsx` (recommendation engine інтеграція)~~ — `TodayFocusCard.test.tsx` додано
- ~~`ProfilePage.tsx` (1060 рядків)~~ — декомпозовано на `core/profile/` (max 383 LOC)

**Зроблено 2026-04-28:** додано focused coverage для `HubDashboard.tsx`
(`HubDashboard.test.tsx`: module previews / empty states, inactive modules,
quick actions, callback routing, weekly digest footer).

**Зроблено 2026-05-03:** додано unit-тести для cloud-sync pure utilities
(`errorNormalizer`, `conflict/parseDate`, `conflict/pushSuccess`,
`engine/buildPayload`, `engine/retryAsync`, `queue/collectQueued`,
`state/{versions,migration,events,moduleData}`) і для
`recommendations/financeContext` (LS shapes, `thisMonthTx` filtering,
`categorySpend` legacy + canonical, manual expenses, splits, budgets/limits).
+88 cloud-sync + 21 financeContext = +109 тестів у 11 нових файлах.

**Fix:** додати тести на reports aggregation (`HubReports.tsx` UI),
залишок recommendation engine (`useCoachInsight`, `useWeeklyDigest`),
а також engine/{pull,upload,replay} cloud-sync wrappers.

---

## 🟢 Nice-to-have

### 7. `console.*` у production коді — 59 викликів у 38 файлах (re-audit 2026-05-13)

**Re-audit 2026-05-13.** Скан `apps/web/src/**` (без тестів і `__tests__/`)
дає **59 викликів у 38 production-файлах**. Зростання з 35 (2026-05-02) →
59 — наслідок PR-ів #062 / #063 / #064 (SQLite kv-store bootstrap + cloud-sync
residual-import path) та нового `chunkReload.ts`/`ShellDeepLinkBridge.tsx`
logger-у:

- **SQLite kv-store boot** — `core/db/kvStoreBoot.ts` (2), `core/db/sqlite.ts` (4),
  `shared/lib/storage/typedStore.ts` (2), `shared/lib/storage/storageManager.ts` (1),
  `shared/lib/storage/createModuleStorage.ts` (1).
- **Residual-import (cloud-sync legacy LS pull)** —
  `modules/{finyk,fizruk,routine,nutrition}/lib/residualImport.ts` + `sqliteReadBoot.ts`.
- **Chunk-reload UX** — `core/lib/chunkReload.ts` (3 — best-effort Sentry warn
  на dynamic-import failure / refresh-budget).
- **DualWrite (fizruk + routine adapters)** — `modules/fizruk/lib/dualWrite/{adapter,index}.ts`
  - `modules/routine/lib/dualWrite/{adapter,index}.ts`.
- **Push / monobank webhook** — `shared/hooks/usePushNotifications.ts` (4),
  `modules/finyk/hooks/useMonobankWebhook.ts` (2).

| Категорія                        | Файли                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | К-сть |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Debug-mode logger                | `core/cloudSync/logger.ts` (2), `shared/lib/perf.ts` (1), `core/observability/analytics.ts` (1)                                                                                                                                                                                                                                                                                                                                                                             | 4     |
| Best-effort failure warn (catch) | `main.tsx` (1), `core/app/ShellDeepLinkBridge.tsx` (1), `core/insights/useWeeklyDigest.ts` (1), `core/lib/chatActions/nutritionActions.ts` (1), `core/cloudSync/engine/{initialSync,push}.ts` (3), `core/hooks/useSpeech.ts` (1), `modules/finyk/hooks/usePrivatbank.ts` (1), `modules/finyk/hooks/useStorage.ts` (1), `shared/hooks/usePushNotifications.ts` (4), `shared/lib/{createModuleStorage,storageManager,typedStore}.ts` (3), `shared/components/ui/Icon.tsx` (1) | 19    |
| Fallback warn (sqlite probe)     | `core/db/sqlite.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 4     |
| User-facing debug toggle         | `core/settings/PWASection.tsx` (4 — кнопки «Діагностика SW» / «Очистити кеш SW»), `sw.ts` (1 — `[sw] debug enabled`)                                                                                                                                                                                                                                                                                                                                                        | 5     |
| dualWrite structured logger      | `modules/routine/lib/dualWrite/{adapter,index}.ts`                                                                                                                                                                                                                                                                                                                                                                                                                          | 2     |
| JSON-parse error                 | `modules/nutrition/hooks/useNutritionLog.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                | 1     |

**Усі 35 — навмисні** (best-effort logging без Sentry-context або
debug-mode toggles). Виправлень не потрібно. Як пастка для нових
випадків — додати ESLint-правило `no-console` з allowlist на
debug-logger/warn-патерни — окремий PR (Phase 6 candidate).

---

### 8. `eslint-disable no-eyebrow-drift` — 25 рядків у `apps/web/src` + 10 у `apps/mobile/src`

Custom DS-rule пригнічується 25 разів у `apps/web/src` і 10 разів у `apps/mobile/src`
(2026-05-13 re-audit). Усі з обґрунтуваннями в коментарях (кастомні hero kickers,
calendar headers, pill-overlay typography, marketing eyebrow).

**Зроблено [PR #1414](https://github.com/Skords-01/Sergeant/pull/1414):** розширено
`SectionHeading` API новими слотами (`eyebrowTone` / `eyebrowAs` / `eyebrowId` /
`renderEyebrow`) і виведено 7 disable-сайтів з mobile primitive-owners + ключові
hub/settings/dashboard кейси (mobile 17 → 10). Залишок 36 disable-ів — або
legitimate (calendar headers / hero kickers, з обґрунтуванням), або кандидати
на нові slot-и в наступному API-расширенні.

---

### 9. `any` типи — ✅ 0 trackable production-`any` + 3 by-design loose

**Production (оновлено 2026-05-03):** попередня таблиця з 10 файлів
(`modules/finyk/pages/{transactions,budgets}/**` + 2 fizruk-decomposition
leftovers) **повністю закрита** Phase 5a finyk-pages cleanup-ом
([PR #1452](https://github.com/Skords-01/Sergeant/pull/1452), commit
`25cc4c05`). Перевірити можна `rg ": any\b|<any>" apps/web/src/modules/finyk/pages`
— нуль матчів. Аналогічно по `apps/web/src/modules/fizruk`. Залишкові
`any` у finyk-hooks — `useAnalytics.ts` (PR #1475: `AnyTx → Transaction
/ TxSplitsMap / Category`) і `usePrivatbank.ts` (цей PR: `PrivatTx →
PrivatTransaction / PrivatAccount` + явний `PrivatTxApiRow` interface) —
**закриті**.

> Поточний стан: `rg "type \w+ = any|: any\b|as any" apps/web/src
--glob '!*.test.*' --glob '!*.stories.*'` → лише навмисні
> `Record<string, any>` із обґрунтуваннями (див. таблицю нижче)
> та `ComponentType<any>` у `core/lib/lazyImport.ts`.

**Trackable follow-up:** немає. Якщо новий `any` з'явиться у
production-сурфейсі — додати ESLint-правило `@typescript-eslint/no-explicit-any`
з error-severity у `apps/web/src/modules/**` і `apps/web/src/core/**` буде
тривіальним наступним кроком (зараз правило warn, бо by-design loose
patterns нижче приховували signal від real production drift).

**By-design loose `Record<string, any>` (3 файли, з in-line обґрунтуваннями):**

| Файл                                     | Pattern                          | Обґрунтування                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/lib/ui/parseFizrukWorkouts.ts:8` | `Record<string, any>[]`          | Парсер для обох legacy-форматів (`[{...}]` і `{ workouts: [...] }`) із fizruk localStorage. Свідомо loose, бо персистовані payload-и старіші за поточну shape; type-guard у consumer-і.                          |
| `core/hub/search/searchCache.ts:54`      | `type LooseRecord = Record<…,…>` | Той самий fizruk-shape для `searchCache` — спільний alias для `parseFizrukWorkouts` / `parseFizrukCustomExercises`, які бачать у HubSearch на гарячому шляху.                                                    |
| `core/lib/lazyImport.ts:39`              | `ComponentType<any>`             | Свідомий вибір над `unknown` — пояснено у коментарі (lines 33–37): callers мають точну сигнатуру через `(typeof import(...)).Foo`, тут `any` потрібен щоби вирівняти всі `lazy(() => …)`-callsites під один тип. |

**Fix recipe для нових випадків:** замінити `: any` на explicit union, на
тип з `@sergeant/finyk-domain/domain/types` (`Transaction`, `TxSplitsMap`,
`Category`, …) або на `unknown` + type-guard. Якщо shape реально гібридний
(легасі-localStorage payload), додати `eslint-disable-next-line` з
обґрунтуванням і занести у by-design таблицю вище.

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

### 11. Strict TypeScript rollout — ✅ Phase 4 complete (full `strict: true`)

**Контекст (історія):** `apps/web/tsconfig.json` мав `strict: false` +
`allowJs: true`. Базовий `packages/config/tsconfig.base.json` — `strict: true`,
але web-app перевизначав його, що було regression risk на найбільшому
production surface. Phase 4 (PR4) флипнув `strict: true` і видалив
`allowJs` — апп тепер на повному strict-режимі без bypass-патернів.

**Триетапний план:**

| Phase | Прапор                                      | Скоуп                                                                                                         | Статус      |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | `strictNullChecks`                          | `src/shared/**`                                                                                               | ✅ Виконано |
| 2     | `strictNullChecks`                          | + `src/test/**`, `src/core/{auth,cloudSync,components,hints,hooks,observability,pricing,profile}/**` (10 дир) | ✅ Виконано |
| 3     | `strictNullChecks`                          | + `src/modules/{routine,nutrition,finyk,fizruk}/**`, `src/core/{app,hub,insights,onboarding,settings,lib}/**` | ✅ Виконано |
| 3.1   | `strictNullChecks`                          | + `src/core/designShowcase/**`, `src/core/stories/**`                                                         | ✅ Виконано |
| 4     | повний `strict: true` + видалення `allowJs` | всі файли                                                                                                     | ✅ Виконано |

**Phase 1 деталі (PR-6.A):**

- Додано `tsconfig.strict.json` у `apps/web/` — extends основний tsconfig,
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

**Phase 4 (✅ complete, PR4 merged):** увімкнено `strict: true` у
головному `apps/web/tsconfig.json`, видалено `allowJs`, виправлено всі
**419 помилок** strict-mode без `any`/`@ts-expect-error`/`as unknown as`.
Web-app тепер на повному strict-режимі — `pnpm --filter @sergeant/web
typecheck` зелений на чистому tsconfig (без діагностичних додатків).

- **Підсумок (2026-05-03):**
  Стартовий baseline — **419 помилок** (повний `strict: true` +
  `allowJs: false` без змін у коді, через діагностичний
  `tsconfig.strict-full.json`).
  - **PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388)** —
    `sw.ts` (−27), `core/onboarding/presetApply.ts` (−23) = **−50**.
  - **PR2 [#1391](https://github.com/Skords-01/Sergeant/pull/1391)** —
    5 fizruk components (`AddExerciseSheet`, `WorkoutTemplatesSection`,
    `WorkoutItemCard`, `WorkoutCatalogSection`, `ExerciseDetailSheet`):
    **−99** на стартовому baseline (на чистому main −101 завдяки
    ripple-у з типізованих props у викликах).
  - **PR3 [#1402](https://github.com/Skords-01/Sergeant/pull/1402) /
    [#1404](https://github.com/Skords-01/Sergeant/pull/1404)** —
    `Workouts.tsx` (−19), `Exercise.tsx` (−18),
    `WeeklyDigestCard.tsx` (−15) + ripple = **−55**. Pre-PR4 baseline = 194.
  - **PR4 (final flip)** — добив усі **194 залишкові помилки** + flip
    `strict: true` + видалення `allowJs`. Топ-блокери цієї фази:
    `MiniLineChart.tsx` (13), `Programs.tsx` (11),
    `WorkoutFinishSheets.tsx` (9), `QuickStartSheet.tsx` (9),
    `PresetSheet.tsx` (9), `Body.tsx` (9, через локальне розширення
    `useDailyLog`), `AssetsTxPickerView.tsx` (8),
    `useWorkoutTemplates.test.tsx` (9), `useWorkouts.test.tsx` (8),
    `WarmupCooldownChecklist.tsx` (7), `insightsEngine.test.ts` (7),
    `Atlas.tsx` (6), `FirstActionSheet.tsx` (6), плюс ~30 файлів по
    1–5 помилок (`Measurements.tsx`, `Dashboard.tsx`, `AssetsTable.tsx`,
    `Overview.tsx`, `Transactions.tsx`/`useTransactionSelection.ts`,
    `FizrukApp.tsx`/`useFizrukProgramStart.ts`, `Progress.tsx`,
    `BodyAtlas.tsx`, `RestTimerOverlay.tsx`, `WellbeingChart.tsx`,
    `TodayPlanCard.tsx`, `fizrukStorage.ts`/`fizrukStorage.test.ts`,
    `activeWorkoutLib.ts`, `hubChatContext.ts`, `featureFlags.test.ts`,
    `dailyFinykSummary.test.ts`, `hasLiveWeeklyDigest.test.ts`,
    `WorkoutJournalSection.finish.test.tsx`, `syncEngine.test.ts`,
    `useFinykPersonalization.ts`, `AssetsForm.tsx`, `TxListItem.tsx`,
    `TransactionList.tsx`, `ResetPasswordPage.tsx`,
    `ActiveWorkoutPanel.tsx`, `WorkoutItemCard.tsx`).
- **Загальний підсумок:** **−419 помилок (100 % скоупу)** через 4 PR;
  жодного `any`/`@ts-expect-error`/`as unknown as` ні в production-коді,
  ні в нових патчах. Pre-existing `: any`-плями у `transactions/budgets`-
  decompositions залишаються в окремому борговому пункті § 9.
- **Закриті топ-блокери (історія Phase 4 progress):**
  PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388) (merged):
  `sw.ts` (27), `core/onboarding/presetApply.ts` (23). PR2
  [#1391](https://github.com/Skords-01/Sergeant/pull/1391) (merged):
  `modules/fizruk/components/workouts/AddExerciseSheet.tsx` (21),
  `modules/fizruk/components/WorkoutTemplatesSection.tsx` (21),
  `modules/fizruk/components/workouts/WorkoutItemCard.tsx` (20),
  `modules/fizruk/components/workouts/WorkoutCatalogSection.tsx` (20),
  `modules/fizruk/components/workouts/ExerciseDetailSheet.tsx` (19).
  PR3 (in flight, fizruk pages + insights):
  `modules/fizruk/pages/Workouts.tsx` (19),
  `modules/fizruk/pages/Exercise.tsx` (18),
  `core/insights/WeeklyDigestCard.tsx` (15).
- **Закриті топ-блокери:**
  `modules/finyk/hooks/useStorage.ts` (було 71),
  `modules/finyk/pages/AssetsTxPickerView.tsx` (було 30),
  `modules/finyk/pages/AssetsTable.tsx` (було 26),
  `modules/finyk/hooks/usePrivatbank.ts` (було 26) — закриті у
  `b5e47360 fix(web): eliminate implicit-any in modules/finyk`;
  `modules/fizruk/hooks/useWorkouts.ts` (було 35) — закрито у
  `12fea1d5 fix(web): eliminate implicit-any in modules/fizruk/hooks/useWorkouts`;
  `modules/fizruk/components/workouts/WorkoutJournalSection.tsx` (було 31)
  — закрито у `e29b0ba4 fix(web): eliminate implicit-any in
modules/fizruk/components/workouts/WorkoutJournalSection`;
  `modules/fizruk/components/workouts/ActiveWorkoutPanel.tsx` (було 29)
  — закрито в поточному PR через `ActiveWorkoutPanelProps` interface +
  явні типи `Workout`/`WorkoutItem`/`WorkoutGroup`/`ChecklistItem` на
  destructure-binding-ах та callback-ах (плюс розширення `WorkoutGroup`
  у `@sergeant/fizruk-domain` опціональними `type`/`restSec`, що вже
  персистились UI-ом; canonical `RestTimerState` reused з
  `useFizrukRestSound`). Загальне зниження з 768 до 374 (-394) без
  жодних runtime-змін.
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

**Phase 5 clean-up (2026-05-03, post-PR4):** додатковий strict-режим прапорів

- explicit `allowJs: false` на web/console — фінальний lock down strict TS
  у repo:

* `packages/config/tsconfig.base.json` — додано `noImplicitOverride: true`.
  Прапор тепер успадковується усіма app-/package-tsconfig-ами; нові
  override-методи без `override` keyword падають у typecheck.
  - `apps/web/src/core/ErrorBoundary.tsx`,
    `apps/web/src/core/ModuleErrorBoundary.tsx`,
    `apps/web/src/shared/components/ui/SectionErrorBoundary.tsx` —
    додано `override` до 5 React class methods (`componentDidCatch`,
    `render`).
  - `packages/db-schema/src/migrate/runner.ts` — `MigrationFailedError.cause`
    позначено `override` (наслідується з `Error.cause`).
* `apps/web/tsconfig.json` — додано explicit `"allowJs": false`
  (override наслідуваного `true` з base) і прибрано
  `vite.config.js`/`vitest.config.js` з `include` (build-config-и не
  type-check-аються разом з src).
* `tools/console/tsconfig.json` — додано explicit `"allowJs": false`
  (у `tools/console/src` немає JS-файлів, прапор виставлено на майбутнє
  без зміни поведінки).
* `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/adapter.test.ts` —
  drive-by фікс 18 pre-existing TS7053 помилок, що були прихованими
  до увімкнення `noImplicitOverride` через свою власну природу
  (10 викликів `handle.client.all<…>()` обернуто в `await`, бо
  `SqliteMigrationClient.all()` має сигнатуру `R[] | Promise<R[]>`).
* ~~`apps/server/tsconfig.json` (`allowJs: true`) і
  `apps/mobile-shell/tsconfig.json` (наслідує `true`) залишено as-is —
  вони навмисно тримають JS-файли (`migrate.mjs`, build helpers).~~
  **Закрито у Phase 5c (PR #1454):** обидва тепер на `allowJs: false`.
  `apps/server/tsconfig.json` має `migrate.mjs` у `include`, але під
  `allowJs: false` `.mjs`-файли не обробляються `tsc` (тільки `.ts`),
  тож build-helper не ламається — `pnpm --filter @sergeant/server typecheck`
  зелений. Build-pipeline не торкається — `migrate.mjs` запускається
  напряму через node, без TS-toolchain-у.

**Phase 5c — `allowJs` workspace-wide flip ([PR #1454](https://github.com/Skords-01/Sergeant/pull/1454), 2026-05-03):**

- `packages/config/tsconfig.base.json` — `allowJs: true → false`
  (single source of truth). Раніше base дозволяв JS-файлам неявно
  потрапляти у TS-pipeline через успадкування — `pnpm strict:coverage`
  на цьому показував `allowJs: ⚠️` для всіх пакетів окрім `apps/web`
  / `tools/console`. Тепер base стрімкий.
- Explicit `allowJs: false` + `checkJs: false` додано на всі 12
  app/package tsconfig-и (`apps/server`, `apps/mobile`, `apps/mobile-shell`,
  `packages/{api-client,shared,db-schema,insights,finyk-domain,fizruk-domain,
nutrition-domain,routine-domain}`). Для `apps/server` — це flip з
  `true → false`; для решти — додавання прапора, бо вони раніше
  наслідували `true` з base.
- `apps/mobile/tsconfig.json` — додано 2 нові `paths` mappings:
  `@sergeant/design-tokens/tokens` → `index.d.ts`, `@sergeant/design-tokens/mobile`
  → `mobile.d.ts`. Раніше legacy glob `@sergeant/design-tokens/*` мапив
  ці subpath-імпорти на runtime `tokens.js`/`mobile.js`-файли, які під
  `allowJs: true` мовчки типувалися як `any`. Під `allowJs: false`
  TS падав з TS7016 (Could not find a declaration file). Path-mapping
  на `.d.ts` дає типи без зайвої магії.
- Регресія unblocked: `pnpm strict:coverage` тепер показує колонку
  `allowJs: —` (тобто прапор не виставлений у `true`) для всіх 13
  пакетів. 100 % strict-coverage без жодного `⚠️`.

**Phase 5 cleanup — діагностичні tsconfig-и видалено (2026-05-03):**

- `tsconfig.strict.json` і `tsconfig.noimplicitany.json` (обидва у `apps/web/`) —
  обидва extends-или main `tsconfig.json` (який тепер уже `strict: true`)
  і додавали `strictNullChecks: true` / `noImplicitAny: true` лише на
  суб-набір директорій. Після Phase 4 ці прапори вже глобально активні
  через `strict: true`, тож scoped-конфіги стали no-op-обгортками над
  тим самим скоупом — клон, що сповільнював `pnpm typecheck` без
  додаткового сигналу.
- `apps/web/package.json` — `typecheck` скрипт скорочено з 4-х tsc-passes
  (`tsconfig.json` + `tsconfig.sw.json` + `tsconfig.strict.json`
  - `tsconfig.noimplicitany.json`) до 2-х (`tsconfig.json` + `tsconfig.sw.json`).
- `tools/tsconfig-guard/allowlist.json` — застарілий entry на
  `apps/web` зі `strict: false` / `expires: 2026-08-15` видалено
  (в реальності apps/web на `strict: true` від Phase 4; entry був
  hand-over із Phase 3.1 baseline і вже не відповідав стану).
- `apps/web/src/core/lib/intentPrefetch.ts` — docstring оновлено:
  посилання на `tsconfig.strict.json`-only-scope замінено на код-сплит
  motivation (єдина причина паттерна тепер — runtime registry для
  static-import-у з hub без тягнення модульного subgraph у hub-чанк).
- Регресійний guardrail тепер такий: (1) base `tsconfig.base.json` має
  `strict: true` + `noImplicitOverride: true`; (2) `tools/tsconfig-guard`
  блокує silent-drift апп-tsconfig-ів проти base; (3) `pnpm typecheck`
  у CI ганяє повний strict pass на всі 4 апи + 9 пакетів. Окремих
  scoped-діагностичних конфігів більше не потрібно.

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

### 11.1 Що ще лишилось до «ідеального» стрікту

> **Trekається у [Initiative 0012 — Perfect TS strictness rollout](../initiatives/archive/_0012-perfect-strictness-rollout.md).** Ця секція = living-burndown (per-flag статус + per-workspace baseline). Ініціатива = roadmap (15-17 PR-ів, 6 фаз, ETA 4 sprints, criteria DONE). Зміни синхронізуйте обома місцями.

Канонічний `strict: true` + `noImplicitOverride` + `allowJs: false` —
13/13 (100 %), enforced. Але «ідеально» — ні. Backlog opt-in-прапорів
та залишкових `as unknown as`-каст:

| #   | Прапор / патерн                                                                                                                  | Очікуваний impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Статус                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `noUncheckedIndexedAccess` (`arr[i]` стає `T \| undefined`)                                                                      | **1225 baseline / 280 файлів** (виміряно 2026-05-03, PR § 6a) → 0. Flipped у base, **12 / 12 пакетів = 100%** (closure PR `0012-close-strictness-rollout` 2026-05-05 закрив `apps/web` + `apps/server` residual). Allowlist для `noUncheckedIndexedAccess` — порожній. Tracked у [Initiative 0012 § Phase 6a](../initiatives/archive/_0012-perfect-strictness-rollout.md).                                                                                                                    | ✅ Done                                  |
| 2   | `exactOptionalPropertyTypes` (`?:` не дозволяє явний `\| undefined`)                                                             | **44 baseline для `apps/server` → 0** (closure PR `0012-close-strictness-rollout` 2026-05-05 — 8 інтерфейсів + 5 call-sites; patterns: bidirectional `\| undefined` propagation + spread-only conditional includes). 11 / 12 пакетів вмикнули flag. **Residual:** `apps/web` ~497 errors / ~150 файлів (combined-baseline з row 4) — override `false` + allowlist `expires: 2026-09-30`. Tracked у [Initiative 0012 § Phase 6b](../initiatives/archive/_0012-perfect-strictness-rollout.md).  | 🟡 in-flight (apps/web only — Sprint 5+) |
| 3   | `noImplicitReturns` + `noFallthroughCasesInSwitch`                                                                               | **8 baseline / 8 файлів** (виміряно 2026-05-04 — `apps/web` 6, `apps/server` 2, виключно у `useEffect`-cleanup-ах і `RequestHandler`-ах; 0 `noFallthroughCasesInSwitch` violations). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6c](../initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS.                                                                                                                                  | ✅ Done                                  |
| 4   | `noPropertyAccessFromIndexSignature` (`.foo` на index-signature → `["foo"]`)                                                     | **TS4111 errors у `apps/server` → 0** (codemod-based bracket-notation transform, closure PR `0012-close-strictness-rollout` 2026-05-05). 11 / 12 пакетів вмикнули flag. **Residual:** `apps/web` ~497 errors / ~150 файлів (combined-baseline з row 2) — override `false` + allowlist `expires: 2026-09-30`. Tracked у [Initiative 0012 § Phase 6d](../initiatives/archive/_0012-perfect-strictness-rollout.md).                                                                              | 🟡 in-flight (apps/web only — Sprint 5+) |
| 5   | `noUnusedLocals` / `noUnusedParameters` (зараз ESLint-enforced, не TS-enforced)                                                  | **1 baseline / 1 файл** (виміряно 2026-05-04 — `apps/web/src/core/db/__tests__/sqlite-wasm-fake.ts` `cols` field, mortified як dead state). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6e](../initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS. ESLint `@typescript-eslint/no-unused-vars` залишається активним як doubly-redundant safety net (немає вартості, але ловить runtime-cases типу JSX-imports краще, ніж TS). | ✅ Done                                  |
| 6   | `as unknown as X` у тестах (~50 файлів — mock-каст `vi.fn()`, fake `PointerEvent`, тощо)                                         | mid — нормально для test-коду, але формально strict-violation. Потенційно — типізовані mock-helper-и + `vitest-mock-extended`                                                                                                                                                                                                                                                                                                                                                                 | ⏳ pending                               |
| 7   | `: any` у тест-only allowlisted файлах (e.g. `apps/web/src/core/lib/lazyImport.ts:33-39 type AnyComponent = ComponentType<any>`) | low — навмисно з коментарем, але формально lint-vio                                                                                                                                                                                                                                                                                                                                                                                                                                           | ⏳ pending                               |

**Phase 6a baseline-experiment (PR 2026-05-03):**

`noUncheckedIndexedAccess: true` додано у [`packages/config/tsconfig.base.json`](../../packages/config/tsconfig.base.json).
Кожен `arr[i]` стає `T | undefined`, що ловить безмовчні runtime-баги
де index access без range-check / membership-guard.

Baseline (виміряно через `npx tsc -p tsconfig.json --noEmit` per-workspace,
обходячи turbo cascade-cancel):

| Workspace                   |   Errors |   Files | Override |
| --------------------------- | -------: | ------: | :------- |
| `apps/web`                  |      625 |     147 | `false`  |
| `apps/server`               |      335 |      57 | `false`  |
| `packages/finyk-domain`     |       73 |      18 | `false`  |
| `packages/api-client`       |       45 |       9 | `false`  |
| `packages/insights`         |     ✅ 0 |       — | `true`   |
| `packages/fizruk-domain`    |     ✅ 0 |       — | `true`   |
| `packages/nutrition-domain` |       31 |       9 | `false`  |
| `packages/shared`           |       26 |       7 | `false`  |
| `apps/mobile`               |       25 |      14 | `false`  |
| `packages/routine-domain`   |     ✅ 0 |       — | inherit  |
| `tools/console`             |     ✅ 0 |       — | inherit  |
| `packages/db-schema`        |     ✅ 0 |       — | inherit  |
| `apps/mobile-shell`         |     ✅ 0 |       — | inherit  |
| **Total**                   | **1225** | **280** |          |

`packages/routine-domain` мігровано in-PR (17 errors → 0): refactor
`maxStreakAllTime` під null-check loop, `Object.entries()` замість
`Object.keys()` для notes-prefix-filter, explicit array swap з
undefined-guard. Без `!` non-null assertions.

**Follow-up міграції (round 7+):**

- `packages/shared` — `noUncheckedIndexedAccess: true` (PR [#1635](https://github.com/Skords-01/Sergeant/pull/1635)).
- `packages/nutrition-domain` — `true` (PR [#1681](https://github.com/Skords-01/Sergeant/pull/1681)), 10 errors / 4 файли закрито через `!` після `findIndex >= 0` guard.
- `packages/insights` — `true` (Item 15 round-7 follow-up, PR [#1689](https://github.com/Skords-01/Sergeant/pull/1689)), 13 errors / 2 тестових файли закрито через `recs[0]?.x` після `expect(recs).toHaveLength(1)`.
- `packages/fizruk-domain` — `true` (PR [#1779](https://github.com/Skords-01/Sergeant/pull/1779), merged 2026-05-04), 31 errors / 12 файлів → 0. Оверрайд `false` знято з [`packages/fizruk-domain/tsconfig.json`](../../packages/fizruk-domain/tsconfig.json); allowlist-ентрі в [`tools/tsconfig-guard/allowlist.json`](../../tools/tsconfig-guard/allowlist.json) не залишилося.

[`tools/tsconfig-guard`](../../tools/tsconfig-guard/check.mjs) розширено:
`noUncheckedIndexedAccess` додано у `GUARDED_OPTIONS`. Allowlist
([`tools/tsconfig-guard/allowlist.json`](../../tools/tsconfig-guard/allowlist.json))
має entries для `apps/web` та `apps/server` з `expires: 2026-09-30`.
Гайд блокує будь-який нерегламентований regress override.

[`scripts/strict-coverage.mjs`](../../scripts/strict-coverage.mjs)
розширено: новий column `noUncheckedIndexedAccess` + summary `Phase 6a:
N / 13 packages` у markdown-output (видно у `$GITHUB_STEP_SUMMARY`).

**Per-module rollout план (решта PR-ів — 2 апи):**

1. `apps/server` — 335 errors / 57 файлів. Server-side тести найбільш
   inhomogeneous; розбити на ~3 PR per route group (`auth/`,
   `modules/`, `routes/`).
2. `apps/web` — 625 errors / 147 файлів. Розбити по `core/`,
   `modules/finyk/`, `modules/fizruk/`, `modules/routine/`,
   `modules/nutrition/`, `shared/components/` (≥6 PR per module).

Спліт `apps/server` + `apps/web` бажано розводити в часі від великих
[`0010-revenue-first-launch`](../initiatives/0010-revenue-first-launch.md)
Stripe/auth/paywall PR-ів — конфлікти merge будуть болючі. Phase 6a
закінчується одночасно з або після 0010 Phase 4 (auth migration).

_Закриті міграції (2026-05-04 round-up):_ `packages/shared` (#1635),
`packages/api-client` (inherit), `packages/nutrition-domain` (#1681),
`packages/insights` (#1689), `packages/finyk-domain` (#1750),
`packages/fizruk-domain` (#1779), `apps/mobile` (`0012-phase6a-mobile`).
11 з 13 пакетів покрито.

Each rollout PR видаляє `noUncheckedIndexedAccess: false` override з
`{app}/tsconfig.json` (та відповідну entry з `allowlist.json` для
apps/web + apps/server) і фіксить помилки. Guard заблокує regress.

**Послідовність розгортання (статус):**

- **Phase 6a (✅ Done — 2026-05-05):** `noUncheckedIndexedAccess` enabled у base. **12 / 12 packages = 100%**. Closure PR `0012-close-strictness-rollout` закрив `apps/web` + `apps/server` residual.
- **Phase 6b (🟡 in-flight — apps/web only):** `exactOptionalPropertyTypes` enabled у base. 11 / 12 packages clean. `apps/web` residual — override `false` + allowlist `expires: 2026-09-30`.
- **Phase 6c (✅ Done — 2026-05-04):** `noImplicitReturns` + `noFallthroughCasesInSwitch` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6d (🟡 in-flight — apps/web only):** `noPropertyAccessFromIndexSignature` enabled у base. 11 / 12 packages clean. `apps/web` residual — override `false` + allowlist `expires: 2026-09-30`.
- **Phase 6e (✅ Done — 2026-05-04):** `noUnusedLocals` + `noUnusedParameters` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6f (✅ Done — 2026-05-05):** Audit `as unknown as X` у production: 0 matches.
- **Phase 7 (опційно):** mock-helper-и + `vitest-mock-extended` для закриття `as unknown as` у тестах.

Кожна фаза = окремий PR з baseline-метрикою у описі.

---

### 12. Strict TS coverage tracking (CI)

**Скрипт:** [`scripts/strict-coverage.mjs`](../../scripts/strict-coverage.mjs) —
сканує всі `tsconfig.json` у `apps/*/` та `packages/*/`, резолвить `extends`
ланцюги, виводить markdown-таблицю з прапорами `strict`, `strictNullChecks`,
`noImplicitAny`, `noUncheckedIndexedAccess`, `allowJs` для кожного пакету

- summary-row `Phase 6a: N / 13 packages have noUncheckedIndexedAccess: true`.

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
