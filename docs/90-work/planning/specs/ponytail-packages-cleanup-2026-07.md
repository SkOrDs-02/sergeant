# Spec: Ponytail-cleanup packages/* (over-engineering purge)

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Closed — WP1–WP5 merged у PR #322 (`97bb430a0`, 2026-07-20). Опційний WP4.3 свідомо skipped (коментар у `packages/db-schema/src/sqlite/syncOpOutboxRecover.ts`).

## Контекст

Ponytail-audit (2026-07-11, 6 паралельних read-only агентів + верифікаційний прохід
Fable 5) пройшов усі 13 пакетів `packages/*` у пошуку over-engineering: мертвий код,
спекулятивна гнучкість, дублювання логіки, single-impl абстракції. Кожне твердження
«0 callers» перевірено repo-wide grep-ом по символу (не по імені файла); найризиковіші
whole-file deletes перевірено повторно незалежним проходом.

**Скоуп:** тільки видалення/спрощення. Жодних нових фіч, жодних багфіксів, жодного
рефакторингу поза переліченими пунктами. Correctness/security/perf — поза скоупом.

**Очікуваний ефект:** ≈ −950 рядків, 0 нових залежностей, 0 змін поведінки
(усі зміни — dead code або еквівалентні згортки з тестовим покриттям).

## Спростовані знахідки (НЕ чіпати)

Верифікаційний прохід спростував дві знахідки первинного аудиту — вони
**виключені** зі скоупу:

1. ~~`yagni` api-client `createSyncEngineFlushOnReconnect` visibility-гілка~~ —
   СПРОСТОВАНО: `apps/web/src/core/syncEngine/syncEngineWriter.ts:60,141` передає
   `kind: "both"`. Гілка жива.
2. ~~`delete` `apiQueryKeys.coach.all`~~ — СПРОСТОВАНО:
   `apps/mobile/src/core/dashboard/useCoachInsight.ts:90` і `useWeeklyDigest.ts:81`
   інвалідовують по ньому. Мертві лише **8 із 9** ключів (див. WP4).

Також агенти свідомо лишили недоторканим (не чіпати):

- `packages/openclaw-plugin/src/personas/allowlist.ts` як файл — це drift-detection
  для security-allowlist (всередині ріжеться лише дубльований список імен, WP3.6);
- увесь `dualwrite-core` патерн `createApplyOps` — load-bearing (ADR-0073);
- fizruk `getTodaySession` back-compat shim, `recoveryConflictsFor*` пара — живі callers;
- `epley1rmStrict` у `progressKpis.ts` — має задокументовану причину існування;
- api-client `httpClient`, endpoint-фабрики, migration runner — multi-caller, чисті.

## Work packages (1 WP = 1 PR, порядок 1→5)

Кожен WP ізольований по scope і мержиться незалежно. Гілки від fresh `origin/main`
через `/wt`. Commit scope — за `commitlint.config.js`.

### WP1 — `packages/shared` (≈ −480 р.) — scope `shared`

1. **delete** `src/lib/animations.ts` цілком (243 р.) + його export у
   `src/index.ts:140`. 0 імпортерів по всіх символах (`timing`, `easing`,
   `springConfig`, `presets`, `cssTransition`, `cssTransitionMulti`,
   `staggerDelay`, `prefersReducedMotion`). Увага: `AnimatedList.tsx` у web має
   ВЛАСНИЙ проп `staggerDelay` — це не імпорт, збіг імен, перевірено.
2. **delete** `src/lib/undoTombstone.ts` (133 р.) + `undoTombstone.test.ts` +
   export у `src/index.ts:62`. Викликається лише власним тестом; спекулятивна
   пара до `showUndoToast`, ніколи не підключена.
3. **shrink** `src/lib/firstRealEntry.ts:117-230` — замінити тіла
   `hasAnyRealEntry` на `DASHBOARD_MODULE_IDS.some(m => moduleHasRealEntry(store, m))`
   і `getFirstRealEntryModule` на `...find(...) ?? null`. Сигнатури й поведінку
   зберегти; наявні тести мають лишитись зеленими без правок (це і є
   behavioral-контроль еквівалентності).
4. **delete** `src/lib/kvStore.ts` (10 р., deprecated re-export, 0 імпортерів) +
   зняти його запис із `knip.json` (рядок ~145, `@removeBy 2026-09-01` — видаляємо
   достроково, бо залежних немає).
5. **native** `src/utils/ukrainianPlural.ts:17-24` — замінити ручний
   mod-10/mod-100 вибір категорії на `new Intl.PluralRules("uk").select(n)`;
   `forms`-lookup лишається. Наявні тести на плюралізацію мають пройти без правок.

### WP2 — `packages/fizruk-domain` (≈ −140 р.) — scope `fizruk-domain`

1. **shrink** tonnage/duration fold ×5 → канонічна пара у `lib/workoutStats.ts:116`
   (`workoutTonnageKg`/`workoutDurationSec`); переключити 4 дублікати:
   `lib/workoutUi.ts:26-33`, `domain/dashboard/dashboardKpis.ts:55-80`,
   `domain/dashboard/recentWorkouts.ts:20-42`, `domain/workouts/journal.ts:105-158`.
   Перед згорткою звірити крайові розбіжності (null-обробка endedAt, округлення) —
   якщо копії відрізняються поведінково, згортати лише byte-еквівалентні.
2. **shrink** «sort by ISO desc, unparseable last» ×4: `domain/body/summary.ts:43-58`
   імпортує готовий `sortMeasurementsDesc` з `domain/measurements/reducers.ts`;
   для `journal.ts:38-50` і `exerciseDetail.ts:172-181` — спільна comparator-factory
   в `lib/`.
3. **shrink** `domain/workouts/catalog.ts:54-76` (`filterExercisesBySearch`) ≡
   `data/index.ts:130-152` (`searchExercises`) byte-for-byte — експортувати один
   предикат із `data/index.ts`, `catalog.ts` реюзає.
4. **delete** `lib/trainingPrograms.ts:50-73` `getDefaultRestSec` (дублює
   `restSettings.ts`, 0 callers) + його блок у `trainingPrograms.test.ts:122-126`.
5. **shrink** `domain/dashboard/topPRs.ts:25-28` — приватну копію epley1rm замінити
   імпортом канонічного з `lib/workoutStats.ts:29`. `epley1rmStrict` НЕ чіпати.
6. **yagni** `domain/dashboard/nextPlanSession.ts:36-52` `resolveTemplate` — звузити
   `templatesById` до `readonly DashboardTemplateLike[]`, зняти Map/Record гілки +
   2 тести, що покривають лише їх (`nextPlanSession.test.ts:105-127`).
7. **delete** `src/index.ts:6` `export * as FizrukDomain` — 0 uses
   (споживається лише `FizrukData`).

### WP3 — `packages/openclaw-plugin` (≈ −106 р.) — scope `openclaw-plugin`

1. **delete** `src/parity/index.ts` (35 р.) — barrel без імпортерів, власний header
   це визнає («dead-code roast 2026-05-13»).
2. **shrink** один `export type HookLogger = (level, message, fields?) => void`
   у спільному модулі; замінити 6 іменованих дублів (`ShortcutRouterLogger`,
   `ShortcutHookLogger`, `StrategicModeHookLogger`, `CouncilHookLogger`,
   `CheapRouterLogger`, `CheapRouterHookLogger`) + 4 inline-блоки
   (audit.ts:116, budget.ts:50, write-approval.ts:59, council/index.ts:237).
   Старі імена можна лишити as type-alias-re-export, якщо це public API пакета.
3. **shrink** `defaultLog()` ×3 (audit.ts:269, budget.ts:123, write-approval.ts:249)
   → один спільний helper.
4. **yagni** `config.ts:81` `approvalVariant` enum(A/B/C) — хук читає лише «B»;
   зняти enum + plumbing (index.ts:114, config.ts:148), лишити
   `// ponytail: variant B hardcoded, re-add enum when A/C ships` коментар.
   Перевірити, що `OPENCLAW_APPROVAL_VARIANT` env ніде в deploy-конфігах не
   виставлений (Hard Rule: спершу grep ops/, docs/).
5. **delete** `shortcuts/types.ts:58` `captureGroups?: string[]` + присвоєння у
   6 shortcut-файлах — ніде не читається.
6. **shrink** `personas/allowlist.ts:39-65` `READ_TOOLS` — derived-єдиносписком з
   `makeTools()` в index.ts (експортувати список імен звідти). Сам файл НЕ видаляти.

### WP4 — `packages/api-client` + `packages/db-schema` (≈ −80 р.) — scope `api-client` / `db-schema`

1. **delete** 8 мертвих ключів у `packages/api-client/src/react/queryKeys.ts`:
   `apiQueryKeys.{me,weeklyDigest,push,foodSearch,barcode,privat}.all`,
   `apiMutationKeys.{push,nutrition}.all`. **`coach.all` ЛИШИТИ** (mobile
   інвалідовує по ньому ×2).
2. **delete** `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts:104-123`
   `EnqueueOutboxIncrementResult` alias → використовувати
   `EnqueueOutboxIncrementOk` у 2 call-sites.
3. **yagni (опційно, найризиковіший пункт)** `syncOpOutboxRecover.ts:93-243` —
   згорнути `{ids}` селектор до `recoverAllDeadLetter(client)`. Торкає типи
   `RecoverDeadLetterSelector` у web+mobile singleton-ах
   (`apps/web/src/core/syncEngine/singleton.ts:438`,
   `apps/mobile/src/core/syncEngine/singleton.ts:275`). Виконувати ЛИШЕ якщо
   правка типів у обох apps лишається механічною; інакше — скіпнути й лишити
   `// ponytail: {ids} selector unused until dev-panel ships`.

### WP5 — домени + dualwrite-core + insights (≈ −150 р.) — scope по пакету, один PR `shared`-scope заборонений: розбити коміти по scope

1. **delete** `packages/dualwrite-core/src/createApplyOps.ts` гілку
   `errorPolicy: "atomic-batch"` + `applyAtomicBatch` (рядки 74-148) — усі 8
   адаптерів (web+mobile × 4 домени) хардкодять `"best-effort"`. Звузити
   `ErrorPolicy` до `"best-effort"`. Зняти відповідні тести в
   `createApplyOps.test.ts`.
2. **delete** `packages/dualwrite-core/src/apply.ts` функцію `applyDualWriteOps`
   (41-73) — типи (`ApplyDualWriteOptions/Result/Outcome`, `DualWriteLogger`)
   ЛИШИТИ, їх імпортує `createApplyOps.ts:26`. Разом із цим:
3. **delete** `apps/web/src/shared/lib/sqliteWriter/core.ts` + `core.test.ts`
   ЦІЛКОМ — верифіковано: 0 non-test імпортерів (web-адаптери беруть
   `createApplyOps` напряму з `@sergeant/dualwrite-core`; `createDefaultLogger`
   ніхто не імпортує). Це web-файл — коміт зі scope `web`.
4. **yagni** `packages/finyk-domain/src/lib/debt.ts:1-36` — замінити wrapper-тіла
   на `export { ..., getReceivablePaid as getRecvPaid } from "../domain/debtEngine"`.
5. **shrink** `packages/finyk-domain/src/backup.ts:95-167` — цикл по списках
   array-полів/object-полів замість 7+3 повторів `needArr`/`needObj`.
6. **shrink** `packages/routine-domain` `reconcileHabitOrder(habits, order)` helper
   замість ×3 копій (storage.ts:133-139, reducers.ts:318-324, reducers.ts:344-355).
7. **delete** мертві символи (0 імпортерів, верифіковано):
   - finyk: `MonthBudgetSummary` (domain/types.ts:185), `BudgetType` alias
     (domain/types.ts:60), `TX_CACHE_TTL` (constants.ts:300),
     `FinykBackupField` (storageKeys.ts:60);
   - routine: `dateFromHeatmapKey` (domain/heatmap/grid.ts:283);
   - insights: `evaluateActivationV2Now` (activation.ts:74-78).
8. **shrink** finyk currency-symbol map: один `CURRENCY_SYMBOL` у constants.ts,
   використати у `lib/formatting.ts:8-13` і
   `domain/assets/aggregates.ts:84-100`.

## Верифікація (кожен WP)

1. Worktree: `pnpm install --frozen-lockfile` (ephemeral worktrees без node_modules),
   `pnpm --filter @sergeant/db-schema build` якщо чіпається db-schema.
2. Пакетні тести + typecheck: `pnpm --filter <package> test`,
   `pnpm --filter <package> typecheck` — СТРОГО послідовно (Windows OOM при
   паралелі, див. пам'ять).
3. Споживачі: `pnpm --filter @sergeant/web typecheck` +
   `pnpm --filter @sergeant/mobile typecheck` для WP1/WP2/WP4/WP5.
4. Knip: видалення експортів може зрушити baseline — `pnpm lint` і за потреби
   регенерація knip-baseline у тому ж PR.
5. Повний гейт `pnpm check` — у CI на PR (локально не ганяти повну матрицю).
6. «Зелені тести без правок» — критерій еквівалентності для всіх shrink-пунктів;
   якщо shrink вимагає правити наявний тест — стоп, поведінка не еквівалентна,
   пункт скіпається з коментарем у PR.

## Ризики

- **WP4.3** — єдиний пункт, що міняє публічну сигнатуру, споживану обома apps.
  Помічений «опційно»; скіп — валідний результат.
- **WP2.1** — п'ять копій могли розійтись поведінково; згортати лише доведено
  еквівалентні (тест-гейт вище).
- **WP3.4** — env-прапорець `OPENCLAW_APPROVAL_VARIANT`: перед зняттям перевірити
  Railway variables (`railway variables --json | grep -i approval`, значення не
  ехати) — якщо виставлений, пункт скіпнути.
- Generated-файли (`openapi.d.ts`, `migrations/index.ts` у db-schema) не чіпаються
  взагалі.

## Поза скоупом (свідомо)

- `apps/*` крім WP5.3 (мертвий shim, нерозривно пов'язаний із dualwrite-cleanup).
- Будь-які знахідки з тегом «possibly deliberate (dual-write)» — до завершення
  ADR-0073.
- eslint-plugin-sergeant-design, design-tokens, config — аудит показав «lean».
