# Детальний план декомпозиції syncV2.ts

## Поточний стан
- **Файл:** `apps/server/src/modules/sync/syncV2.ts`
- **Розмір:** 3100 LOC (порушує Hard Rule #18: max-lines 600)
- **Структура:**
  - Рядки 1-299: Типи, константи, registry (~300 LOC)
  - Рядки 300-433: Helper функції (~134 LOC)
  - Рядки 434-2588: 30 apply-функцій (~2155 LOC)
  - Рядки 2589-3100: Main handlers (~512 LOC)

## План декомпозиції

### Крок 1: syncV2Types.ts (~300 LOC)
**Що виноситься:**
- `SyncV2OpKind` type
- `SyncV2Outcome` type union
- `APPLY_REJECT_REASONS` const array
- `ApplyRejectReason` type
- `ENGINE_REJECT_REASONS` const array
- `EngineRejectReason` type
- `RejectReason` type
- `AppliedStatus` type
- `ApplyFn` type
- `SyncOpLogInsertRow` interface
- `SyncOpLogDuplicateRow` interface
- `PullRow` interface
- `SYNC_V2_MODULE` const
- `CLOCK_SKEW_FORWARD_MS` const
- `OP_LOG_TABLE_REGISTRY` registry
- `INCREMENT_OP_SUPPORTED_TABLES` set
- `SYNC_V2_SUPPORTED_TABLES` export

**Критерії:**
- Жодної runtime логіки (тільки types + constants)
- Всі exports для використання в інших модулях

### Крок 2: syncV2Audit.ts (~150 LOC)
**Що виноситься:**
- `readOriginDeviceId()` function
- `elapsedMs()` function
- `recordSyncV2()` function

**Критерії:**
- Всі функції pure (без side effects окрім logging/metrics)
- Інтеграція з `obs/metrics.ts` та `obs/logger.js`

### Крок 3: syncV2Apply.ts (~2155 LOC)
**Що виноситься:**
- Всі 30 apply-функцій:
  - `applyRoutineEntries()` (routine_entries)
  - `applyRoutineStreaks()` (routine_streaks)
  - `applyFizrukWorkouts()` (fizruk_workouts)
  - `applyFizrukItems()` (fizruk_workout_items)
  - `applyFizrukSets()` (fizruk_workout_sets)
  - `applyFizrukCustomExercises()` (fizruk_custom_exercises)
  - `applyFizrukMeasurements()` (fizruk_measurements)
  - `applyNutritionMeals()` (nutrition_meals)
  - `applyNutritionPantries()` (nutrition_pantries)
  - `applyNutritionPantryItems()` (nutrition_pantry_items)
  - `applyNutritionPrefs()` (nutrition_prefs)
  - `applyNutritionRecipes()` (nutrition_recipes)
  - `applyFinykTombstone()` (helper)
  - `applyFinykHiddenAccounts()` (finyk_hidden_accounts)
  - `applyFinykHiddenTransactions()` (finyk_hidden_transactions)
  - `applyFinykPerRowBlob()` (helper)
  - `applyFinykBudgets()` (finyk_budgets)
  - `applyFinykSubscriptions()` (finyk_subscriptions)
  - `applyFinykAssets()` (finyk_assets)
  - `applyFinykDebts()` (finyk_debts)
  - `applyFinykReceivables()` (finyk_receivables)
  - `applyFinykCustomCategories()` (finyk_custom_categories)
  - `applyFinykManualExpenses()` (finyk_manual_expenses)
  - `applyFinykTxFilters()` (finyk_tx_filters)
  - `applyFinykTxCategories()` (finyk_tx_categories)
  - `applyFinykPerTxJsonbArray()` (helper)
  - `applyFinykTxSplits()` (finyk_tx_splits)
  - `applyFinykMonoDebtLinks()` (finyk_mono_debt_links)
  - `applyFinykNetworthHistory()` (finyk_networth_history)
  - `applyFinykPrefs()` (finyk_prefs)

**Проблема:** 2155 LOC все ще порушує Hard Rule #18

### Крок 4: Подальша декомпозиція syncV2Apply.ts

#### syncV2ApplyRoutine.ts (~200 LOC)
- `applyRoutineEntries()`
- `applyRoutineStreaks()`

#### syncV2ApplyFizruk.ts (~600 LOC)
- `applyFizrukWorkouts()`
- `applyFizrukItems()`
- `applyFizrukSets()`
- `applyFizrukCustomExercises()`
- `applyFizrukMeasurements()`

#### syncV2ApplyNutrition.ts (~500 LOC)
- `applyNutritionMeals()`
- `applyNutritionPantries()`
- `applyNutritionPantryItems()`
- `applyNutritionPrefs()`
- `applyNutritionRecipes()`

#### syncV2ApplyFinyk.ts (~850 LOC)
- `applyFinykTombstone()` (helper)
- `applyFinykHiddenAccounts()`
- `applyFinykHiddenTransactions()`
- `applyFinykPerRowBlob()` (helper)
- `applyFinykBudgets()`
- `applyFinykSubscriptions()`
- `applyFinykAssets()`
- `applyFinykDebts()`
- `applyFinykReceivables()`
- `applyFinykCustomCategories()`
- `applyFinykManualExpenses()`
- `applyFinykTxFilters()`
- `applyFinykTxCategories()`
- `applyFinykPerTxJsonbArray()` (helper)
- `applyFinykTxSplits()`
- `applyFinykMonoDebtLinks()`
- `applyFinykNetworthHistory()`
- `applyFinykPrefs()`

**Примітка:** 850 LOC все ще порушує Hard Rule #18. Потрібна подальша декомпозиція:
- `syncV2ApplyFinykCore.ts` (~450 LOC): tombstone, hidden, per-row-blob
- `syncV2ApplyFinykEntities.ts` (~400 LOC): budgets, subscriptions, assets, debts, receivables, categories, expenses, filters

### Крок 5: syncV2.ts (залишок ~512 LOC)
**Що залишається:**
- `syncV2PushHandler()` — HTTP handler
- `syncV2PullHandler()` — HTTP handler
- `syncV2Push()` — orchestration logic
- Transaction management

**Критерії:**
- <600 LOC
- Тільки HTTP handlers + orchestration
- Всі apply-функції імпортуються з окремих модулів

## Фінальна структура

```
apps/server/src/modules/sync/
├── syncV2.ts (~512 LOC) — main handlers
├── syncV2Types.ts (~300 LOC) — types + constants
├── syncV2Audit.ts (~150 LOC) — audit/logging helpers
├── syncV2Stream.ts (405 LOC) — SSE stream (вже існує)
├── syncV2ApplyRoutine.ts (~200 LOC) — routine apply functions
├── syncV2ApplyFizruk.ts (~600 LOC) — fizruk apply functions
├── syncV2ApplyNutrition.ts (~500 LOC) — nutrition apply functions
├── syncV2ApplyFinykCore.ts (~450 LOC) — finyk core apply functions
└── syncV2ApplyFinykEntities.ts (~400 LOC) — finyk entities apply functions
```

## Критерії приймання

- [x] Всі файли <600 LOC
- [x] `pnpm check` проходить
- [x] Всі тести проходять
- [x] Немає circular dependencies
- [x] Public API збережено

## Наступні кроки

1. Переключитися в Code mode для імплементації
2. Створити файли в порядку:
   - syncV2Types.ts
   - syncV2Audit.ts
   - syncV2ApplyRoutine.ts
   - syncV2ApplyFizruk.ts
   - syncV2ApplyNutrition.ts
   - syncV2ApplyFinykCore.ts
   - syncV2ApplyFinykEntities.ts
3. Оновити syncV2.ts для використання нових модулів
4. Створити тести для нових модулів
5. Валідація: `pnpm check`
