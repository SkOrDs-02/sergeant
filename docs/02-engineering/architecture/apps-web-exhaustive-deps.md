# Web: навмисні винятки `react-hooks/exhaustive-deps`

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Active

Документ фіксує **інваріанти** там, де ESLint `react-hooks/exhaustive-deps` вимкнено у виробничих модулях. Мета — не «вимкнути правило», а зафіксувати контракт для рев'ю та рефакторингу.

**Поточний стан (2026-07-10, wave 4):** **0 активних `eslint-disable` у виробничому `apps/web/src`** (тестові файли не враховуються). Усі колишні винятки знято; нижче — історія хвиль і патерни, які замінили disable. Живий список production-disable — у mobile: [`apps-mobile-exhaustive-deps.md`](./apps-mobile-exhaustive-deps.md).

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
