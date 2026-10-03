# Web: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-09-17 by @claude (каталог перезнято: 15 сайтів, лічильник → `rg`-команда, знято «нуль без WHY»). **Next review:** 2026-12-16.
> **Status:** Active

Документ фіксує **інваріанти** там, де ESLint `react-hooks/exhaustive-deps` вимкнено у виробничих модулях. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу.

**Поточний стан:** лічильник тут не тримаємо — він похідний і застаріває за тиждень (знімок 2026-08-07 казав «5», на 2026-09-17 сайтів уже 15 у 14 файлах). Джерело істини — сам код:

```bash
rg -n "eslint-disable.*exhaustive-deps" apps/web/src -g '*.{ts,tsx}' -g '!**/*.{test,spec}.{ts,tsx}'
```

Хвиля 4 (2026-07-10) звела каталог до нуля; усе нижче з'явилось після неї як свідомі винятки.

> **Про WHY поруч із директивою.** 2026-08-07 інваріанти перших п'яти сайтів перенесли в код (`-- <why>` у самій директиві), і тоді `grep` «disable без WHY» давав нуль. Станом на 2026-09-17 це вже не так: чотири сайти (`CrossModuleLinksSection`, обидва в `PhotoStep`, `RestTimerOverlay`) мають обґрунтування **коментарем над директивою**, а не у `-- <why>`-хвості. Контракт лишається: рев'ю блокує disable без WHY у будь-якій із двох форм і без рядка в цій таблиці. Номери рядків тут не пишемо — вони пливуть; шукай через `rg` вище.

| Файл                                                        | Інваріант                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `modules/finyk/components/NetworthChart.tsx`                | `px(i)` — стабільна проєкція; додавання в deps перераховувало б memo щорендеру                                                 |
| `modules/finyk/hooks/usePrivatbank.ts`                      | bootstrap рівно раз під guard `bootstrapped`; `hydrate`/`loadAccounts` нестабільні                                             |
| `modules/finyk/pages/budgets/PlanningSubscriptions.tsx`     | `openSubscriptionForm` замикає стабільні сеттери з `useAssetsState`; перезапуск на зміну ідентичності повторив би сигнал       |
| `modules/finyk/components/receiptScan/ReceiptScanSheet.tsx` | reset-on-close only; `bulkReceipts` — новий обʼєкт щорендера                                                                   |
| `modules/fizruk/components/BodyAtlas.tsx`                   | один раз на вхідний focus-target; `announce`/`data` навмисно поза deps                                                         |
| `modules/fizruk/components/dashboard/HeroCardStates.tsx`    | mount-only announce                                                                                                            |
| `modules/fizruk/components/workouts/RestTimerOverlay.tsx`   | keyed на `isActive`, не на `restTimer`: ±15/±30 замінюють обʼєкт, але не мають повторно оголошувати «старт»                    |
| `modules/nutrition/components/meal-sheet/PhotoStep.tsx` ×2  | (1) `photo.analyzePhoto` перестворюється щорендера, повтор для того ж кадру відсікає ref; (2) mount-only автовідкриття піккера |
| `shared/hooks/useTweenedValues.ts`                          | `values` навмисно поза deps — інакше tween рестартує щокадру; retarget лише на `target`                                        |
| `shared/hooks/useActiveFizrukWorkout.ts`                    | ефект перезапускається саме на «тік» після запису, який правило не бачить                                                      |
| `core/app/HubMainContent.tsx`                               | `HUB_TAB_ORDER` — module-level константа, dep не потрібен                                                                      |
| `core/hub/useHubDashboardState.ts`                          | storage-write tick (патерн «тік», див. нижче)                                                                                  |
| `core/insights/CrossModuleLinksSection.tsx`                 | deps — ключі інвалідації (`storageBump`, `*Tick`), а не значення: дані йдуть з кешів поза React (B1)                           |
| `core/security/AppLockSettings.tsx`                         | `appLock` — новий обʼєкт-літерал щорендеру; важливі лише `.state` і `.hasPin`, обидва вже в deps                               |

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

**Патерни замість disable** (використовуй при новому коді):

1. **`void bump`** на початку `useMemo` — явно «використовуємо» тік, не прибираючи його з deps.
2. **`firedRef` / `*HandledRef`** — ефект з повним dep-списком, але логіка виконується лише один раз.
3. **`useRef` + `useLayoutEffect`** — свіжі callback/open/close без зайвих перезапусків ефекту.
4. **Деструктуризація `reset` з RHF** — стабільна функція в deps без всього form-об'єкта.

---

## Історія знятих винятків (архів)

**Wave 1:** `usePwaAction`, `hubPrefs`, `useNutritionPwaAction` + раніше: `useLocalStorageState`, `useHubNavigation`, `NutritionSection`, `ManualExpenseSheet`, `useFinykStorageSlots`, `HabitQuickCreateDialog`, `useFoodSearch`.

**Wave 2:** `useSearchEngine.ts`.

**Wave 3:** `CommandPalette`, `CommandPaletteUI`, `KeyboardShortcutsModal`, `InputDialog`, `WaitlistForm`, `HubChatOverlay`.

**Wave 4:** Hub cards (`NutritionCard`, `RoutineCard`, `FitnessCard`, `ExpensesCard`, `dashboardCards`), insights (`useFinykInsights`, `useNutritionInsights`), `useFinykPersonalization`, `useOverviewData`, `useRoutineDerivedData`, `useActivationV2Boot`, `AuthContext`, `PersonalInfoSection`, `LandingPage`, `FinykApp`, `useRoutineAppState`, `useWorkoutsLifecycle`.

**Ризик:** новий код з «тіком», mount-only або refetch-sensitive логікою — спочатку перевір патерни вище, потім vitest / ручний сценарій.
