# Web: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-08-07 by @claude. **Next review:** 2026-12-03.
> **Status:** Active

Документ фіксує **інваріанти** там, де ESLint `react-hooks/exhaustive-deps` вимкнено у виробничих модулях. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу.

**Поточний стан (2026-08-07):** **5 активних `eslint-disable` у виробничому `apps/web/src`** (тестові файли не враховуються). Хвиля 4 (2026-07-10) звела каталог до нуля; наведені нижче п'ять з'явилися після неї як свідомі винятки.

> **Виправлено 2026-08-07.** Рядок вище стверджував, що «кожен має інлайн-обґрунтування поруч із директивою» — насправді його мав рівно один (`usePrivatbank.ts`), решта чотири покладались на цю таблицю. Інваріанти перенесені в код (`-- <why>` у самій директиві), тож твердження тепер відповідає дійсності, а `grep`-перевірка «disable без WHY» дає по web нуль. Таблиця лишається джерелом розгорнутого контексту.

| Файл                                         | Рядок | Інваріант                                                                               |
| -------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `modules/finyk/components/NetworthChart.tsx` | 133   | `px(i)` — стабільна проєкція; додавання в deps перераховувало б memo щорендеру          |
| `modules/finyk/hooks/usePrivatbank.ts`       | 484   | bootstrap рівно раз під guard `bootstrapped`; `hydrate`/`loadAccounts` нестабільні      |
| `shared/hooks/useTweenedValues.ts`           | 71    | `values` навмисно поза deps — інакше tween рестартує щокадру; retarget лише на `target` |
| `shared/hooks/useActiveFizrukWorkout.ts`     | 87    | ефект перезапускається саме на «тік» після запису, який правило не бачить               |
| `core/app/HubMainContent.tsx`                | 219   | `HUB_TAB_ORDER` — module-level константа, dep не потрібен                               |

Нижче — історія хвиль і патерни, які замінили disable. Аналогічний список для mobile: [`apps-mobile-exhaustive-deps.md`](./apps-mobile-exhaustive-deps.md).

---

## Простими словами: навіщо це було і що зробили

**Проблема.** Правило `exhaustive-deps` каже React-хукам: «перезапускай ефект/memo, коли змінюється будь-яка змінна, яку ти читаєш». Іноді це ламає задум:

- **Один раз при відкритті** — аналітика лендингу, deep-link `?sync=`, відновлення вкладки Routine. Якщо додати все в deps, ефект стрілятиме знову при кожному ре-рендері батька.
- **«Тік» після запису в storage** — Hub-картки (калорії, звички, витрати) читають localStorage/SQLite. Значення `bump` саме по собі не використовується в обчисленні — воно лише каже «щойно щось записали, перечитай». ESLint вважало `bump` зайвим і просило прибрати — тоді картки не оновлювались би після зміни даних.
- **Стабільні функції** — `reset` з react-hook-form, `setView` з useState, module-level `loadNutritionLog`. Вони не змінюються, але лінтер вимагав їх у списку — або навпаки, зайвий `user`-об'єкт після refetch `/me` викликав би повторний PostHog identify.

**Що зробили по хвилях** (каталог з **34 → 0** файлів з disable):

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
