# Frontend Tech Debt — Sergeant Web

> **Last validated:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-10-18.
> **Status:** Active

> **Оновлено 2026-07-20.** Re-audit `apps/web/src`: **999** production source файлів / **~161k** raw LOC (без тестів, `__tests__/`, `.stories.*`); **875** test-файлів. Coverage floor lines = **89** (`coverage-thresholds.json`). Hard Rule #18 `max-lines` allowlist порожній; **2 нові leakers** над 600 effective LOC — `ManualExpenseSheet.tsx` (~607 eff) і `TxRow.tsx` (~605 eff). `no-eyebrow-drift` disables: **27** web / **10** mobile. Production `any`: **2** by-design (`parseFizrukWorkouts.ts`, `lazyImport.ts`) — `searchCache.ts` більше не тримає `LooseRecord`. `react-hooks/exhaustive-deps` у web production: **0** (каталог [`apps-web-exhaustive-deps.md`](../../02-engineering/architecture/apps-web-exhaustive-deps.md) закритий, wave 4); живі **9** — у mobile ([`apps-mobile-exhaustive-deps.md`](../../02-engineering/architecture/apps-mobile-exhaustive-deps.md)). Initiative 0017 (§2.5) code-complete; RUM validation — окремий checkpoint ініціативи, не active debt тут.

> **Оновлено 2026-06-01.** §7 follow-up виконано: ESLint-правило `no-console: error` додано до `apps/web/src/**` (виключення — `*.test.*`, `__tests__/`, `*.stories.*`); три documented call-sites (`perf.ts`, `sw/debug.ts`, `analytics.ts`) отримали `eslint-disable-next-line no-console` з обґрунтуванням; `logger.ts` — disable для canonical transport; ще 5 call-сайтів (`CommandPalette.tsx`, `serverBuildIdBus.ts`, `StatusPage.tsx`, `useDemoCommands.ts` ×2) мігровані на `logger`. §9 follow-up виконано: `@typescript-eslint/no-explicit-any` підвищено до `error` для `apps/web/src/modules/**` і `apps/web/src/core/**` (виключення — тести та stories). §6 follow-up виконано: `HubReports` / `useCoachInsight` / `useWeeklyDigest` coverage.

Аналіз кодової бази `apps/web/src` (999 source файлів, ~161k рядків — без тестів, `__tests__/` і `.stories.*`; 2026-07-20 re-audit).

> **Оновлено 2026-07-01 (tech-debt reconcile).** Історичний зріз: `FinykApp.tsx` тоді 647/586; `dualWrite/adapter.ts` декомпозовано. **Перезаписано 2026-07-20** — див. §4 актуальну таблицю (нові leakers `ManualExpenseSheet` / `TxRow`).

> **Оновлено 2026-05-20.** Додано §2.5 «Hub Settings & Reports tab cold-mount cost» як новий critical item — user-facing 10+ s freeze при tab-switch, з відкритою [Initiative 0017](../initiatives/archive/_0017-hub-tabs-mount-perf.md). Root cause не у chunk download (вже 31 ms cache-hit), а в синхронному mount-і 14 секцій у одному render burst. План — per-section `React.lazy()` + `useInView` gate на cross-module queries + Web Worker для Reports aggregation (stretch).

> **Оновлено 2026-05-22 (2nd pass).** ~~Web UI timeout magic-numbers~~ **Closed** — 6 inlined timeouts in `core/ErrorBoundary.tsx`, `core/app/useIosInstallBanner.ts`, `core/auth/ResetPasswordPage.tsx`, `modules/finyk/pages/budgets/Budgets.tsx`, `modules/nutrition/hooks/usePantryBarcodeScan.ts`, `shared/components/ui/SwipeToAction.tsx` migrated to named constants in new `apps/web/src/shared/lib/ui/timeouts.ts`. Three categories documented (transient-confirm / delayed-show / status-clear). Adding a new timeout call-site → pick the constant that matches UX intent, don't inline a fresh magic-number.
>
> **Оновлено 2026-05-22.** ~~(b) 2 SW smoke `test.skip(true, ...)`~~ **Closed as audit misclassification** — обидва skips НЕ є unconditional bypasses, а conditional graceful degradation у runtime-guard (`if (!result.ok)` після SW capability probe): браузер lane без SW (наприклад privacy mode або `--disable-features=ServiceWorker`) пропускає тест замість hard-fail. Це **інтенційно** і documented inline. Re-enable plan не потрібен — поведінка коректна.
>
> **Оновлено 2026-05-21.** ~~(c) `apps/web/src/core/NotFoundPage.tsx` shim~~ **Closed** — shim deleted, single callsite (`StandaloneRoutes.tsx:56`) migrated до `../errors/NotFoundPage`, i18n allowlist entry прибраний.
>
> **Оновлено 2026-05-15.** Code-debt audit annex (Claude Opus 4.7 external session, monorepo-wide scan, code-debt category only). **All 3 items closed by 2026-05-22:** ~~(a) AIPill voice wiring~~ (closed #3081), ~~(b) SW smoke skips~~ (closed #3080 misclassification), ~~(c) NotFoundPage shim~~ (closed #3078); ~~timeout magic-numbers~~ (closed in this update — 2026-05-22 2nd pass).

> **Оновлено 2026-05-13.** Sync з реальним станом коду після Stage 7 / 9 storage-roadmap-у та подальших decomposition-ів:
> Розділ 2 (localStorage burndown) — production-allowlist у `eslint.config.js` **обнулено**
> (PR #054 final, 2026-05-06). `webKVStore` фізично переключено на SQLite-backed
> `kv_store(key TEXT PK, value JSON)` через PR #063 (web swap із LS dual-write canary)
> → PR #064 (drop LS mirror, SQLite-only) → PR #065 (mobile `mobileKVStore` mirror).
> Двоступенева драбина у `apps/web/src/shared/lib/storage/storage.ts:resolveStore()`:
> SQLite warm-cache (bootstrap-resolved) → `localStorage`-fallback (pre-bootstrap / SSR /
> private mode). Out-of-scope follow-up з §2 закритий.
> Розділ 4 (великі файли) — у `apps/web/src` залишилось **6 файлів >600 LOC** (раніше 14 на 2026-05-04;
> lookup-таблиця нижче синхронізована з `wc -l` 2026-05-13). Додатково декомпозовано (після 2026-05-04):
> `RoutineApp.tsx`, `Progress.tsx` (fizruk), `useStorage.ts` (finyk), `HubDashboard.tsx` (676 → 115 LOC,
> stale entry в `max-lines` allowlist прибрано у цьому PR),
> `chatActions/types.ts`, `fizrukActions.ts`, `AssetsTable.tsx`, `Workouts.tsx` (fizruk),
> `DailyPlanCard.tsx`, `Icon.tsx`, `NutritionApp.tsx`, `sw.ts`, `Exercise.tsx`, `LogCard.tsx`.
> Нові leakers (раніше у doc не трекалися, тепер додані до таблиці §4):
> `core/auth/AuthPage.tsx` (694), `modules/fizruk/lib/dualWrite/adapter.ts` (641).
> `core/onboarding/OnboardingWizard.tsx` (691) декомпозовано в цьому ж циклі
> (див. лог нижче). Початково запланований carry-over
> з Initiative 0001: `RoutineCalendarPanel.tsx` декомпоновано 2026-05-22 (`useCompletionNoteDrafts` extraction, 645 → 589 effective LOC); `FinykApp.tsx` тримається у raw>600 але <600 effective, monitor-only.
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
> [`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs)
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
[`sergeant-design/no-raw-local-storage`](../../../packages/eslint-plugin-sergeant-design/index.js)
тепер працює без production-allowlist-у — у
[`eslint.config.js`](../../../eslint.config.js) лишилися виключно
тестові ignore-ри (`**/*.test.{ts,tsx,js,jsx}`, `**/__tests__/**`).
Бюджет у
[`.tech-debt/localstorage-allowlist-budget.json`](../../../.tech-debt/localstorage-allowlist-budget.json)
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

### 2.5. ~~Hub Settings & Reports tab cold-mount cost — 10+ s tab freeze~~ — Виконано

> **Closed 2026-06-02 — Initiative 0017 code-complete.** Sprint 0 ([#3043](https://github.com/Skords-01/Sergeant/pull/3043) — RUM instrumentation `hub_tab_switch_perf`), Sprint 1 ([#3102](https://github.com/Skords-01/Sergeant/pull/3102) — per-section `React.lazy` + `FinykSection` viewport gating), and Sprint 2 ([#3094](https://github.com/Skords-01/Sergeant/pull/3094) — HubReports per-card lazy, `HubReports.tsx` 608 → **261 LOC**) all merged. Sprint 3 (Web Worker for `aggregateReport`) explicitly **skipped** at the [Sprint 3 decision](../initiatives/archive/_0017-hub-tabs-mount-perf.md#sprint-3-decision-2026-06-01) — conditional on a post-merge 30-day RUM cut showing `aggregateReport` P95 > 50 ms; if the threshold trips, Sprint 3 re-opens as a discrete follow-up against the initiative rather than re-living here.
>
> Removed from the active watchlist because the engineering work is shipped. RUM-target verification (Settings P50 ≤ 2 s, Reports P50 ≤ 1.5 s, long-task P95 ≤ 5, main chunk −50 KB) continues to be tracked by Initiative 0017 — those are validation checkpoints, not unfinished mitigation work.
>
> Historical detail preserved below for the audit trail (root cause, guardrails, target metrics).

**Симптом (2026-05-20 prod audit):** клік на bottom-nav таб `?tab=settings` або `?tab=reports` показує `PageLoader` skeleton на 10+ секунд на desktop (mid-range mobile estimate: 25+ с). Chunk download уже **не** проблема — `prefetchHubNavigationPages` без зовнішньої idle-обгортки ([PR #3043](https://github.com/Skords-01/Sergeant/pull/3043)) дає chunks за 31 ms (cache-hit). Затримка — у JS execution та initial mount cost.

**Root cause:**

- [`apps/web/src/core/hub/HubSettingsPage.tsx`](../../../apps/web/src/core/hub/HubSettingsPage.tsx) (457 LOC) рендерить 14 секцій active-group одним render burst. Кожна секція (особливо `FinykSection` 635 LOC, `NutritionSection` 284 LOC) тягне свій `useQuery`, `useEffect`, cross-module hooks (`useFinykStorage`, `useMonoBackfillProgress`, `useNutritionDualWriteBoot` тощо). _(Sprint 1 уже зробив ці секції lazy + Suspense — див. Status вище.)_
- [`apps/web/src/core/hub/HubReports.tsx`](../../../apps/web/src/core/hub/HubReports.tsx) (608 → **261 LOC** після Sprint 2 per-card lazy) робив heavy `useMemo(aggregateReport)` over всі 4 localStorage shards (`fizruk_workouts_v1`, `finyk_tx_cache`, `hub_routine_v1`, `nutrition_log_v1`) + `generateInsights` рекомендації — синхронно на main thread; тепер розрізано на per-card lazy chunks.
- `<SuspenseWithMinDelay>` приховує цю роботу за skeleton, але не прискорює — лише робить flicker менш різким.

**Як ловити нові випадки в CI:**

- Bundle-size gate `scripts/check-bundle-size.mjs` тримає main chunk ≤820 KB — не ловить mount cost. Треба додати окремий PostHog event `hub_tab_switch_perf` як RUM-metric (заплановано у Sprint 0).
- Lighthouse CI на `/?tab=settings` route — `Total Blocking Time` поріг ≤300 ms (наразі ~7000 ms estimate).

**Guardrail:**

- [`apps/web/src/shared/components/ui/SuspenseWithMinDelay.tsx`](../../../apps/web/src/shared/components/ui/SuspenseWithMinDelay.tsx) лишається для уникнення skeleton-flicker, але не плутаємо це з perf-fix-ом.
- Будь-яка нова Section у `apps/web/src/core/settings/` має `useInView` gate на heavy queries — додамо ESLint правило після Sprint 1 завершення.

**Open Initiative:** [0017 — Hub Settings & Reports mount perf](../initiatives/archive/_0017-hub-tabs-mount-perf.md) — 5 PR-ів за 3 спринти:

1. **Sprint 0 (`feat/0017-hub-tab-perf-rum`) — shipped 2026-05-20**: PostHog `hub_tab_switch_perf` baseline, `PerformanceObserver({type:"longtask"})`. Runbook: [`docs/03-operations/observability/hub-perf-baseline.md`](../../03-operations/observability/hub-perf-baseline.md).
2. Sprint 1.1 (`feat/0017-settings-section-skeleton-primitive`): per-section `React.lazy()` + `SectionSkeleton` стабільної висоти.
3. Sprint 1.2 (`feat/0017-settings-cross-module-defer`): `useInView` gate на heavy queries у sections, dynamic `import()` для cleanup-handler-ів.
4. Sprint 2 (`feat/0017-reports-per-card-lazy`): HubReports → 5 lazy cards (ExpensesCard / FitnessCard / NutritionCard / RoutineCard / WeeklyDigestCard).
5. Sprint 3 stretch (`feat/0017-reports-worker-aggregate`): тільки якщо метрики Sprint 2 показують `aggregateReport` P95 > 50 ms — Web Worker для aggregate + generateInsights.

**Target metrics (з 0017 initiative):**

- Settings P50 tab-switch: 10 000 ms → ≤ 1 000 ms.
- Reports P50: 8 000 ms → ≤ 800 ms.
- Longtask count P95: невідомо → ≤ 2 per tab-switch.

**Статус:** ~~Active~~ **Closed 2026-06-02** (Initiative 0017 code-complete — Sprint 0–2 shipped; Sprint 3 skipped). RUM-target verification лишається checkpoint-ом ініціативи, не active debt у цьому реєстрі.

---

## 🟡 Бажане

<details>
<summary>3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано (розгорнути)</summary>

### 3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано

**Раніше:** 413 рядків з імпортами виду `from "./foo.js"` /
`from "./bar.jsx"` у `.ts`/`.tsx` файлах — працювало через Vite resolve, але
плутало IDE auto-imports і нових контриб'юторів.

**Зараз:** виконано codemod
[`scripts/codemods/strip-js-extensions/script.mjs`](../../../scripts/codemods/strip-js-extensions/script.mjs) —
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

### 4. Великі файли (>600 рядків) — allowlist порожній; **2 active leakers (2026-07-20)**

> **Status (2026-07-20 re-audit):** [`Initiative 0001 — Module decomposition`](../initiatives/archive/_0001-module-decomposition.md)
> закрита як **Done**. Lint guard `max-lines: [error, 600]` (`skipBlankLines` +
> `skipComments`) для `apps/web/src/**/*.{ts,tsx}` активний; allowlist **порожній**.
>
> **Нові leakers (effective LOC > 600):** `ManualExpenseSheet.tsx` (~713 raw /
> ~607 eff) і `TxRow.tsx` (~658 raw / ~605 eff) — окремі decomposition PR.
> Попередня claim «ManualExpenseSheet fixed 2026-05-29» — стейл (файл знову
> перетнув поріг). Monitor-лист (raw >600, eff ≤600) — у таблиці нижче.
>
> Історичний лог декомпозицій (Assets / Profile / Voice / chatActions / …)
> збережено нижче як audit trail; свіжі цифри — лише в таблиці §4.

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
> `core/profile/ProfilePage.tsx` (96 при декомпозиції, нині 145), `PersonalInfoSection.tsx` (383),
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
> (mobile tracker — `docs/90-work/tech-debt/mobile.md`).

| Рядків (raw / effective) | Файл                                                  | Категорія                                                    |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| **713 / ~607**           | `modules/finyk/components/ManualExpenseSheet.tsx`     | **Active leaker** — декомпозиція (sheet sections / hooks)    |
| **658 / ~605**           | `modules/finyk/components/TxRow.tsx`                  | **Active leaker** — винести sub-rows / swipe / account chips |
| 675 / ~568               | `modules/nutrition/NutritionApp.tsx`                  | Monitor (passes rule)                                        |
| 655 / ~598               | `modules/fizruk/pages/Body.tsx`                       | Monitor (headroom ~2)                                        |
| 646 / ~550               | `modules/nutrition/lib/sqliteWriter/adapter.ts`       | Monitor                                                      |
| 638 / ~525               | `shared/components/ui/CelebrationModal.tsx`           | Monitor                                                      |
| 634 / ~512               | `shared/components/layout/ModuleHeader.tsx`           | Monitor                                                      |
| 623 / ~586               | `modules/routine/components/RoutineCalendarPanel.tsx` | Monitor                                                      |
| 615 / ~558               | `modules/finyk/FinykApp.tsx`                          | Monitor                                                      |
| 606 / ~474               | `shared/components/ui/EmptyState.tsx`                 | Monitor                                                      |
| 912 / ~593               | `shared/i18n/uk.ts`                                   | Monitor (i18n catalog — не feature-моноліт)                  |
| 653 / ~551               | `shared/i18n/en.ts`                                   | Monitor                                                      |

**Імпакт:** повільніший code review, важче тестувати окремі частини, можливі
circular deps; leakers ламають / близькі до Hard Rule #18.

**Fix:** поступовий split — витягувати sub-components, hooks, utils. Окремі
PR на кожен leaker; не змішувати з feature-дифами.

---

<details>
<summary>5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (розгорнути)</summary>

### 5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (документація)

Web production disables знято (wave 4 → **0**); історія патернів —
[`apps-web-exhaustive-deps.md`](../../02-engineering/architecture/apps-web-exhaustive-deps.md).
Живі **9** сайтів — у mobile:
[`apps-mobile-exhaustive-deps.md`](../../02-engineering/architecture/apps-mobile-exhaustive-deps.md).
Новий disable без WHY-коментаря / без рядка в каталозі — рев'ю блокує.

</details>

---

### 6. Тестове покриття — 875 test файлів на 999 source; lines floor **89**

Coverage floor (`coverage-thresholds.json` → `apps/web`): **89** lines
(+ branches 75 / functions 82 / statements 87 у `vitest.config.js`).
Кількість test-файлів виросла органічно (re-audit 2026-07-20: 875 vs 999 source).
Критичні модулі без тестів / з тонким покриттям (історичний backlog — більшість закрита):

- ~~`HubReports.tsx` (608 → **261 LOC** після 0017 Sprint 2 per-card decomposition; важка агрегація винесена в per-card chunks) — покриття shell-у тонке~~ — 6 тестів додано (2026-06-01)
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

**Зроблено 2026-06-01 (§6 follow-up):** додано focused coverage для трьох поверхонь, що залишались без тестів:

- `HubReports.test.tsx` (6 тестів): render smoke на empty-insights path (F23), всі чотири lazy domain card stubs (FitnessCard / ExpensesCard / RoutineCard / NutritionCard) через `vi.mock()` + Suspense, WeeklyDigestCard у week-режимі та її відсутність у month-режимі, period navigation (Попередній/Наступний, disabled-стан при offset=0), Export PDF кнопка.
- `useCoachInsight.test.ts` (6 тестів): успішна відповідь API, помилка API, читання кешу з LS, запис інсайту у LS після успіху, refresh/refetch зростає кількість викликів `postInsight`, ненатальна помилка пам'яті не блокує hook.
- `useWeeklyDigest.test.ts` (14 тестів): `aggregateFizruk` (flat array / wrapped shape / порожні вправи), `aggregateNutrition` (базова агрегація / нуль даних), `aggregateRoutine` (звички з completion / без / нуль), `getWeekRange` (ISO week boundary), hook (початковий стан, успіх, помилка, refetch, мутація).

Cloud-sync v2 engine (`syncEngineWriter`, `singleton`, `outboxBoot`, `useSyncStatus`) вже мав достатнє покриття у відповідних `*.test.ts/tsx` файлах — нові тести не потрібні.

**Зроблено 2026-06-07 (Testing/DevX T-7 helper follow-up):** PR [#3413](https://github.com/Skords-01/Sergeant/pull/3413) додав focused coverage для helper-only поверхонь, які не потребували UI/MSW сценарію:

- `activeWorkoutLib.test.ts`: active-workout id extraction, `datetime-local` conversion і cardio pace/speed calculations.
- `requestId.test.ts`: stable sync request ids для deterministic retry/debug paths.
- `finykSubscriptionCalendar.test.ts`: storage fallback, primary-vs-last-good transaction cache selection і persisted subscription event generation.

Це не піднімає web coverage floor саме по собі, але прибирає дешеві pure-helper прогалини перед наступним T-7 кроком: selectors + wallet/scenario component/hook suites.

~~**Fix:** додати тести на reports aggregation (`HubReports.tsx` UI),
залишок recommendation engine (`useCoachInsight`, `useWeeklyDigest`),
а також engine/{pull,upload,replay} cloud-sync wrappers.~~ **Виконано 2026-06-01.**

---

## 🟢 Nice-to-have

### 7. `console.*` у production коді — 3 DEV-only / documented (purge 2026-05-13)

**Re-audit 2026-05-13 (post-purge).** Скан `apps/web/src/**` (без тестів і
`__tests__/`) дає **3 виклики у 3 файлах**, усі — DEV-gated або
physically-documented:

- `shared/lib/ui/perf.ts:35` — `console.debug` під `if (import.meta.env?.DEV)`,
  додатково сховано за `hub_perf=1` LS-toggle (опціональна dev-діагностика).
- `sw/debug.ts:30` — `console.log` під `if (debugEnabled && import.meta.env?.DEV)`;
  канонічний production-шлях для SW-snapshot — `buildSwSnapshot()` (postMessage
  → `PWASection`).
- `core/observability/analytics.ts:56` — `console.log("[analytics]", event)` —
  навмисна transport-фіча analytics-ring-buffer-у; описана в docstring
  (`devtools` taps + PostHog).

Перехід виконано в PR #2583 (`chore(web): purge console.* from production
code`) разом із sub-PR #2582 (`feat(web): add Sentry-backed logger helper in
shared/lib/log`). Усі решта `console.warn`/`console.error`/`console.log` —
~55 викликів у 28 файлах — переведено на новий `logger` helper з
`shared/lib/log/`, який у production проксіює у Sentry breadcrumb /
`captureException`, а у DEV пише в `console.*`.

| Категорія                                   | Файли (key examples)                                                                | К-сть |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ----- |
| DEV-only debug toggle                       | `shared/lib/ui/perf.ts` (1 — `hub_perf` LS-flag), `sw/debug.ts` (1 — SW debug-flag) | 2     |
| Documented analytics transport (ring + log) | `core/observability/analytics.ts` (1 — навмисно, devtools tap)                      | 1     |

**Trackable follow-up:** ~~немає. Як пастка для нових випадків — додати
ESLint-правило `no-console` з allowlist на ці три рядки (та `*.test.*` /
`__tests__/`) — окремий PR (Phase 6 candidate).~~ **Виконано 2026-06-01.** ESLint-правило `no-console: error` додано до `eslint.config.js` для `apps/web/src/**` (виключення — `*.test.*`, `__tests__/`, `*.stories.*`). Три documented call-sites та `logger.ts` отримали `eslint-disable-next-line no-console` з поясненнями; 5 решта call-сайтів мігровані на `@shared/lib/log/logger`. Нові виклики `console.*` у production-коді тепер ламають CI.

---

### 8. `eslint-disable no-eyebrow-drift` — 27 рядків у `apps/web/src` + 10 у `apps/mobile/src`

Custom DS-rule пригнічується **27** разів у `apps/web/src` і **10** у `apps/mobile/src`
(re-audit 2026-07-20; стабільно з 2026-07-01). Усі з обґрунтуваннями в коментарях
(кастомні hero kickers, calendar headers, pill-overlay typography, marketing eyebrow).

**Зроблено [PR #1414](https://github.com/Skords-01/Sergeant/pull/1414):** розширено
`SectionHeading` API новими слотами (`eyebrowTone` / `eyebrowAs` / `eyebrowId` /
`renderEyebrow`) і виведено 7 disable-сайтів з mobile primitive-owners + ключові
hub/settings/dashboard кейси (mobile 17 → 10). Залишок — legitimate overrides або
кандидати на нові slot-и в наступному API-розширенні.

---

### 9. `any` типи — ✅ 0 trackable production-`any` + 2 by-design loose

**Production:** trackable `: any` / `as any` у modules/core **закриті**
(Phase 5a finyk-pages [#1452](https://github.com/Skords-01/Sergeant/pull/1452)

- hooks [#1475](https://github.com/Skords-01/Sergeant/pull/1452)).
  `@typescript-eslint/no-explicit-any` = `error` для `apps/web/src/modules/**`
  і `apps/web/src/core/**` (тести/stories exempt).

> **2026-07-20:** `core/hub/search/searchCache.ts` більше **не** містить
> `LooseRecord` / `any` — залишились parse/score LRU над `unknown`.
> By-design таблиця скорочена до 2 сайтів.

**By-design loose (2 файли, з in-line обґрунтуваннями):**

| Файл                                     | Pattern                 | Обґрунтування                                                                                                                                                                           |
| ---------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/lib/ui/parseFizrukWorkouts.ts:8` | `Record<string, any>[]` | Парсер для обох legacy-форматів (`[{...}]` і `{ workouts: [...] }`) із fizruk localStorage. Свідомо loose, бо персистовані payload-и старіші за поточну shape; type-guard у consumer-і. |
| `core/lib/lazyImport.ts`                 | `ComponentType<any>`    | Свідомий вибір над `unknown`: callers мають точну сигнатуру через `(typeof import(...)).Foo`, тут `any` потрібен щоби вирівняти всі `lazy(() => …)`-callsites під один тип.             |

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
* `tools/openclaw/tsconfig.json` — додано explicit `"allowJs": false`
  (у `tools/openclaw/src` немає JS-файлів, прапор виставлено на майбутнє
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
  / `tools/openclaw`. Тепер base стрімкий.
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

| # | Прапор / патерн | Очікуваний impact | Статус |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1 | `noUncheckedIndexedAccess` (`arr[i]` стає `T \| undefined`) | **1225 baseline / 280 файлів** (виміряно 2026-05-03, PR § 6a) → 0. Flipped у base, **12 / 12 пакетів = 100%** (closure PR `0012-close-strictness-rollout` 2026-05-05 закрив `apps/web` + `apps/server` residual). Allowlist для `noUncheckedIndexedAccess` — порожній. Tracked у [Initiative 0012 § Phase 6a](../initiatives/archive/_0012-perfect-strictness-rollout.md). | ✅ Done |
| 2 | `exactOptionalPropertyTypes` (`?:` не дозволяє явний `\| undefined`) | **44 baseline для `apps/server` → 0** (closure PR `0012-close-strictness-rollout` 2026-05-05 — 8 інтерфейсів + 5 call-sites; patterns: bidirectional `\| undefined` propagation + spread-only conditional includes). 12 / 12 пакетів вмикнули flag. **`apps/web` closed 2026-06-01** — ~497 baseline errors → 0; override `false` removed, allowlist entry removed. Strategy: interface widening (`prop?: T                                                                                   | undefined`) + conditional spreads at call sites. Tracked у [Initiative 0012 § Phase 6b](../initiatives/archive/_0012-perfect-strictness-rollout.md). | ✅ Done |
| 3 | `noImplicitReturns` + `noFallthroughCasesInSwitch` | **8 baseline / 8 файлів** (виміряно 2026-05-04 — `apps/web` 6, `apps/server` 2, виключно у `useEffect`-cleanup-ах і `RequestHandler`-ах; 0 `noFallthroughCasesInSwitch` violations). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6c](../initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS. | ✅ Done |
| 4 | `noPropertyAccessFromIndexSignature` (`.foo` на index-signature → `["foo"]`) | **TS4111 errors у `apps/server` → 0** (codemod-based bracket-notation transform, closure PR `0012-close-strictness-rollout` 2026-05-05). 12 / 12 пакетів вмикнули flag. **`apps/web` closed 2026-06-01** — all TS4111 `.foo` → `["foo"]` bracket-notation fixes applied; override `false` removed, allowlist entry removed. Tracked у [Initiative 0012 § Phase 6d](../initiatives/archive/_0012-perfect-strictness-rollout.md). | ✅ Done |
| 5 | `noUnusedLocals` / `noUnusedParameters` (зараз ESLint-enforced, не TS-enforced) | **1 baseline / 1 файл** (виміряно 2026-05-04 — `apps/web/src/core/db/__tests__/sqlite-wasm-fake.ts` `cols` field, mortified як dead state). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6e](../initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS. ESLint `@typescript-eslint/no-unused-vars` залишається активним як doubly-redundant safety net (немає вартості, але ловить runtime-cases типу JSX-imports краще, ніж TS). | ✅ Done |
| 6 | `as unknown as X` у тестах (~50 файлів — mock-каст `vi.fn()`, fake `PointerEvent`, тощо) | mid — нормально для test-коду, але формально strict-violation. Потенційно — типізовані mock-helper-и + `vitest-mock-extended` | ⏳ pending |
| 7 | `: any` у тест-only allowlisted файлах (e.g. `apps/web/src/core/lib/lazyImport.ts:33-39 type AnyComponent = ComponentType<any>`) | low — навмисно з коментарем, але формально lint-vio | ⏳ pending |

**Phase 6a baseline-experiment (PR 2026-05-03):**

`noUncheckedIndexedAccess: true` додано у [`packages/config/tsconfig.base.json`](../../../packages/config/tsconfig.base.json).
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
| `packages/openclaw-plugin`  |     ✅ 0 |       — | inherit  |
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
- `packages/fizruk-domain` — `true` (PR [#1779](https://github.com/Skords-01/Sergeant/pull/1779), merged 2026-05-04), 31 errors / 12 файлів → 0. Оверрайд `false` знято з [`packages/fizruk-domain/tsconfig.json`](../../../packages/fizruk-domain/tsconfig.json); allowlist-ентрі в [`tools/tsconfig-guard/allowlist.json`](../../../tools/tsconfig-guard/allowlist.json) не залишилося.

[`tools/tsconfig-guard`](../../../tools/tsconfig-guard/check.mjs) розширено:
`noUncheckedIndexedAccess` додано у `GUARDED_OPTIONS`. Allowlist
([`tools/tsconfig-guard/allowlist.json`](../../../tools/tsconfig-guard/allowlist.json))
має entries для `apps/web` та `apps/server` з `expires: 2026-09-30`.
Гайд блокує будь-який нерегламентований regress override.

[`scripts/strict-coverage.mjs`](../../../scripts/strict-coverage.mjs)
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
- **Phase 6b (✅ Done — 2026-06-01):** `exactOptionalPropertyTypes` enabled у base. **12 / 12 packages = 100%**. `apps/web` closed — all ~497 baseline errors fixed; override removed, allowlist entry removed.
- **Phase 6c (✅ Done — 2026-05-04):** `noImplicitReturns` + `noFallthroughCasesInSwitch` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6d (✅ Done — 2026-06-01):** `noPropertyAccessFromIndexSignature` enabled у base. **12 / 12 packages = 100%**. `apps/web` closed — all TS4111 `.foo` → `["foo"]` fixes applied; override removed, allowlist entry removed.
- **Phase 6e (✅ Done — 2026-05-04):** `noUnusedLocals` + `noUnusedParameters` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6f (✅ Done — 2026-05-05):** Audit `as unknown as X` у production: 0 matches.
- **Phase 7 (опційно):** mock-helper-и + `vitest-mock-extended` для закриття `as unknown as` у тестах.

Кожна фаза = окремий PR з baseline-метрикою у описі.

---

### 12. Strict TS coverage tracking (CI)

**Скрипт:** [`scripts/strict-coverage.mjs`](../../../scripts/strict-coverage.mjs) —
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
[`sergeant-design/no-strict-bypass`](../../../packages/eslint-plugin-sergeant-design/index.js)
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

1. **Декомпозиція Hard Rule #18 leakers** — `ManualExpenseSheet.tsx` (~607 eff)
   і `TxRow.tsx` (~605 eff); окремі PR, без feature-міксу. _(На `main` після
   waves уже Closed #348/#350 — див. follow-up docs sync.)_
2. ~~**Overlay positioning consolidation (P4 Phase 1)**~~ — **Done**: shared
   `useFloatingPanelPosition` for Popover / Tooltip / DropdownMenu (geometry
   stays in `floatingPosition.ts`; no Radix — intentional size-limit choice).
3. **Overlay shell Phase 2 (P4)** — Align `ConfirmDialog` / `InputDialog`
   scrim + scroll-lock + portal with Sheet/Modal (`bg-black/40`,
   `useBodyScrollLock`); keep `role="alertdialog"` / form semantics.
4. ~~**Catalog-sync** `apps-web-exhaustive-deps.md`~~ — **Done** (web=0); живий список у [`apps-mobile-exhaustive-deps.md`](../../02-engineering/architecture/apps-mobile-exhaustive-deps.md).
5. ~~**Міграція `no-raw-local-storage`**~~ — **Done** (production allowlist = 0).
6. ~~**File splitting** — Assets, ProfilePage, ActiveWorkoutPanel.~~ **Done**.
7. ~~**`import/extensions: never`**~~ — **Done** ([PR #1411](https://github.com/Skords-01/Sergeant/pull/1411)).
