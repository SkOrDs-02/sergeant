# Web: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-10-08 by @claude (вигорання: 15 → 1 сайт; хвилі 5 і 6 зняли чотирнадцять без зміни поведінки). **Next review:** 2027-01-06.
> **Status:** Active

Документ фіксує **інваріанти** там, де ESLint `react-hooks/exhaustive-deps` вимкнено у виробничих модулях. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу.

**Поточний стан (звірено 2026-10-08): 1 сайт в 1 файлі.** Лічильник тут похідний і застаріває за тиждень (знімок 2026-08-07 казав «5», 2026-09-17 — 15, 2026-10-08 — 1). Джерело істини — сам код:

```bash
rg -n "eslint-disable.*exhaustive-deps" apps/web/src -g '*.{ts,tsx}' -g '!**/*.{test,spec}.{ts,tsx}'
```

Хвиля 4 (2026-07-10) звела каталог до нуля; усе нижче з'явилось після неї як свідомі винятки, хвиля 5 (2026-10-08) зняла дев'ять із п'ятнадцяти, хвиля 6 (того ж дня) — ще п'ять файлів (шість директив), лишився один виняток (див. «Хвиля 5» і «Хвиля 6»).

> **Про WHY поруч із директивою.** Сайт нижче несе обґрунтування в `-- <why>`-хвості самої директиви та в коментарі над нею. Рев'ю блокує disable без WHY і без рядка в цій таблиці. Номери рядків тут не пишемо — вони пливуть; шукай через `rg` вище.

| Файл                               | Інваріант                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/hooks/useTweenedValues.ts` | `values` у cleanup навмисно поза deps — інакше tween рестартує щокадру; retarget лише на `target`/`duration`. Зняття міняє поведінку (cleanup бачить `values` з рендера старту tween, а не останній кадр) і еквівалентність не доведена тестом |

Нижче — історія хвиль і патерни, які замінили disable. Аналогічний список для mobile: [`apps-mobile-exhaustive-deps.md`](./apps-mobile-exhaustive-deps.md).

---

## Простими словами: навіщо це було і що зробили

**Проблема.** Правило `exhaustive-deps` каже React-хукам: «перезапускай ефект/memo, коли змінюється будь-яка змінна, яку ти читаєш». Іноді це ламає задум:

- **Один раз при відкритті** — аналітика лендингу, відновлення вкладки Routine. Якщо додати все в deps, ефект стрілятиме знову при кожному ре-рендері батька.
- **«Тік» після запису в storage** — Hub-картки (калорії, звички, витрати) читають localStorage/SQLite. Значення `bump` саме по собі не використовується в обчисленні — воно лише каже «щойно щось записали, перечитай». ESLint вважало `bump` зайвим і просило прибрати — тоді картки не оновлювались би після зміни даних.
- **Стабільні функції** — `reset` з react-hook-form, `setView` з useState, module-level `loadNutritionLog`. Вони не змінюються, але лінтер вимагав їх у списку — або навпаки, зайвий `user`-об'єкт після refetch `/me` викликав би повторний PostHog identify.

**Що зробили по хвилях** (каталог з **34 → 0** файлів з disable на 2026-07-10; поточний список свідомих винятків — таблиця вище):

| Хвиля | Що                                           | Як                                                                                |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| **1** | PWA/hub prefs                                | ref-fix, читання всередині ефекту, коректні deps                                  |
| **2** | `useSearchEngine`                            | `useCallback` для обробників клавіатури                                           |
| **3** | Command palette, shortcuts, діалоги, HubChat | ref-sync + revision fingerprint; RHF `reset` у deps                               |
| **4** | Hub-картки, mount-only, insights, auth       | `void bump` / `void tick` у memo; `firedRef` для one-shot; `userRef` для identify |

**Хвиля 5 (2026-10-08) — 15 → 6.** Знято без зміни поведінки:

| Файл                                                        | Як знято                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `modules/finyk/components/NetworthChart.tsx`                | `W`/`H`/`PAD` на рівні модуля; memo рахує `fractionX` напряму з `[pointCount, chartW]`, без `px` з замикання                 |
| `modules/finyk/pages/budgets/PlanningSubscriptions.tsx`     | `openSubscriptionForm` у deps: повторний запуск безпечний, бо `prevSubscriptionSignal.current` уже дорівнює сигналу          |
| `modules/finyk/components/receiptScan/ReceiptScanSheet.tsx` | `const { reset: resetBulkReceipts } = bulkReceipts` — `reset` стабільний (`useCallback([])`), обʼєкт — ні                    |
| `modules/fizruk/components/dashboard/HeroCardStates.tsx`    | `[announce, elapsedSec]` + `hasAnnouncedStartRef`: `announce` стабільний (провайдер), ref робить ефект одноразовим (є тест)  |
| `modules/nutrition/components/meal-sheet/PhotoStep.tsx` (2) | автовідкриття піккера: `photo.fileRef` — стабільний `useRef`, у deps не перезапускає ефект                                   |
| `shared/hooks/useActiveFizrukWorkout.ts`                    | патерн `void sqliteTick; void storageEpoch;` усередині `useMemo`                                                             |
| `core/app/HubMainContent.tsx`                               | `HUB_TAB_ORDER` справді винесено на рівень модуля (раніше коментар це стверджував, а масив жив усередині компонента)         |
| `core/hub/useHubDashboardState.ts`                          | `void storageBump` усередині `useMemo`                                                                                       |
| `core/insights/CrossModuleLinksSection.tsx`                 | `void` для чотирьох ключів інвалідації (`storageBump`, `*Tick`) усередині `useMemo`; пояснення «не прибирай» лишилось у коді |

**Хвиля 6 (2026-10-08) — 6 → 1.** Джерело нестабільності стабілізовано в корені, поведінка та сама; одноразовість закріплено тестами поруч із кодом:

| Файл                                                        | Як знято                                                                                                                                                                                | Тест                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `modules/nutrition/hooks/usePhotoAnalysis.ts` + `PhotoStep` | `analyzePhoto`/`refinePhoto` — `useCallback` над `mutation.mutate` (стабільний у TanStack Query v5), а не над обʼєктом `useMutation`; у `PhotoStep` обидва ефекти мають повні deps      | `usePhotoAnalysis.test.tsx` (ідентичність), `PhotoStep.test.tsx` (нова обгортка) |
| `modules/finyk/hooks/usePrivatbank.ts`                      | `fetchTransactions`/`loadAccounts`/`hydrate` у `useCallback` (чіпають лише стабільні сеттери й модульні функції); bootstrap-ефект має `[enabled, hydrate, loadAccounts]`, guard лишився | `usePrivatbank.test.tsx` (status/connect рівно раз)                              |
| `core/security/AppLockSettings.tsx`                         | `const { state: lockState, hasPin } = appLock` — ефект залежить від примітива й стабільного `useCallback`, а не від нового обʼєкта щорендера                                            | `AppLockSettings.deps.test.tsx` (`hasPin()` рівно раз)                           |
| `modules/fizruk/components/workouts/RestTimerOverlay.tsx`   | `total` читається з `useLatestRef`; deps — `isActive` + стабільні `announce` і рядки `rt.*`                                                                                             | `announceOnce.test.tsx` (±15/±30 не повторюють «старт»)                          |
| `modules/fizruk/components/BodyAtlas.tsx`                   | `selectionAnnouncement` (читає `data`) береться з `useLatestRef`; deps — `focusMuscleId` + стабільний `announce`                                                                        | `announceOnce.test.tsx` (нові `data` не повторюють озвучення)                    |

Новий хелпер [`shared/hooks/useLatestRef.ts`](../../../apps/web/src/shared/hooks/useLatestRef.ts) — «ref на останнє значення» (оновлюється в layout-ефекті, тому звичайний `useEffect` того ж коміту бачить свіже).

**Патерни замість disable** (використовуй при новому коді):

1. **`void bump`** на початку `useMemo` — явно «використовуємо» тік, не прибираючи його з deps.
2. **`firedRef` / `*HandledRef`** — ефект з повним dep-списком, але логіка виконується лише один раз.
3. **`useRef` + `useLayoutEffect`** — свіжі callback/open/close без зайвих перезапусків ефекту.
4. **Деструктуризація `reset` з RHF** — стабільна функція в deps без всього form-об'єкта (так само `state`/`hasPin` з нестабільного обʼєкта хука).
5. **`useLatestRef`** — ефект з одним тригером, що читає свіжі дані/колбеки через `ref.current`.
6. **`useCallback` у корені** — стабілізуй функцію там, де вона створюється, а не глуши правило в споживачі.

---

## Історія знятих винятків (архів)

**Wave 1:** `usePwaAction`, `hubPrefs`, `useNutritionPwaAction` + раніше: `useLocalStorageState`, `useHubNavigation`, `NutritionSection`, `ManualExpenseSheet`, `useFinykStorageSlots`, `HabitQuickCreateDialog`, `useFoodSearch`.

**Wave 2:** `useSearchEngine.ts`.

**Wave 3:** `CommandPalette`, `CommandPaletteUI`, `KeyboardShortcutsModal`, `InputDialog`, `WaitlistForm`, `HubChatOverlay`.

**Wave 4:** Hub cards (`NutritionCard`, `RoutineCard`, `FitnessCard`, `ExpensesCard`, `dashboardCards`), insights (`useFinykInsights`, `useNutritionInsights`), `useFinykPersonalization`, `useOverviewData`, `useRoutineDerivedData`, `useActivationV2Boot`, `AuthContext`, `PersonalInfoSection`, `LandingPage`, `FinykApp`, `useRoutineAppState`, `useWorkoutsLifecycle`.

**Ризик:** новий код з «тіком», mount-only або refetch-sensitive логікою — спочатку перевір патерни вище, потім vitest / ручний сценарій.
