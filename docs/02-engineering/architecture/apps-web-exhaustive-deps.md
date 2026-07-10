# Web: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-08.
> **Status:** Active

Документ фіксує **інваріанти** там, де ESLint `react-hooks/exhaustive-deps` вимкнено у виробничих модулях. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу. Каталог охоплює **24 виробничих файли** (тестові файли не включені).

---

## UI-примітиви (`apps/web/src/shared/components/ui/`)

| Файл / функція                                        | Фактичні deps                            | Інваріант                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeyboardShortcutsModal.tsx` (`useRegisterShortcuts`) | `[registry, registrationId]`             | `shortcuts` (inline-масив) не в deps — deep-порівняння вимагало б JSON-серіалізації на кожен рендер; callers передають стабільний статичний масив.                                        |
| `InputDialog.tsx`                                     | `[open, defaultValue]`                   | `reset` (від RHF) і `inputRef` стабільні; відкриття діалогу та зміна `defaultValue` — єдині смислові тригери скидання форми.                                                              |
| `CommandPalette.tsx` (`useRegisterCommand`)           | `[register, unregister, registrationId]` | `commands` (memoized масив) не в deps — залежність від усього `ctx`-об'єкту спричиняла нескінченний цикл: `register` → bump `revision` → новий `ctx` → effect re-runs → `register` знову. |
| `CommandPaletteUI.tsx`                                | `[ctx, revision]`                        | `revision` тікає при реєстрації/знятті команд і є смисловим тригером `ctx.getAll()`; інші поля `ctx` (`open`, `recents`) не впливають на список команд.                                   |

## Core / Hub (`apps/web/src/core/hub/`)

| Файл / функція                              | Фактичні deps                        | Інваріант                                                                                                                                  |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `HubChatOverlay.tsx`                        | `[location.pathname]`                | `open` і `closeChat` навмисно не в deps — їхня зміна (відкриття overlay) не повинна викликати негайне закриття в тому самому тику рендеру. |
| `NutritionCard.tsx`                         | `[period, offset, bump]`             | `bump` (від `useHubStorageBump`) є смисловим тригером re-read storage; `loadNutritionLog` — стабільна module-level функція.                |
| `RoutineCard.tsx`                           | `[period, offset, bump]`             | Аналогічно `NutritionCard` — `bump` ініціює повторне читання routine-storage без зміни інших deps.                                         |
| `FitnessCard.tsx`                           | `[period, offset, bump]`             | Аналогічно `NutritionCard` — `bump` ініціює читання SQLite warm cache для тренувань.                                                       |
| `ExpensesCard.tsx`                          | `[period, offset, bump, mirrorTick]` | `bump` і `mirrorTick` ініціюють re-read storage/mirror; `getCachedFinykMonoMirrorState` — стабільна функція.                               |
| `dashboardCards.tsx` (`StreakIndicator`)    | `[bump]`                             | `bump` є смисловим тригером re-read quick-stats із localStorage; `safeReadLS` — стабільна функція.                                         |
| `dashboardCards.tsx` (`MotivationalFooter`) | `[bump]`                             | `bump` ініціює перерахунок `countRealEntries`; `localStorageStore` — стабільний модульний об'єкт.                                          |

## Core / Hub / Search (`apps/web/src/core/hub/search/`)

_Немає активних винятків — `useSearchEngine.ts` wave 2 (2026-07-10): `openHit`/`commitQuery`/`escalateToChat` у `useCallback`, disable прибрано._

## Auth та активація (`apps/web/src/core/`)

| Файл / функція                      | Фактичні deps                    | Інваріант                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/AuthContext.tsx`              | `[user?.id]`                     | `user`-об'єкт не в deps — traits (signup_date) стабільні на час сесії, а решта (vibe/plan/locale) тягнеться з localStorage і `navigator`; повторний `identify` на кожен рефетч `/api/v1/me` з тим самим id є зайвим. |
| `activation/useActivationV2Boot.ts` | `[user, queryClient, cacheTick]` | `cacheTick` — смисловий тригер recompute snapshot; реальні значення читаються всередині memo через `queryClient.getQueryData`, а не з deps-переліку.                                                                 |

## Landing та Pricing (`apps/web/src/core/`)

| Файл / функція             | Фактичні deps   | Інваріант                                                                                                                                                   |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LandingPage.tsx`          | `[]`            | `LANDING_VIEWED` аналітика стріляє один раз на mount; `locale` і `referrer` читаються всередині ефекту; повторний фаєр при кожній зміні locale — небажаний. |
| `pricing/WaitlistForm.tsx` | `[defaultTier]` | `reset` і `watch` — стабільні від RHF; зміна `defaultTier` ззовні — єдиний смисловий тригер синхронізації form-state.                                       |

## Налаштування (`apps/web/src/core/profile/`)

| Файл / функція            | Фактичні deps | Інваріант                                                                                                                         |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PersonalInfoSection.tsx` | `[user.name]` | `nameForm.reset` гарантовано стабільний (RHF); весь `nameForm`-об'єкт не в deps, щоб уникнути infinite loop при зміні form-state. |

## Finyk (`apps/web/src/modules/finyk/`)

| Файл / функція                                            | Фактичні deps                                 | Інваріант                                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FinykApp.tsx` (URL sync effect)                          | `[]`                                          | Mount-only ефект: `?sync=` обробляється один раз при відкритті модуля; `storage`/`toast` — стабільні або setter-и.                                                                                     |
| `FinykApp.tsx` (first-run nav effect)                     | `[]`                                          | Mount-only ефект: `firstRunFinyk`/`pwaAction`/`page` читаються один раз; навігація до `"budgets"` повинна відбуватись лише при першому mount.                                                          |
| `hooks/useFinykInsights.ts`                               | `[mirrorTick]`                                | `mirrorTick` ініціює re-read Mono mirror cache; `getCachedFinykMonoMirrorState` — стабільна module-level функція.                                                                                      |
| `hooks/useFinykPersonalization.ts`                        | `[excludedTxIdsKey]`                          | `Set` для `excludedTxIds` ре-створюється лише при зміні відсортованого ключа (рядок id); `rawExcludedTxIds` — нестабільне посилання, що змінюється на кожен рендер, але вміст Set може бути однаковим. |
| `pages/overview/useOverviewData.ts` (`subscriptionFlows`) | `[subscriptions, transactions, todayStartMs]` | `kyivYear`/`Month`/`Day` і `txCategories` є похідними від `subscriptions`/`transactions`/`todayStartMs`; їхнє дублювання у deps лише повторювало б ті самі тригери.                                    |

## Routine (`apps/web/src/modules/routine/`)

| Файл / функція                               | Фактичні deps                         | Інваріант                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRoutineDerivedData.ts`                   | `[routine, range, finykCalendarTick]` | `finykCalendarTick` оновлює події Фініка у календарі без зміни об'єкта `routine`; без нього тік Finyk mirror не впливав би на вивід хука.                         |
| `useRoutineAppState.ts` (restore tab effect) | `[]`                                  | Mount-only ефект: відновлення останньої активної вкладки з localStorage виконується один раз при першому mount; `restoredFromPersistRef` блокує повторний запуск. |
| `useRoutineAppState.ts` (deep-link effect)   | `[]`                                  | Mount-only ефект: параметр `?routineDay=` споживається одноразово при відкритті модуля і видаляється з URL.                                                       |

## Nutrition (`apps/web/src/modules/nutrition/`)

| Файл / функція                  | Фактичні deps       | Інваріант                                                                                                                   |
| ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useNutritionInsights.ts` | `[sqliteCacheTick]` | `sqliteCacheTick` ініціює re-read Nutrition SQLite cache; `getCachedNutritionSqliteState` — стабільна module-level функція. |

## Fizruk (`apps/web/src/modules/fizruk/`)

| Файл / функція                                                 | Фактичні deps                                 | Інваріант                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useWorkoutsLifecycle.ts` (`useWorkoutsViewFromSession`) | `[]`                                          | Mount-only ефект: sessionStorage-флаг `fizruk_workouts_mode` споживається одноразово; `setView` — стабільний setter.                                             |
| `hooks/useWorkoutsLifecycle.ts` (`useLiveWorkoutTick`)         | `[activeWorkout?.id, activeWorkout?.endedAt]` | Інтервал перезапускається лише при зміні `id` або `endedAt` — повний workout-об'єкт мутується при редагуванні сетів і не повинен перезапускати таймер щосекунди. |

---

**Загальна кількість файлів:** 23 (деякі файли містять кілька навмисних винятків у різних функціях).

**Знято у wave 1 (2026-07-10):** `usePwaAction.ts` (ref-fix), `settings/hubPrefs.ts` (read усередині ефекту), `nutrition/useNutritionPwaAction.ts` (стабільні deps додано). Раніше знято попередніми агентами: `useLocalStorageState.ts`, `useHubNavigation.ts`, `NutritionSection.tsx`, `ManualExpenseSheet.tsx`, `useFinykStorageSlots.ts`, `HabitQuickCreateDialog.tsx`, `useFoodSearch.ts`.

**Ризик:** будь-який рефакторинг, що перейменовує залежності або виносить логіку у нові props/hooks, має **перечитати** відповідний коментар у файлі та прогнати відповідні vitest / ручний сценарій.

**Поліпшення (wave 2):** `useSearchEngine.ts` — обгорнути `openHit`/`commitQuery` у `useCallback` для повністю коректного dep-списку без disable.
