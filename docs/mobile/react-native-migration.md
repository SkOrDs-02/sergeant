# Міграція на React Native (Expo)

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Документ-"source of truth" по перенесенню Sergeant із PWA-клієнта
> (`apps/web`, Vite + React + Tailwind + Workbox) на нативний iOS/Android
> клієнт (`apps/mobile`, Expo + React Native + Expo Router). Пишеться
> і оновлюється в міру виконання робіт — розглядайте це як живий
> roadmap, а не як одноразову проектну специфікацію.

## 1. Мета міграції

- Один нативний клієнт для iOS і Android, встановлюваний через App Store
  / Play Store (наразі "встановлення" доступне лише як PWA через
  Add-to-Home-Screen).
- Рідний UX на мобільних: haptics, native tab-bar, native gesture stack,
  push-нотифікації через APNs/FCM без обмежень Safari Web Push,
  background-таски (нагадування, sync), камера без `getUserMedia`
  capricious режимів iOS, native barcode-scanner.
- Максимальний реюз коду з `apps/web` через спільні workspace-пакети
  (`@sergeant/shared`, `@sergeant/api-client`, `@sergeant/finyk-domain`,
  `@sergeant/config`).
- Нуль регресій для існуючих web-користувачів на час міграції:
  `apps/web` (PWA) залишається повноцінним до моменту, поки `apps/mobile`
  не покриє 100% функціоналу.

## 2. Поточний стан (станом на цей документ)

### 2.0 Snapshot прогресу

| Фаза | Статус         | Ключові PR-и / артефакти                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | ✅ Done        | Скафолд `apps/mobile` (до [PR #401](https://github.com/Skords-01/Sergeant/pull/401)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1    | ✅ Done        | [#403](https://github.com/Skords-01/Sergeant/pull/403) NativeWind, [#404](https://github.com/Skords-01/Sergeant/pull/404) MMKV + storage-адаптер, [#405](https://github.com/Skords-01/Sergeant/pull/405) **R1** (`storageKeys` → `@sergeant/shared`), [#406](https://github.com/Skords-01/Sergeant/pull/406) **R6** (`@sergeant/design-tokens`), [#407](https://github.com/Skords-01/Sergeant/pull/407) `Button` UI-примітив, [#408](https://github.com/Skords-01/Sergeant/pull/408) + [#410](https://github.com/Skords-01/Sergeant/pull/410) EAS dev-client профайли + README, [#413](https://github.com/Skords-01/Sergeant/pull/413) `Card` UI-примітив + jest-expo setup, [#417](https://github.com/Skords-01/Sergeant/pull/417) `Input` / `Textarea`, [#419](https://github.com/Skords-01/Sergeant/pull/419) `Banner`, [#421](https://github.com/Skords-01/Sergeant/pull/421) `Toast` + `ToastProvider` / `useToast`, [#423](https://github.com/Skords-01/Sergeant/pull/423) `Skeleton` / `SkeletonText`, [#426](https://github.com/Skords-01/Sergeant/pull/426) `Sheet`, [#427](https://github.com/Skords-01/Sergeant/pull/427) `ConfirmDialog`. Усі 8 UI-примітивів (Button, Card, Input/Textarea, Banner, Toast, Skeleton, Sheet, ConfirmDialog) поставлені у `apps/mobile/src/shared/ui`, покриті `@testing-library/react-native` тестами, без нових runtime-deps поверх NativeWind + RN-core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2    | 🔵 In progress | Підготовка: [#409](https://github.com/Skords-01/Sergeant/pull/409) додав секцію "Native Patterns" у `docs/design/BRANDBOOK.md` (Q9). Перший блок Hub-core ✅ Done — PR [#434](https://github.com/Skords-01/Sergeant/pull/434) приніс `ErrorBoundary` + `ModuleErrorBoundary` у `apps/mobile/src/core/` (порт із `apps/web` 1:1 по class-component API, shared `Card` + `Button` у fallback, `console.error`-stub на майбутній Sentry). Далі ✅ Done — PR [#441](https://github.com/Skords-01/Sergeant/pull/441) приніс `SyncStatusIndicator` (тонкий UI-споживач `useSyncStatus`, 4 стани: idle/syncing/offline/error, pulse з reduced-motion, ghost retry-Button, без підключення до `_layout.tsx`). Далі 🟡 In progress — HubSettings: shell + `RoutineSection` + `ExperimentalSection` ✅ PR [#443](https://github.com/Skords-01/Sergeant/pull/443); `GeneralSection` ✅ PR [#444](https://github.com/Skords-01/Sergeant/pull/444); `NotificationsSection` ✅ PR [#445](https://github.com/Skords-01/Sergeant/pull/445). Решта 3 секції (`FinykSection`, `FizrukSection`, `AIDigestSection`) ✅ PR [#456](https://github.com/Skords-01/Sergeant/pull/456) — усі 6 секцій HubSettings портовані. `HubDashboard` PR-1 (StatusRow + drag-reorder + shared `@sergeant/shared/dashboard` helpers) ✅ PR [#480](https://github.com/Skords-01/Sergeant/pull/480) — стартовий hub-екран з 3 видимими картками (finyk/fizruk/routine, nutrition сховано до Phase 7), довге-натискання → Reanimated drag-reorder, `↑/↓` a11y-fallback у `GeneralSection`, `DASHBOARD_ORDER` персистить через `useSyncedStorage`. `HubDashboard` PR-2 (hero-шар — `TodayFocusCard` + `useDashboardFocus` + `FirstActionHeroCard` + `SoftAuthPromptCard`) ✅ PR [#483](https://github.com/Skords-01/Sergeant/pull/483) — pure-домен `@sergeant/shared/lib/{vibePicks,firstRealEntry,recommendations,dashboardFocus,kvStore}` з injected-storage абстракцією (64 vitest-тести) + thin web-адаптери `apps/web/src/core/onboarding/{vibePicks,firstRealEntry}.ts` (API збережено для існуючих call-sites) + 3 mobile hero-картки з NativeWind + `expo-haptics` (`TodayFocusCard` empty-state з 3 quick-add чипами, nutrition схований до Phase 7; `FirstActionHeroCard` з picks-driven primary + expanded alternates; `SoftAuthPromptCard` inline cloud-sync prompt). Інтеграція у `HubDashboard.tsx` дотримується one-hero правила (`firstActionVisible` > `showSoftAuth` > `TodayFocusCard`), `onShowAuth` навігує до `(auth)/sign-in` modal; `rest`-рекомендації з `useDashboardFocus` фідять `HubInsightsPanel` (спільна `hub_recs_dismissed_v1` мапа). `HubDashboard` PR-3 (quick-stats preview + `HubInsightsPanel` + `WeeklyDigestFooter`) ✅ PR [#482](https://github.com/Skords-01/Sergeant/pull/482) — shared `quickStats` / `weeklyDigest` pure helpers + mobile preview-слот у `StatusRow`, collapsible `HubInsightsPanel` з reduce-motion animated-height, thin `WeeklyDigestFooter` з fresh-dot. Далі ✅ Done — PR [#492](https://github.com/Skords-01/Sergeant/pull/492) порт `OnboardingWizard` у `apps/mobile/src/core/OnboardingWizard.tsx`: pure-домен `@sergeant/shared/lib/onboarding` (`ONBOARDING_DONE_KEY`, `hasExistingData`, `shouldShowOnboarding`, `markOnboardingDone`, `buildFinalPicks` + `ONBOARDING_VIBE_ICONS`/`_TEASERS`/`_CHIP_ORDER`) з injected-`KVStore`, thin web-адаптер `apps/web/src/core/onboarding/onboardingGate.ts` (API 1:1), mobile splash-Modal з NativeWind vibe-chip row, `expo-haptics` (tap/success) через shared адаптер, reduce-motion → `animationType="none"`, wire у `app/(tabs)/_layout.tsx` з first-launch прапорцем, 22 vitest-тести pure-домену + 6 `@testing-library/react-native` тестів (render/toggle/finish/persist). Далі чекають `HubChat`, `HubSearch`, `HubReports`. |
| 3    | 🔵 In progress | [PR #420](https://github.com/Skords-01/Sergeant/pull/420) — CloudSync-інфра + офлайн-черга (`apps/mobile/src/sync/*`), `<CloudSyncProvider>` у `_layout.tsx`, MMKV-персистер для React Query, unit-тести. Перший UI-споживач — `SyncStatusIndicator` — приїхав із Фазою 2 у PR [#441](https://github.com/Skords-01/Sergeant/pull/441); міграційний модальний ще попереду.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4    | 🔵 In progress | **Модуль Фінік.** Shell + nested Stack ✅ [#448](https://github.com/Skords-01/Sergeant/pull/448); storage-keys + backup normalization у `@sergeant/finyk-domain` ✅ [#451](https://github.com/Skords-01/Sergeant/pull/451); PR3 core components (`TxRow`/`TxListItem`/`SwipeToAction`/`ManualExpenseSheet`) ✅ [#453](https://github.com/Skords-01/Sergeant/pull/453) (ребейз і зняття shim-а `finyk-domain.d.ts` — strict-mobile тепер споживає `@sergeant/finyk-domain` напряму); PR4 `Overview`-сторінка + `victory-native` графіки + розширення `finyk-domain` контрактів під strict-mobile ✅ [#460](https://github.com/Skords-01/Sergeant/pull/460); `Assets`-сторінка (accounts / debts / receivables) + `domain/assets/*` у `@sergeant/finyk-domain` ✅ [#467](https://github.com/Skords-01/Sergeant/pull/467); PR6 `Analytics`-сторінка (month nav + summary + MoM comparison + `react-native-svg` donut + top-merchants) — реюз `getMonthlySummary`/`computeCategorySpendIndex`/`selectCategoryDistributionFromIndex`/`getTrendComparison`/`getTopMerchants` з `@sergeant/finyk-domain`, без нових runtime-deps ✅ [#474](https://github.com/Skords-01/Sergeant/pull/474). Task #10 `Transactions`-сторінка (full filter parity, bank-tx hydration, date-range filter, manual-delete, bank-edit sheet) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477); Task #11 `Budgets`-сторінка (monthly plan + limits + goals + subscriptions + `victory-native` trend chart, same-day billing fix) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477); Task #8 (partial) CloudSync-wiring `FINYK_CUSTOM_CATS` + Finyk wiring coverage manifest ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477); Detox E2E infra (iOS + Android rc) + перший Finyk smoke (`finyk-manual-expense.e2e.ts`) ✅ PR [#490](https://github.com/Skords-01/Sergeant/pull/490). **Усі 5 сторінок Фініка портовано.** Android CI workflow + розширення Detox-покриття (Q8): `.github/workflows/detox-android.yml` (ubuntu-latest + `reactivecircus/android-emulator-runner`, Pixel_5_API_34 AVD, pnpm/gradle/AVD кеші), відновлений `.github/workflows/detox-ios.yml`, і 2 нових сьюти (`finyk-transactions.e2e.ts` period filter + `routine-smoke.e2e.ts` add/toggle daily habit) 🟡 PR in-flight. Див. §4 / §5.2 / §6.7 / §9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5    | 🔵 In progress | **Модуль Рутина.** Shell + 3-tab bottom nav (`calendar`/`stats`/`settings`) з MMKV-persist ✅ [#449](https://github.com/Skords-01/Sergeant/pull/449); pure-домен (stats / streaks / heatmap / defaults) у `@sergeant/routine-domain` ✅ [#455](https://github.com/Skords-01/Sergeant/pull/455) + розширення календаря (monthly/yearly) ✅ [#459](https://github.com/Skords-01/Sergeant/pull/459); habits-редактор (список + форма + weekday-picker + ↑/↓ reorder + two-tap delete) з підйомом `validateHabitDraft`/`habitToDraft` у `@sergeant/routine-domain` ✅ [#463](https://github.com/Skords-01/Sergeant/pull/463); heatmap-сторінка (`react-native-svg` 52×7 сітка) + `domain/heatmap/*` у `@sergeant/routine-domain` ✅ [#466](https://github.com/Skords-01/Sergeant/pull/466); `useRoutineReminders` → `expo-notifications` (pure weekday/trigger helpers у `routine-domain/domain/reminders/*`, lazy-permission hook з MMKV-persisted schedule map) ✅ [#472](https://github.com/Skords-01/Sergeant/pull/472); long-press drag-reorder звичок поверх `Gesture.Pan().activateAfterLongPress()` + `Reanimated.LinearTransition`, з haptic-feedback, respect-reduced-motion і збереженими ↑/↓ як accessibility-fallback (`DraggableHabitList`) ✅ [#475](https://github.com/Skords-01/Sergeant/pull/475). CloudSync wiring (`enqueueChange` на всі мутації routine-store + `addOnValueChangedListener` + no-op early returns для незмінних оновлень) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477). **Весь функціонал Рутини портовано.** Далі — stabilization + інтеграційні тести на real device через Expo Dev Client.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6    | 🔵 In progress | **Модуль Фізрук.** Shell + nested Stack + 9 route-скафолдів + `FIZRUK_PAGES` ✅ [#450](https://github.com/Skords-01/Sergeant/pull/450); active-workout timer + `RestTimerOverlay` + `expo-keep-awake` ✅ [#452](https://github.com/Skords-01/Sergeant/pull/452); `BodyAtlas` ✅ [#457](https://github.com/Skords-01/Sergeant/pull/457); PR-D `Progress`-сторінка (victory-native KPIs + weight/body-fat тренди) + `domain/progress/*` у `@sergeant/fizruk-domain` ✅ [#462](https://github.com/Skords-01/Sergeant/pull/462); PR-G `PlanCalendar` (Monday-first сітка 7×6, вибір template через bottom-sheet, «Сьогодні» snap) + `domain/plan/*` у `@sergeant/fizruk-domain` ✅ [#464](https://github.com/Skords-01/Sergeant/pull/464); `Measurements`-сторінка (вага, обхвати, сон/енергія/настрій + mini-line) + `domain/measurements/*` у `@sergeant/fizruk-domain` ✅ [#470](https://github.com/Skords-01/Sergeant/pull/470); `Body`-сторінка (read-only dashboard поверх `useMeasurements` — summary-картки вага/сон/енергія/настрій з 7-day delta + стрілкою напряму, `BodyTrendCard` поверх `TrendChart` для кожної метрики, CTA на Measurements з `hapticTap()`, empty-state) + `domain/body/*` у `@sergeant/fizruk-domain` (pure selectors: `buildBodySummary` / `getMeasurementDeltaWithinDays` / `directionFromDelta`) ✅ [#497](https://github.com/Skords-01/Sergeant/pull/497); PR-F `Programs`-сторінка (каталог built-in programs + `TodaySessionCard` + активація з wiring у `useActiveFizrukWorkout`) + `domain/programs/*` у `@sergeant/fizruk-domain` ✅ [#473](https://github.com/Skords-01/Sergeant/pull/473); PR-E recovery-forecast для `PlanCalendar` (pure `domain/plan/recovery.ts` — `computeRecoveryForecast()` + `describeDayRecovery()` поверх існуючого `computeRecoveryBy`, `RecoveryStatus = fresh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ready | overworked`з per-muscle overworked/recovered списками; UI: heat-dot у клітинці дня з gray/green/red color-coding + bottom-sheet summary + a11y labels uk-UA). PR-H`Workouts`-сторінка (повний порт web: журнал згрупований по датах + каталог вправ з пошуком і фільтром по `primaryGroup`+ active-set editor для weight/reps/RPE) +`domain/workouts/\*`у`@sergeant/fizruk-domain`(pure-helpers — селектори журналу, групування по датах, сума об'єму, валідатори draft-ів, active-set editor mutators; 52 vitest-тести) ✅ [#494](https://github.com/Skords-01/Sergeant/pull/494). Власний Fizruk`Dashboard`(замість PR-A скафолду) — hero-картка (active-workout resume / today-session / empty-nudge), KPI row (streak / weekly volume / 30-day weight Δ), quick-links grid (Workouts · Plan · Programs · Progress · Measurements · Body · Atlas), secondary section (recent workouts + top PRs). Агрегації — pure`@sergeant/fizruk-domain/domain/dashboard/\*` (`computeDashboardKpis`/`getNextPlanSession`/`computeTopPRs`/`listRecentCompletedWorkouts`, 34 vitest), read-only wiring через `useFizrukWorkouts`/`useMeasurements`/`useMonthlyPlan`/`useWorkoutTemplates`/`useActiveFizrukWorkout` ✅[#493](https://github.com/Skords-01/Sergeant/pull/493). PR-I`Exercise`detail-сторінка (повний порт web: title + primary-muscle chips + опис, new-PR banner, PR/next-set cards, victory-native 1RM/volume тренди 12-тижневі + cardio pace/distance, load-calculator Сила/Гіпертрофія/Витривалість, історія сетів 20-рядків) +`domain/workouts/exerciseDetail.ts`у`@sergeant/fizruk-domain`(pure helpers`collectExerciseHistory`/`computeExerciseBest`/`computeExerciseWeeklyTrend`/`computeExerciseCardioTrend`/`buildLoadCalculatorZones`/`suggestExerciseNextSet`; 14 vitest) + 4 RN render-тести + long-press на рядку каталога у `Workouts`→`router.push /fizruk/exercise?id=...`✅PR [#500](https://github.com/Skords-01/Sergeant/pull/500). **WorkoutTemplates UI виключено** (templates-стор уже синкається через CloudSync wiring у [#477](https://github.com/Skords-01/Sergeant/pull/477)). **Фото-прогрес тіла виключений з плану ([#468](https://github.com/Skords-01/Sergeant/pull/468)).**`useRecovery`+`useExerciseCatalog`+`useDailyLog` портовано на mobile (MMKV + cloud-sync); Atlas.tsx і Body.tsx підключені до реальних даних відновлення. |
| 7–11 | ⏸ Not started  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12   | 🔵 In progress | **Monitoring.** Sentry RN init scaffold ✅ [#469](https://github.com/Skords-01/Sergeant/pull/469) — `apps/mobile/src/lib/observability.ts` + wiring у root layout і `ErrorBoundary.componentDidCatch`, gated за `EXPO_PUBLIC_SENTRY_DSN` (no-op якщо DSN не заданий). Далі — реальний DSN, breadcrumbs, performance tracing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 13   | ⏸ Not started  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Рішення по **Q1–Q10** зафіксовані в [PR #402](https://github.com/Skords-01/Sergeant/pull/402) (секція 13 нижче).

### 2.1 Фаза 0 — скафолд `apps/mobile`. **Зроблено.**

Комміт піднімає окремий workspace `apps/mobile`:

- Expo 52 (`"expo": "~52.0.0"`), React Native 0.76, New Architecture
  (`newArchEnabled: true`).
- `expo-router` v4 з file-based navigation:
  - `app/(auth)/{sign-in,sign-up}.tsx` — модальна auth-група.
  - `app/(tabs)/{index,finyk,fizruk,routine,nutrition}.tsx` — основна
    таб-навігація з auth-guard через `useUser()` (redirect на sign-in).
  - `+not-found.tsx` — fallback.
- Інтеграція з Better Auth Expo: `@better-auth/expo`, токен у
  `expo-secure-store`, bearer-заголовок `Authorization: Bearer <token>`.
- Push: `expo-notifications` + `PushRegistrar` компонент, який після
  логіну отримує native APNs/FCM токен і реєструє його через
  `POST /api/v1/push/register` (див. `docs/mobile/overview.md`).
- Monorepo-resolver у `metro.config.js` (watchFolders + nodeModulesPaths +
  `unstable_enablePackageExports`), щоб RN бачив `@sergeant/*` пакети
  напряму з TS-сорсів.
- Динамічний `app.config.ts` (читає `EXPO_PUBLIC_API_BASE_URL`,
  `EAS_PROJECT_ID`). `eas.json` з дефолтним build-profile.
- Провайдери в `app/_layout.tsx`:
  `GestureHandlerRootView → SafeAreaProvider → QueryProvider → ApiClientProvider`. `QueryProvider` дзеркалить `apps/web/src/main.tsx`.
- 4 заглушки модулів (`ModuleStub`) — `finyk`, `fizruk`, `routine`,
  `nutrition`. Hub-екран показує ім'я юзера, sign-out,
  dev-only `usePushTest` для перевірки push-ланцюга.

### 2.2 Backend-передумови. **Зроблено.**

Сервер уже готовий до нативного клієнта (виконано в попередніх сесіях,
без пов'язаних мобільних змін):

- API v1 (`/api/v1/*`) — уніфікований префікс.
- Bearer-auth плагін Better Auth (токен у `set-auth-token` header на
  sign-in, далі йде в `Authorization`), cookies не обов'язкові.
- `POST /api/v1/push/register` з валідацією platform/token
  (`apps/server/src/migrations/006_push_devices.sql`).
- Scheme `sergeant://` і `exp://` / `localhost:8081` у
  `trustedOrigins` Better Auth.
- Daily AI-quota (`apps/server/src/modules/chat/aiQuota.ts`, таблиця `ai_usage_daily`) —
  спільна з web.

### 2.3 Контракти і документи, що вже існують

- `apps/mobile/README.md` — запуск, архітектура, deep links, push,
  **Dev Client on-device build** (PR #408 / #410).
- `docs/mobile/overview.md` / `apps/mobile/docs/mobile.md` — API-контракт для
  мобілки: auth, deep links, push register, troubleshooting.
- `docs/architecture/api-v1.md` — опис `/api/v1/*` ендпоінтів.
- `docs/hub-modules-roadmap.md` — функціональний roadmap по модулях
  (не прив'язаний до RN, але джерело правди, ЩО треба перенести).
- `docs/design/BRANDBOOK.md` — вся візуальна ідентичність; додана секція
  "Native Patterns (iOS / Android)" для мобільних паттернів (PR #409).
- `packages/api-client/` — HTTP-клієнт і React-хуки (`useUser`,
  `usePushRegister`, …), працюють в обох середовищах.
- `packages/shared/`, `packages/finyk-domain/`, `packages/fizruk-domain/`,
  `packages/routine-domain/`, `packages/insights/` — чиста доменна логіка
  без DOM-залежностей (schemas, utils, аналітичні ядра, реюз web+mobile).
  `storageKeys` тепер у `@sergeant/shared` (R1); finyk/fizruk/routine
  домени винесено окремими пакетами (R3 / R4 / Фаза 5 PR 2);
  `@sergeant/insights` тримає pure Hub-search + recommendation rules (R2).
- `packages/design-tokens/` — Tailwind-preset + raw tokens, спільні
  для `apps/web` і `apps/mobile` (R6).

### 2.4 Нові артефакти в `apps/mobile` після Фаз 1–3 (поки що)

- `apps/mobile/tailwind.config.js`, `global.css`, `nativewind-env.d.ts` —
  NativeWind v4 (PR #403), підхоплює `@sergeant/design-tokens` preset.
- `apps/mobile/src/lib/storage.ts` — MMKV-backed адаптер зі shape web-API
  (PR #404). Auth-токен не сюди, а в `expo-secure-store`.
- `apps/mobile/src/components/ui/Button.tsx` — перший UI-примітив,
  еталон для решти (PR #407). Використовує `Pressable` + `className` +
  токени.
- `apps/mobile/src/components/ui/Card.tsx` — наступний порт,
  `Card` + `CardHeader/Title/Description/Content/Footer` (PR
  [#413](https://github.com/Skords-01/Sergeant/pull/413)).
  Сюди ж додано мінімальну jest-expo конфігурацію
  (`jest.config.js`, babel-env override) та перший render-тест.
- `apps/mobile/src/components/ui/Input.tsx` — `Input` + `Textarea`
  (PR [#417](https://github.com/Skords-01/Sergeant/pull/417)).
  Дзеркалить web `InputSize` / `InputVariant` /
  `error` / `success` / `icon` / `suffix` / `type`-aware defaults,
  лягає на RN-сумісні мапи (`keyboardType`, `autoComplete`,
  `autoCapitalize`, `secureTextEntry`).
- `apps/mobile/src/components/ui/Banner.tsx` — `Banner`
  (PR [#419](https://github.com/Skords-01/Sergeant/pull/419)).
  Дзеркалить `BannerVariant` (`info` / `success` / `warning` /
  `danger`), rounded-2xl border + bg токени.
- `apps/mobile/src/components/ui/Toast.tsx` — `ToastProvider` +
  `useToast` + `ToastContainer`
  (PR [#421](https://github.com/Skords-01/Sergeant/pull/421)).
  Порт web-хука 1:1 (API-контракт, черга, дефолтні тривалості),
  візуальний контейнер на RN-примітивах + `Animated`. Без
  `react-native-toast-message` (чужий імперативний API) і без
  Reanimated (overkill для top-slide/fade) — див. PR body.
- `apps/mobile/src/components/ui/Skeleton.tsx` — `Skeleton` +
  `SkeletonText` (PR `<PR-SKELETON>`). Пульс через RN `Animated`
  opacity loop з повагою до `AccessibilityInfo. isReduceMotionEnabled()` (WCAG 2.3.3 parity).
- `apps/mobile/src/core/SyncStatusIndicator.tsx` — Hub-core
  індикатор стану синхронізації (PR
  [#441](https://github.com/Skords-01/Sergeant/pull/441)). Тонкий
  UI-споживач `apps/mobile/src/sync/hook/useSyncStatus`: 4 стани
  (`idle` / `syncing` / `offline` / `error`), `variant="silent-when-idle"`
  колапсить до `null`, pulse-dot через RN `Animated` opacity loop
  з повагою до `AccessibilityInfo.isReduceMotionEnabled()` (парі з
  `Skeleton.tsx`). Помилка — через проп (`error` / `onRetry`),
  бо хук навмисно read-only; консьюмер з `useCloudSync(user)`
  передає `syncError` + `pullAll`. Текст дзеркальний до web
  (`OfflineBanner` / `SyncStatusBadge`). Ще не підключений до
  `_layout.tsx` — це окрема задача з плану.
- `apps/mobile/src/core/settings/*` — перший зріз HubSettings
  (Phase 2 / Hub-core). Містить `HubSettingsPage.tsx` (shell-сторінка
  з заголовком "Налаштування" + вертикальний стек `SettingsGroup`
  карток), `SettingsPrimitives.tsx` (мобільні `SettingsGroup` /
  `ToggleRow` / `SettingsSubGroup` поверх `Pressable` + RN `Switch`,
  без grid-rows анімації web-версії), `RoutineSection.tsx` (дзеркало
  web — `showFizrukInCalendar` / `showFinykSubscriptionsInCalendar`,
  персист через MMKV `useLocalStorage`), `ExperimentalSection.tsx`
  (копія `experimental`-підмножини `FLAG_REGISTRY` з
  `apps/web/src/core/lib/featureFlags.ts`, персист через MMKV) та
  `apps/mobile/src/core/settings/GeneralSection.tsx` — порт web
  `GeneralSection` без reorder-list (PR [#444](https://github.com/Skords-01/Sergeant/pull/444)).
  Темна-тема і `showCoach` персистять у спільний `hub_prefs_v1`
  слот; reorder-list, push/pull у хмару та backup-панель віддані
  плейсхолдерами-картками з поясненнями — reorder-list чекає порт
  `HubDashboard`, push/pull чекає read-only хук над
  `useCloudSync` (щоб не дублювати вже активний `CloudSyncProvider`),
  а backup — реальний mobile-адаптер `downloadJson`
  (expo-file-system + expo-sharing). `NotificationsSection.tsx` —
  порт web `NotificationsSection` (PR [#445](https://github.com/Skords-01/Sergeant/pull/445)).
  Permission-статус і запит через `expo-notifications`
  (`getPermissionsAsync` / `requestPermissionsAsync`), `denied` →
  `Linking.openSettings()` як дія «одного тапу» до системних
  налаштувань застосунку. Routine-reminders toggle персистить
  `routineRemindersEnabled` у спільний `@routine_prefs_v1` MMKV-слот
  (ключ дзеркальний до web `routine.prefs`) — фактичне планування
  через `Notifications.scheduleNotificationAsync` підключиться з
  портом модуля Рутина (Phase 5). Фізрук-нагадування
  (`useMonthlyPlan`) та Харчування (`loadNutritionPrefs`/
  `persistNutritionPrefs`) віддані `DeferredNotice`-картками
  (Phase 6 / Phase 7 відповідно) — дзеркало підхід до
  deferred sub-groups з `GeneralSection`. Без нових залежностей —
  `expo-notifications` уже у залежностях через `PushRegistrar`.
  Решта секцій (`FinykSection`, `FizrukSection`, `AIDigestSection`)
  портовано в PR [#456](https://github.com/Skords-01/Sergeant/pull/456):
  `FinykSection` зеркалить web-інпути для ліміту/готівки/накопичень з
  персистом у `FINYK_CUSTOM_CATS`/`FINYK_MONTHLY_PLAN` (пізніше мігровано
  на `useSyncedStorage` у PR [#478](https://github.com/Skords-01/Sergeant/pull/478)
  — див. `apps/mobile/src/sync/useSyncedStorage.ts`); `FizrukSection`
  піднімає тогли програми/нагадувань; `AIDigestSection` — прапорці AI-дайджесту
  та налаштування періодичності. Усі 6 секцій HubSettings тепер порт-парі з web.
  Маршрут —
  `apps/mobile/app/settings.tsx` (модальний stack-route поза табами,
  `presentation: "modal"` у `_layout.tsx`), щоб не роздувати
  5-табовий tab-bar. Без нових залежностей. Fuzzy-search і `Tabs`
  group-switcher з web-шелу лишаються відкладені — опційний UX,
  не блокує Фазу 2.
- `apps/mobile/src/core/ErrorBoundary.tsx` — top-level ErrorBoundary
  (PR [#434](https://github.com/Skords-01/Sergeant/pull/434)).
  Порт `apps/web/src/core/ErrorBoundary.tsx` 1:1 по class-component
  API (`getDerivedStateFromError` / `componentDidCatch` / `resetError`),
  default-fallback на shared `Card` + `Button` з web-текстом
  (`"Щось пішло не так"` / `"Перезавантажити"`). Reset-кнопка також
  викликає `router.replace('/')` з expo-router для повернення у хаб.
  Sentry-forwarding відкладено до Phase 10+ (`console.error` + TODO
  comment про `@sentry/react-native`).
- `apps/mobile/src/core/ModuleErrorBoundary.tsx` — per-module
  boundary (PR [#434](https://github.com/Skords-01/Sergeant/pull/434)).
  Порт `apps/web/src/core/ModuleErrorBoundary.tsx` з тим самим
  `retryRev`-як-React-`key` паттерном, shared `Card` + `Button`
  у fallback, опційний `moduleName` prop для контекстуалізації
  headline (`"Модуль {name} не вдалося завантажити"`). Retry
  примусово ремонтує піддерево через зміну `retryRev`-ключа;
  `onBackToHub` делегується parent-у, як на web.
- `apps/mobile/src/components/ui/ConfirmDialog.tsx` — `ConfirmDialog`
  (PR [#427](https://github.com/Skords-01/Sergeant/pull/427)). Bottom-sheet-style підтвердження на
  RN `Modal` (transparent, `animationType="fade"`) + scrim `Pressable`
  для dismiss + `Button` primary/destructive + ghost cancel. Android
  hardware back через `Modal.onRequestClose`; `accessibilityRole= "alertdialog"` + `accessibilityViewIsModal`;
  `AccessibilityInfo.isReduceMotionEnabled()` перемикає анімацію
  на `"none"`. Без `@gorhom/bottom-sheet` та `react-native-modal`.
- `apps/mobile/src/components/ui/Sheet.tsx` — `Sheet` bottom-sheet
  shell (PR [#426](https://github.com/Skords-01/Sergeant/pull/426)). Обгортка навколо RN-вбудованого `Modal`
  (`transparent` + `animationType="slide"`) + `SafeAreaView` +
  `KeyboardAvoidingView`, shared `Button` (44×44 `iconOnly` `ghost`)
  як `close`. Dismiss через scrim-press / Android hardware-back
  (`Modal.onRequestClose`). `role="dialog"` +
  `accessibilityViewIsModal` + `accessibilityLabel` з `title`.
  Respects `AccessibilityInfo.isReduceMotionEnabled()` —
  `animationType="none"` з увімкненим Reduce Motion. Без
  `@gorhom/bottom-sheet` / `react-native-modal` / Reanimated.
- `apps/mobile/eas.json` з профайлами `development` / `preview` /
  `production` + `.easignore` (PR #408).
- `apps/mobile/src/core/dashboard/{TodayFocusCard,FirstActionHeroCard,SoftAuthPromptCard,useDashboardFocus}.tsx`
  - `packages/shared/src/lib/{vibePicks,firstRealEntry,recommendations,dashboardFocus,kvStore}.ts`
    — `HubDashboard` PR-2 (Phase 2 / Hub-core, PR [#483](https://github.com/Skords-01/Sergeant/pull/483)).
    Hero-шар над `StatusRow` із one-hero правилом
    (`firstActionVisible` > `showSoftAuth` > `TodayFocusCard`).
    Pure-домен у `@sergeant/shared` (DOM-free, injected `KVStore`
    abstraction): `vibePicks` (readVibePicks / saveVibePicks /
    isFirstActionPending / markFirstActionDone / clearFirstActionPending /
    isSoftAuthDismissed / dismissSoftAuth / recordSessionDay /
    getSessionDays), `firstRealEntry` (detectFirstRealEntry, checkAllStreams,
    markFirstRealEntry), `recommendations` (generateRecommendations з
    pure inputs), `dashboardFocus` (loadDismissed / saveDismissed /
    filterVisible / selectFocusAndRest), `kvStore` (createMemoryKVStore
  - createLocalStorageKVStore helpers). Web call-sites не змінювалися —
    `apps/web/src/core/onboarding/{vibePicks,firstRealEntry}.ts`
    переписані у тонкі адаптери поверх shared (localStorage-backed KVStore).
    Mobile картки: `TodayFocusCard` — port web-а з native Pressable /
    View / Text + NativeWind, empty-state з 3 quick-add чипами (finyk
    brand, fizruk teal, routine coral; nutrition схований до Phase 7);
    `FirstActionHeroCard` — inline-hero варіант (без web-modal), picks-
    priority `routine > finyk > fizruk`, alternates expanded on
    «Інший модуль»; `SoftAuthPromptCard` — inline cloud-sync prompt після
    першого реального entry, з MMKV-dismissal. `useDashboardFocus.ts` —
    обгортка над shared helpers через MMKV (`@/lib/storage`). CTA-buttons
    вживають `expo-haptics` (tap). Аналітика `trackEvent` — замокана
    (opt-in callbacks `onShown` / `onPicked` / `onAuthOpened` /
    `onDismissed`, щоб caller міг під'єднати Sentry/PostHog). `onShowAuth`
    у `HubDashboard.tsx` навігує до `(auth)/sign-in` modal через
    `router.push` (Better Auth Expo-клієнт + `expo-secure-store`). Тести: 64 vitest-кейси для shared
    (>=80% branch); 22 jest-expo кейси на картки + one-hero rule в
    `HubDashboard.test.tsx`. Продовження серії (приземлилося окремо у
    PR-3 ✅ PR [#482](https://github.com/Skords-01/Sergeant/pull/482)):
    quick-stats preview у `StatusRow` (`*_quick_stats` MMKV readers),
    `HubInsightsPanel` (collapsible панель із Coach-рекомендаціями) і
    `WeeklyDigestFooter`. `rest`-рекомендації з `useDashboardFocus`
    тепер фідять `HubInsightsPanel` (спільна dismiss-мапа
    `hub_recs_dismissed_v1`), тож one-hero правило та secondary-панель
    працюють від одного джерела recs.
- `apps/mobile/src/core/dashboard/{HubDashboard,DraggableDashboard,StatusRow,useDashboardOrder,dashboardModuleConfig}.tsx`
  - `packages/shared/src/lib/dashboard.ts`
    — `HubDashboard` PR-1 (Phase 2 / Hub-core, PR [#480](https://github.com/Skords-01/Sergeant/pull/480)).
    Заміна `(tabs)/index.tsx`-скафолду на функціональний hub-екран:
    greeting-блок + 3 `StatusRow` (finyk / fizruk / routine, nutrition
    свідомо схований до Phase 7) + settings-кнопка у правий кут.
    `StatusRow.tsx` — чистий рядок з іконкою, лейблом, описом, accent-
    bar і chevron; memo-izovanii, щоб MMKV-writes не ребендерили всі 3.
    `DraggableDashboard.tsx` — core drag-reorder: long-press (300ms) →
    Reanimated `Gesture.Pan` + `useSharedValue` для translate, row-height
    half-threshold евристика у `computeDropIndex()`, `expo-haptics` на
    старті/ендi/flip, повага до `AccessibilityInfo.isReduceMotionEnabled()`
    (перемикає в instant-drop). A11y-fallback — `↑/↓` кнопки у
    `GeneralSection.ModuleReorderList` (окремий розділ у Settings).
    `HubDashboard.tsx` — container, що кличе `useDashboardOrder()` і
    мапить `visibleOrder` на `StatusRow`; tap → deep-link через
    `router.push("/(tabs)/finyk")` тощо. `useDashboardOrder.ts` —
    обгортка над `useSyncedStorage` (з PR #478), ключ
    `STORAGE_KEYS.DASHBOARD_ORDER` (`"hub_dashboard_order_v1"`) дзеркалить
    web — CloudSync уже ловить зміни без ручного wiring.
    `dashboardModuleConfig.ts` — конфіг для кожного модуля (icon, label,
    description, route, accent-color).
    Pure-домен `packages/shared/src/lib/dashboard.ts` — DOM-free helpers
    (`loadDashboardOrder`, `saveDashboardOrder`, `validateDashboardOrder`,
    `DEFAULT_DASHBOARD_ORDER`, `reorderWithHidden`, `selectVisibleModules`)
    реюзяться web і mobile. `reorderWithHidden` — ключовий helper: зберігає
    слот nutrition (повний `fullOrder` має 4 id-и), а UI рендерить тільки
    видимі 3. Покрито 18 vitest-тестами
    (`dashboard.test.ts`): edge-cases валідатора (corrupted JSON, missing
    modules, unknown ids, duplicates), reorder-with-hidden слот-
    preservation, `selectVisibleModules`. Web `HubDashboard.tsx`
    переіменовано з локальних helpers на shared — жоден раст-site на
    web не змінюється, але web тепер використовує ті ж pure-функції,
    що й mobile. Sign-out і DEV push-кнопку перенесено з
    `(tabs)/index.tsx` у новий `apps/mobile/src/core/settings/AccountSection.tsx`
    (окрема картка у HubSettings, очищає Better Auth session +
    React Query cache). Escape-hatch для CI — `packageManager: pnpm@9.15.1`
    відновлено у root `package.json` (пре-існуюча регресія з `e13c9ce`,
    через яку `pnpm/action-setup` падав). `pnpm-lock.yaml` додано у
    `.prettierignore`. Без нових runtime-deps поверх уже наявних
    `react-native-gesture-handler` + `react-native-reanimated` +
    `expo-haptics`. Продовження серії (приземлилося окремо):
    `TodayFocusCard` / `FirstActionHeroCard` / `SoftAuthPromptCard` —
    hero-шар, PR-2 ✅ PR [#483](https://github.com/Skords-01/Sergeant/pull/483);
    quick-stats preview у `StatusRow` (`*_quick_stats` MMKV readers),
    `HubInsightsPanel` (collapsible панель із Coach-рекомендаціями) і
    `WeeklyDigestFooter` — PR-3 ✅ PR [#482](https://github.com/Skords-01/Sergeant/pull/482).
    Трьома PR-ами серія `HubDashboard` на mobile закрита; `OnboardingWizard`
    приземлився у PR [#492](https://github.com/Skords-01/Sergeant/pull/492)
    (shared `@sergeant/shared/lib/onboarding` з injected-`KVStore`, thin
    web-адаптер `apps/web/src/core/onboarding/onboardingGate.ts`, mobile
    splash-Modal + wire у `app/(tabs)/_layout.tsx` через first-launch
    прапорець). Далі по Hub-core Phase 2 йдуть `HubChat`, `HubSearch`,
    `HubReports`.
- `packages/finyk-domain/src/storageKeys.ts` і
  `packages/finyk-domain/src/backup.ts` — PR2 Фази 4 (pure domain
  extract). `FINYK_STORAGE_KEYS`, `FINYK_MANUAL_ONLY_KEY` та мапа
  `FINYK_BACKUP_STORAGE_KEYS` переїхали з
  `apps/web/src/modules/finyk/lib/*` у DOM-free пакет, щоб і
  mobile-адаптер (MMKV), і web (localStorage) брали одні й ті самі
  рядки. Paired із `FINYK_BACKUP_VERSION`, `DEFAULT_FINYK_MONTHLY_PLAN`,
  `FinykBackup` типом та чистими `normalizeFinykBackup` /
  `normalizeFinykSyncPayload` — усі тестуються `vitest`-ом у
  `backup.test.ts` (23 нові тест-кейси на шляхи невалідного версіонінгу,
  компактні/повні payload-и, malformed rows). Web-файли
  `lib/finykStorage.ts`, `lib/finykBackup.ts`, `lib/demoData.ts`
  тонко реекспортять ці символи під історичними іменами — жоден
  call-site в `apps/web` не змінюється. Нові entry-points у
  `package.json` exports: `@sergeant/finyk-domain/storage-keys` +
  `@sergeant/finyk-domain/backup`.
- `apps/mobile/app/(tabs)/finyk/` + `apps/mobile/src/modules/finyk/` —
  перший зріз Фази 4, PR1 (shell + stack-роутинг). `finyk.tsx`-стаб
  замінено на директорію-роут з `_layout.tsx` (native `Stack`
  обгорнутий у `ModuleErrorBoundary` з `moduleName="Фінік"` і
  `onBackToHub → router.replace('/')`) + 5 screen-файлів:
  `index.tsx` (Overview, `headerShown: false`), `transactions.tsx`,
  `budgets.tsx`, `analytics.tsx`, `assets.tsx` — кожен із нативним
  header-titles з `@/theme`. Оверлі Overview — `src/modules/finyk/FinykApp.tsx`
  (хірогард + 2×2 nav-grid `FinykNavGrid` з `router.push` на
  drill-down-и); решта 4 скрини — `FinykPageStub` з plan-фічами
  наступних PR-ів. `FINYK_PAGES` (DOM-free реєстр з `id`/`label`/
  `description`/`emoji`/`href`) централізує мапу сторінок для
  майбутнього nav-UI та тестів. Jest smoke-test на `FinykApp.test.tsx`
  покриває hero + 4 drill-down cards. Без нових залежностей.
- `apps/mobile/src/modules/routine/` — перший зріз модуля Рутина
  (Phase 5 / PR 1 — shell + routing). Містить `RoutineApp.tsx`
  (root-компонент, обгорнутий у `ModuleErrorBoundary`
  `moduleName="Рутина"`, з `router.replace("/")` як `onBackToHub`),
  `components/RoutineBottomNav.tsx` (3-tab segmented switcher —
  `calendar` / `stats` / `settings`, дзеркало
  `apps/web/src/modules/routine/components/RoutineBottomNav.tsx`,
  без shared `ModuleBottomNav`-примітиву, з emoji-іконками доки
  react-native-svg не зайде у Phase 5 PR 5) та
  `components/RoutineTabPlaceholder.tsx` (стоковий "Скоро —
  буде портовано" `Card` для трьох sub-табів). Активний таб
  персистить у спільний `STORAGE_KEYS.ROUTINE_MAIN_TAB` MMKV-слот
  як raw-string (web-парі до `localStorage.getItem/setItem`
  без JSON-обгортки) через `safeReadStringLS` / `safeWriteLS`;
  `useLocalStorage`-хук не використовується, бо його JSON-round-trip
  асиметричний для плоских рядків (`JSON.parse("stats")` кидає).
  Маршрут — `apps/mobile/app/(tabs)/routine.tsx` рендерить
  `<RoutineApp />` замість `ModuleStub` (auth-guard уже в
  `(tabs)/_layout.tsx` через `useUser` + `<Redirect>`). Jest-тести
  покривають default-таб, перемикання між трьома табами, запис
  у MMKV, підхоплення persisted-таба, та fallback на `calendar`
  при malformed-значенні. Без нових залежностей. `jest.setup.js`
  отримав мок `expo-router` (імперативний `router` + `useRouter` +
  `Link` + `Redirect` + `Stack/Tabs`) бо `@react-navigation/native`
  ESM-entry не трансформується дефолтним `jest-expo` transform-list.
  Наповнення трьох sub-табів — Phase 5 PR 2–7.
- `apps/mobile/src/sync/` — CloudSync + offline-черга (Фаза 3). Дзеркало
  `apps/web/src/core/cloudSync/*` з RN-специфічними адаптерами: MMKV
  замість `localStorage`, `@react-native-community/netinfo` замість
  `navigator.onLine`, без window-event-bus (власний pub-sub у
  `events.ts`). Вхідна точка — `<CloudSyncProvider>` у
  `app/_layout.tsx` після `QueryProvider`. React Query теплий-старт
  через `PersistQueryClientProvider` + MMKV-персистер. Unit-тести
  (`jest` + `ts-jest`) покривають enqueue / dedup / replay-after-online
  / serialization-roundtrip. Ключі префіксуються `mobile:` у
  `@sergeant/shared/storageKeys` (див. 6.1).
- `apps/mobile/app/(tabs)/fizruk/*` + `apps/mobile/src/modules/fizruk/*`
  — shell-каркас модуля Фізрук (Phase 6 · PR-A, `devin/…-fizruk-shell-stack`).
  Tab `fizruk` переведено з одно-файлового `fizruk.tsx` у вкладений
  Expo Router `Stack` (`app/(tabs)/fizruk/_layout.tsx` + 9 route-файлів:
  `index`, `workouts`, `exercise`, `programs`, `progress`, `measurements`,
  `body`, `atlas`, `plan`). Tab-header вимкнено, кожен screen малює власний
  заголовок усередині сторінки. Route-каталог винесено у
  `src/modules/fizruk/shell/fizrukRoute.ts` (масив `FIZRUK_PAGES`,
  `fizrukRouteFor` — 1:1 імена web-версії); nav-каталог — у
  `shell/fizrukNav.ts`. Страницi-компоненти у `src/modules/fizruk/pages/*`:
  `Dashboard` — перший функціональний екран (дата, «Швидкий старт» CTA
  на `/fizruk/workouts`, сітка нав-карток на всі 8 не-dashboard
  сторінок через `router.push(fizrukRouteFor(page))`), решта вісім —
  `PagePlaceholder`-cards з списком запланованого скоупу і посиланням
  на наступний PR серії. Додано `@sergeant/fizruk-domain` у
  `apps/mobile/package.json` для наступних PR-ів, який тягнутиме
  `constants` / `domain` / `lib` без DOM. Render-тести:
  `Dashboard.test.tsx` (coverage-guard на `NAV_CARDS` + CTA-routing)
  та `fizrukRoute.test.ts` (парітет `FIZRUK_PAGES` + `fizrukRouteFor`
  сегменти). Функціональні сторінки (BodyAtlas, графіки,
  active-workout таймер, PlanCalendar, Programs, Measurements) —
  у наступних PR-ах Фази 6 (PR-B…PR-G).
- `apps/mobile/src/modules/fizruk/hooks/useActiveFizrukWorkout.ts` +
  `apps/mobile/src/modules/fizruk/components/RestTimerOverlay.tsx` —
  active-workout таймер + floating rest-timer (Phase 6 · PR-B,
  `devin/…-fizruk-active-workout-timer`). Хук об'єднує три
  незалежні куски стану: (a) `activeWorkoutId` (MMKV-персист через
  `STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT` зі `@sergeant/shared`, щоб
  CloudSync уже підхопив ключ), (b) `useElapsedSeconds(startedAt)` —
  1 Hz tick, що **похідний від `Date.now()`**, не дрифтить при
  стоп-JS стартах, і (c) `useRestTimer` — countdown, що теж
  re-derives `remaining` з wall-clock `endAt`. `expo-keep-awake`
  активний лише поки є `activeWorkoutId` (lazy-require у
  try/catch + `KeepAwakeAdapter`-seam для jest-інʼєкції). Оверлей
  — bottom-sheet над таб-баром, `role="timer"` +
  `accessibilityLiveRegion="polite"`, анімація прогрес-бару
  через `Animated.timing` з повагою до
  `AccessibilityInfo.isReduceMotionEnabled()` (парі зі
  `Skeleton.tsx` / `SyncStatusIndicator.tsx`). `Workouts`-сторінка
  тимчасово отримала demo-панель (start/finish + швидкі кнопки
  `compound` / `isolation` / `cardio` з `REST_DEFAULTS` у
  `@sergeant/fizruk-domain/lib/restSettings`), щоб хук був
  перевірюваний рукою з реального табу до повного порту
  каталогу вправ у PR-F. Unit-тести —
  `src/modules/fizruk/__tests__/useActiveFizrukWorkout.test.ts`
  (drift-resistance обох таймерів під 30 с та 45 с JS-стальтів,
  `justFinishedNaturally` single-flip, MMKV round-trip,
  keep-awake activate/deactivate через injected adapter; fake
  timers + `jest.advanceTimersByTime`). Круговий SVG
  прогрес-ring свідомо **відкладено** до PR-C (BodyAtlas), який
  зафіксує вибір SVG-стеку — тут лінійна шкала дає ту саму
  ергономіку без зайвих залежностей. Circular SVG + інтеграція
  у повний active-workout UX (активний сет, rest-on-complete,
  template-driven суггестії) прийдуть з PR-F.

### 2.5 Аудит міграційного плану (прохід по `apps/web/src`)

Пройдено по всьому `apps/web/src` у пошуку web-специфіки, яку
план не міг помітити. Повний аудит-матриця — секція 7.
Підсумково знайдено **9 нових пунктів**, які додано у план:

- **Секція 7** розширена рядками про `navigator.vibrate`,
  `@dnd-kit/`\*, `react-virtuoso`, `react-markdown`, Blob-експорти,
  `<input type="file">`, `FileReader`, `window.visualViewport`,
  `useDialogFocusTrap`, `document.visibilityState`, `useDarkMode`,
  `useSWUpdate` / `useIosInstallBanner`.
- **Секція 11** — додано **R7** (haptics-адаптер), **R8**
  (export/backup-адаптер), **R9** (visual-keyboard hook-платформний).
- **Секція 10** — доповнено конкретними iOS usage-descriptions
  та Android runtime-permissions.
- **Секція 12 (Ризики)** — додано нотатку про Hermes/`Intl.`\*
  та OTA-стратегію `expo-updates`.

## 3. Цільова архітектура

```
sergeant/
├── apps/
│   ├── web/         ← PWA (Vite, React, Tailwind, Workbox)      [поточний клієнт]
│   ├── mobile/      ← Expo / React Native / Expo Router          [цільовий клієнт]
│   └── server/      ← Express, Better Auth, Postgres, Anthropic  [спільний]
└── packages/
    ├── api-client/      ← HTTP + React Query хуки (web + mobile)
    ├── shared/          ← domain types, schemas (Zod), pure utils, storageKeys,
    │                      haptic/fileDownload/fileImport/visualKeyboardInset контракти,
    │                      HubDashboard + onboarding pure-домен
    ├── finyk-domain/    ← чиста доменна логіка фінансів (R3)
    ├── fizruk-domain/   ← чиста доменна логіка Фізрука (R4 + Phase 6 domains)
    ├── routine-domain/  ← чиста доменна логіка Рутини (Phase 5 PR 2)
    ├── insights/        ← Hub-search scorер + recommendation rules (R2)
    ├── design-tokens/   ← Tailwind preset + raw tokens (web + mobile) (R6)
    └── config/          ← ESLint, TS, Prettier базові конфіги
```

Ключові принципи:

1. **Без зламу контрактів `@sergeant/*`.** Якщо мобільна імплементація
   потребує іншої API-форми (наприклад, інший шейп storage), розширюємо
   пакет абстракцією/стратегією, а не робимо mobile-only форк.
2. **Нуль DOM-залежностей у спільних пакетах.** Якщо зустрічаємо
   `window.*` / `localStorage` / `document` у `packages/*` — це баг
   для мобілки, закриваємо окремим PR. Наразі перевірено:
   `packages/shared/src/{utils,lib,hooks}`, `packages/finyk-domain/src/*`,
   `packages/fizruk-domain/src/*`, `packages/routine-domain/src/*` та
   `packages/insights/src/*` чисті (всі DOM-залежні шіми живуть у
   `apps/web` і реєструють адаптери на shared-контракти — haptic/R7,
   fileDownload/R8, visualKeyboardInset/R9, KVStore для HubDashboard
   hero-шару); `packages/api-client` залежить лише від `fetch` (є в RN).
3. **Дві точки входу — один бекенд.** Увесь state-синк через
   `/api/v1/*`; локальна персистенція — опційний кеш, не source of
   truth (див. секцію 6 про sync-модель).

## 4. Фазований план

Кожна фаза — окремий PR (або серія малих PR-ів), зелене CI, нуль
регресій на web. Порядок може перетасовуватись по ходу, але залежності
позначені.

| #   | Фаза                                                        | Статус         | Залежить від                 | Опис                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------- | -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Скафолд `apps/mobile`                                       | ✅ Done        | —                            | Expo + Expo Router + Better Auth + metro monorepo (секція 2.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1   | Спільна UI-основа для RN (+ NativeWind + MMKV + Dev Client) | ✅ Done        | 0                            | NativeWind (Q5) ✅ #403, MMKV-сховище (Q3) ✅ #404, `@sergeant/design-tokens` (R6) ✅ #406, Expo Dev Client через EAS (Q4) ✅ #408/#410, `Button` ✅ #407, `Card` ✅ #413 (+ jest-expo setup), `Input` ✅ #417, `Banner` ✅ #419, `Toast` ✅ #421, `Skeleton` ✅ #423, `Sheet` ✅ #426, `ConfirmDialog` ✅ #427.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | Hub-ядро                                                    | 🔵 In progress | 1                            | BRANDBOOK native-patterns (Q9) ✅ #409. `ErrorBoundary` + `ModuleErrorBoundary` ✅ PR [#434](https://github.com/Skords-01/Sergeant/pull/434). `SyncStatusIndicator` ✅ PR [#441](https://github.com/Skords-01/Sergeant/pull/441). HubSettings: shell + `RoutineSection` + `ExperimentalSection` ✅ PR [#443](https://github.com/Skords-01/Sergeant/pull/443); `GeneralSection` ✅ PR [#444](https://github.com/Skords-01/Sergeant/pull/444); `NotificationsSection` ✅ PR [#445](https://github.com/Skords-01/Sergeant/pull/445); `FinykSection` + `FizrukSection` + `AIDigestSection` ✅ PR [#456](https://github.com/Skords-01/Sergeant/pull/456) — усі 6 секцій HubSettings портовані. `HubDashboard` PR-1 ✅ PR [#480](https://github.com/Skords-01/Sergeant/pull/480) — status-row + drag-reorder + shared `@sergeant/shared/dashboard` домен (pure helpers: `loadDashboardOrder` / `saveDashboardOrder` / `validateDashboardOrder` / `reorderWithHidden` / `selectVisibleModules` + 18 vitest-тестів); Reanimated drag + haptics + `↑/↓` a11y-fallback у `GeneralSection.ModuleReorderList`; `DASHBOARD_ORDER` персистить через `useSyncedStorage`; `AccountSection` забрав sign-out + DEV push-тест з `(tabs)/index.tsx`; nutrition рядок схований до Phase 7. `HubDashboard` PR-2 (hero-шар — `TodayFocusCard` + `useDashboardFocus` + `FirstActionHeroCard` + `SoftAuthPromptCard`) ✅ PR [#483](https://github.com/Skords-01/Sergeant/pull/483) — shared pure-домен (`vibePicks` / `firstRealEntry` / `recommendations` / `dashboardFocus` / `kvStore` з injected-storage абстракцією) + web thin-адаптери + mobile hero-картки з NativeWind + `expo-haptics`; `rest`-рекомендації з `useDashboardFocus` тепер фідять `HubInsightsPanel` (спільна dismiss-мапа `hub_recs_dismissed_v1`); `onShowAuth` навігує до `(auth)/sign-in` modal. `HubDashboard` PR-3 (quick-stats preview + `HubInsightsPanel` + `WeeklyDigestFooter`) ✅ PR [#482](https://github.com/Skords-01/Sergeant/pull/482) — shared `quickStats` / `weeklyDigest` helpers + mobile preview-слот у `StatusRow`, animated-height collapsible insights panel, fresh-dot weekly-digest footer. `OnboardingWizard` ✅ PR [#492](https://github.com/Skords-01/Sergeant/pull/492) — shared `@sergeant/shared/lib/onboarding` (key constants, `shouldShowOnboarding` / `markOnboardingDone` / `hasExistingData` / `buildFinalPicks` + `ONBOARDING_VIBE_ICONS`/`_TEASERS`/`_CHIP_ORDER` з injected-`KVStore`, 22 vitest-тести) + thin web-адаптер `apps/web/src/core/onboarding/onboardingGate.ts` (API 1:1) + mobile splash-Modal (NativeWind vibe-chip row, `expo-haptics` tap/success, reduce-motion → `animationType="none"`, `useLocalStorage`-подібний `KVStore`-адаптер без прямого MMKV) + wire в `app/(tabs)/_layout.tsx` через first-launch прапорець + 6 `@testing-library/react-native` тестів. Далі: HubChat / HubSearch / HubReports.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | CloudSync + офлайн-черга                                    | 🔵 In progress | 1                            | Нативний аналог `core/cloudSync/useCloudSync.ts`: MMKV + NetInfo + React Query persist; LWW-резолвер незмінний (живе в server). Інфра готова — PR [#420](https://github.com/Skords-01/Sergeant/pull/420) (engine + queue + `<CloudSyncProvider>` + unit-тести) + PR [#429](https://github.com/Skords-01/Sergeant/pull/429) (refcount в `startOnlineTracker` + `clearSyncManagedData` на зміну user-id). Перший UI-споживач — `SyncStatusIndicator` — у Фазі 2 PR [#441](https://github.com/Skords-01/Sergeant/pull/441). `SyncStatusOverlay` винесено окремо + провайдер-wiring тести ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477). `useSyncedStorage` (авто-wiring MMKV → cloud-sync, `enqueueChange` + `addOnValueChangedListener` без ручного коду у споживачах) + ESLint-правило `sergeant-design/no-raw-tracked-storage` (Task #19) ✅ PR [#478](https://github.com/Skords-01/Sergeant/pull/478). Task #13 (first-login data migration modal) — **скасовано** (вирішили покладатись на прозорий pull-all при логіні).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | Порт модуля Фінік + перші Detox E2E                         | 🔵 In progress | 1, 3                         | `FinykApp.tsx` (792 LOC), всі сторінки (`Overview`, `Transactions`, `Budgets`, `Analytics`, `Assets`) і компоненти. Monobank API — без змін. Паралельно — Detox setup + перший E2E-сьют (Q8). Прогрес: PR 1 shell + nested Stack ✅ [#448](https://github.com/Skords-01/Sergeant/pull/448); PR 2 extract storage-keys + backup normalization у `@sergeant/finyk-domain` ✅ [#451](https://github.com/Skords-01/Sergeant/pull/451); PR 3 core components (`TxRow`/`TxListItem`/`SwipeToAction`/`ManualExpenseSheet`) ✅ [#453](https://github.com/Skords-01/Sergeant/pull/453) (рибейз + зняття shim-а `finyk-domain.d.ts`); PR 4 `Overview`-сторінка + `victory-native` графіки + розширення `finyk-domain` контрактів під strict-mobile ✅ [#460](https://github.com/Skords-01/Sergeant/pull/460) (див. §6.7); PR 5 `Assets`-сторінка + `domain/assets/*` у `@sergeant/finyk-domain` ✅ [#467](https://github.com/Skords-01/Sergeant/pull/467); PR 6 `Analytics`-сторінка (month nav + summary + MoM comparison + `react-native-svg` donut + top-merchants, реюз `getMonthlySummary`/`computeCategorySpendIndex`/`selectCategoryDistributionFromIndex`/`getTrendComparison`/`getTopMerchants`) ✅ [#474](https://github.com/Skords-01/Sergeant/pull/474); Task #10 `Transactions`-сторінка (full filter parity, bank-tx hydration, date-range filter, manual-delete, bank-edit sheet) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477); Task #11 `Budgets`-сторінка (monthly plan + limits + goals + subscriptions + `victory-native` trend chart, same-day billing fix) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477); Task #8 (partial) — CloudSync-wiring `FINYK_CUSTOM_CATS` + Finyk wiring coverage manifest ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477). **Усі 5 сторінок Фініка портовано.** Detox infra ✅ — `.detoxrc.js` (iOS sim + Android emu), `apps/mobile/e2e/*` (jest-circus runner, `environment.js`, `setup.ts`, `helpers.ts`, `README.md`), перший сьют `finyk-manual-expense.e2e.ts` (Фінік-tab → Overview → Transactions → ManualExpenseSheet → асерт `finyk-tx-row-*`), dev-only `EXPO_PUBLIC_E2E=1` auth-bypass у `app/(tabs)/_layout.tsx`, `@config-plugins/detox` умовно в `app.config.ts`, iOS CI у `.github/workflows/detox-ios.yml` (macos-14, `expo prebuild` → `pod install` → `pnpm e2e:build:ios` / `pnpm e2e:test:ios`). Android CI — follow-up (інфра готова).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | Порт модуля Рутина                                          | 🔵 In progress | 1, 3                         | `RoutineApp.tsx` (728 LOC): календар, звички, heatmap, reminders. Reminders → `expo-notifications` scheduled. Прогрес: PR 1 shell + 3-tab bottom nav (`calendar`/`stats`/`settings`) з MMKV-persist ✅ [#449](https://github.com/Skords-01/Sergeant/pull/449); pure-домен (stats / streaks / heatmap / defaults) у `@sergeant/routine-domain` ✅ [#455](https://github.com/Skords-01/Sergeant/pull/455) + monthly/yearly календар ✅ [#459](https://github.com/Skords-01/Sergeant/pull/459); habits-редактор (список + форма + weekday-picker + ↑/↓ reorder + two-tap delete, `validateHabitDraft`/`habitToDraft` у `@sergeant/routine-domain`) ✅ [#463](https://github.com/Skords-01/Sergeant/pull/463); heatmap-сторінка (`react-native-svg` 52×7) + `domain/heatmap/*` ✅ [#466](https://github.com/Skords-01/Sergeant/pull/466); `useRoutineReminders` → `expo-notifications` (pure weekday/trigger helpers у `routine-domain/domain/reminders/*`, lazy-permission hook з MMKV-persisted schedule map) ✅ [#472](https://github.com/Skords-01/Sergeant/pull/472); long-press drag-reorder звичок (gesture-handler + Reanimated, ↑/↓ як a11y-fallback) ✅ [#475](https://github.com/Skords-01/Sergeant/pull/475); CloudSync wiring (`enqueueChange` на всі мутації routine-store + no-op early returns, щоб не пушити sync при незмінних оновленнях) ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477). **Весь функціонал Рутини портовано.** Далі — stabilization + інтеграційні тести на real device через Expo Dev Client.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Порт модуля Фізрук                                          | 🔵 In progress | 1, 3                         | `FizrukApp.tsx` + сторінки. `BodyAtlas` (`body-highlighter`) — див. секцію 7.8. Прогрес: PR-A shell + nested Stack + 9 route-скафолдів + `FIZRUK_PAGES` / `fizrukRouteFor` ✅ [#450](https://github.com/Skords-01/Sergeant/pull/450); PR-B active-workout timer (`useActiveFizrukWorkout`) + `RestTimerOverlay` + `expo-keep-awake` ✅ [#452](https://github.com/Skords-01/Sergeant/pull/452); PR-C `BodyAtlas` (`react-native-svg`) ✅ [#457](https://github.com/Skords-01/Sergeant/pull/457); PR-D `Progress`-сторінка (victory-native KPIs + weight/body-fat тренди) + `domain/progress/*` у `@sergeant/fizruk-domain` ✅ [#462](https://github.com/Skords-01/Sergeant/pull/462); PR-G `PlanCalendar` (Monday-first сітка 7×6 + template bottom-sheet + «Сьогодні» snap) + `domain/plan/*` ✅ [#464](https://github.com/Skords-01/Sergeant/pull/464); `Measurements`-сторінка (вага, обхвати, wellbeing) + `domain/measurements/*` ✅ [#470](https://github.com/Skords-01/Sergeant/pull/470); `Body`-сторінка (read-only dashboard — summary-картки з 7-day delta + trend cards + CTA на Measurements) + `domain/body/*` у `@sergeant/fizruk-domain` ✅ [#497](https://github.com/Skords-01/Sergeant/pull/497); PR-F `Programs`-сторінка (каталог built-in programs + `TodaySessionCard` + активація з wiring у `useActiveFizrukWorkout`) + `domain/programs/*` у `@sergeant/fizruk-domain` ✅ [#473](https://github.com/Skords-01/Sergeant/pull/473); Task #7 — CloudSync wiring для 5 mobile-сторів (workouts, custom exercises, workout templates, plan template, wellbeing) через `enqueueChange` + `addOnValueChangedListener` + `stateRef`-паттерн проти stale-closure; `useMeasurements` мігровано на `useSyncedStorage` ✅ PR [#477](https://github.com/Skords-01/Sergeant/pull/477) + PR [#478](https://github.com/Skords-01/Sergeant/pull/478); PR-E recovery-forecast для `PlanCalendar` — pure `domain/plan/recovery.ts` (`computeRecoveryForecast` + `describeDayRecovery` поверх `computeRecoveryBy`) + heat-dot у клітинці дня (gray/green/red) + bottom-sheet summary + a11y labels uk-UA. PR-H `Workouts`-сторінка (повний порт web: журнал згрупований по датах + каталог вправ з пошуком і фільтром по `primaryGroup` + active-set editor для weight/reps/RPE) + `domain/workouts/*` у `@sergeant/fizruk-domain` (pure-helpers — селектори журналу, групування по датах, сума об'єму, валідатори draft-ів, active-set editor mutators; 52 vitest-тести) ✅ [#494](https://github.com/Skords-01/Sergeant/pull/494). Dashboard — власний Fizruk `Dashboard` (замість PR-A скафолду): hero-картка (active-workout resume / today-session CTA / empty-nudge), KPI row (streak / weekly volume / 30-day weight Δ), quick-links grid на усі сестринські сторінки (Workouts · Plan · Programs · Progress · Measurements · Body · Atlas), secondary section (recent workouts + top PRs). Усі агрегації — pure `@sergeant/fizruk-domain/domain/dashboard/*` (`computeDashboardKpis`, `getNextPlanSession`, `computeTopPRs`, `listRecentCompletedWorkouts`, 34 vitest), read-only wiring через `useFizrukWorkouts` / `useMeasurements` / `useMonthlyPlan` / `useWorkoutTemplates` / `useActiveFizrukWorkout` (без нових мутацій) ✅[#493](https://github.com/Skords-01/Sergeant/pull/493). PR-I `Exercise` detail-сторінка (повний порт web: title + primary-muscle chips + опис, new-PR banner, PR/next-set cards, victory-native 1RM/volume тренди 12-тижневі + cardio pace/distance, load-calculator Сила/Гіпертрофія/Витривалість, історія сетів 20-рядків) + `domain/workouts/exerciseDetail.ts` у `@sergeant/fizruk-domain` (pure helpers `collectExerciseHistory`/`computeExerciseBest`/`computeExerciseWeeklyTrend`/`computeExerciseCardioTrend`/`buildLoadCalculatorZones`/`suggestExerciseNextSet`; 14 vitest) + 4 RN render-тести + long-press на рядку каталога у `Workouts` → `router.push /fizruk/exercise?id=...` ✅PR [#500](https://github.com/Skords-01/Sergeant/pull/500). Далі — `WorkoutTemplates` drawer. Фото-прогрес тіла виключений з плану ([#468](https://github.com/Skords-01/Sergeant/pull/468)). `useRecovery` + `useExerciseCatalog` + `useDailyLog` портовано на mobile (MMKV + cloud-sync wiring); Atlas.tsx і Body.tsx підключені до реальних recovery-даних замість DEMO_MUSCLES placeholder. |
| 7   | Порт модуля Харчування                                      | ⏸              | 1, 3, 6                      | `NutritionApp.tsx` + фото-аналіз (reuse server) + barcode scanner (`expo-camera` + `expo-barcode-scanner`) + water tracker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | AI-шар (HubChat / CoachInsight / WeeklyDigest)              | ⏸              | 2, 4-7                       | `react-native`-сумісний стримінг (fetch ReadableStream у RN 0.76 працює). Speech-ввід → `expo-speech-recognition` або fallback на server-side transcription.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 9   | Hub-пошук + звіти                                           | ⏸              | 2, 4-7                       | `HubSearch` + `HubReports` (агрегації мають бути pure — живуть у `packages/*`, див. п.11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Deep links + PWA shortcuts                                  | ⏸              | 4-7                          | Реалізувати всі `sergeant://...` маршрути з `docs/mobile/overview.md`. Android-shortcuts через `app.config.ts → shortcuts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | EAS prod + App Store / Play Store                           | ⏸              | 4-7 (MVP), Developer-акаунти | EAS prod-профайл, App Store Connect + Google Play Console setup, signing, privacy labels, first TestFlight/Internal Testing. **Блокер:** оформлення Apple Developer Program + Google Play Console (Q2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12  | Monitoring + Analytics                                      | 🔵 In progress | 11 (для prod-DSN)            | `@sentry/react-native` замість `@sentry/react`, Web Vitals aналоги не потрібні (нативні метрики через Sentry + expo-perf). Прогрес: scaffold ✅ [#469](https://github.com/Skords-01/Sergeant/pull/469) — `apps/mobile/src/lib/observability.ts` (`initObservability()` + `captureError()`), wiring у root layout і `ErrorBoundary.componentDidCatch`, gated за `EXPO_PUBLIC_SENTRY_DSN` (no-op якщо DSN не заданий). Далі — реальний DSN від Phase 11 EAS prod, breadcrumbs, performance tracing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13  | Sunset-план для `apps/web`                                  | ⏸              | 11                           | Рішення: чи залишаємо PWA назавжди (реюз через `react-native-web`), чи консервуємо. Див. відкрите питання **Q1**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 5. Мапування фіч web → mobile

Per module, які файли `apps/web` переносяться і в що саме.

### 5.1 `core/` (Hub)

| web                                                      | mobile ціль                                           | нотатки                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `core/App.tsx` (router, shell)                           | `apps/mobile/app/_layout.tsx` + `(tabs)/_layout.tsx`  | expo-router замість `react-router-dom`.                                             |
| `core/auth/AuthContext.tsx`                              | викид — сервером правди стає `useUser()` з api-client | Для мобілки контекст не потрібен; `authClient` already in `src/auth/authClient.ts`. |
| `core/auth/AuthPage.tsx`                                 | `apps/mobile/app/(auth)/{sign-in,sign-up}.tsx`        | Уже є scaffold; треба підключити validation з `@sergeant/shared/schemas`.           |
| `core/HubDashboard.tsx`                                  | `apps/mobile/app/(tabs)/index.tsx` + `src/hub/*`      | RN-компоненти, FlashList для стрічок.                                               |
| `core/OnboardingWizard.tsx`                              | `apps/mobile/src/onboarding/*` + модальний route      | VibePicks/AhaMoment на RN.                                                          |
| `core/hub/HubSearch.tsx`                                 | `apps/mobile/src/hub/HubSearch.tsx`                   | Pure-скорінг уже у `@sergeant/insights/search` (R2); LS-recents — web-wrapper.      |
| `core/hub/HubReports.tsx`                                | окрема screen-route, reuse агрегаторів                | Див. п.11.                                                                          |
| `core/HubChat.tsx` + `core/lib/hubChat*.ts`              | `apps/mobile/src/hub/chat/*`                          | Speech → `expo-speech-recognition`; streaming ReadableStream.                       |
| `core/insights/WeeklyDigestCard.tsx` + `useWeeklyDigest` | дзеркало                                              | Серверний ендпоінт незмінний.                                                       |
| `core/insights/TodayFocusCard.tsx`, `CoachInsightCard`   | дзеркало                                              | —                                                                                   |
| `core/ModuleErrorBoundary.tsx`                           | дзеркало (RN-friendly fallback UI)                    | —                                                                                   |
| `core/cloudSync/useCloudSync.ts`                         | `apps/mobile/src/sync/useCloudSync.ts`                | MMKV + NetInfo + React Query persister (через `apps/mobile/src/lib/storage.ts`).    |
| `core/observability/sentry.ts`                           | `apps/mobile/src/monitoring/sentry.ts`                | `@sentry/react-native`.                                                             |
| `core/observability/webVitals.ts`                        | — (викидаємо на мобілці)                              | Для native Sentry Performance даремно.                                              |
| `core/auth/authClient.ts`                                | `apps/mobile/src/auth/authClient.ts` (вже є)          | —                                                                                   |

### 5.2 `modules/finyk`

- `FinykApp.tsx` (792 LOC) — shell, переносимо як RN-root екран модуля:
  `apps/mobile/src/modules/finyk/FinykApp.tsx`.
- Всі 5 сторінок (`Overview`, `Transactions`, `Budgets`, `Analytics`,
  `Assets`) — native screens у stack-навігаторі всередині табу Finyk.
- Компоненти `components/*` — дзеркалимо 1-в-1, але:
  - Графіки (`BudgetTrendChart`, `CategoryChart`, `NetworthChart`) —
    див. секцію 7.6.
  - `ManualExpenseSheet` → `@gorhom/bottom-sheet` або expo-router
    modal presentation.
  - `TxRow`, `TxListItem` — без DOM, просто View/Text/Pressable.
  - `SwipeToAction` (з `shared/components/ui`) — переписуємо на
    `react-native-gesture-handler` + Reanimated.
- `constants.ts`, `utils.ts`, `domain/*`, `lib/*` — pure, переносимо
  у `@sergeant/finyk-domain` (якщо ще не там) і реюзаємо.
- `hooks/*` — переглядаємо кожен на DOM-залежності; більшість чисті.
- `hubRoutineSync.ts` — pure, as-is.

### 5.3 `modules/fizruk`

- `FizrukApp.tsx` + сторінки (`Dashboard`, `Workouts`, `Exercise`,
  `Programs`, `Progress`, `Measurements`, `Body`, `Atlas`,
  `PlanCalendar`) — stack усередині табу Fizruk.
- `components/BodyAtlas.tsx` (`body-highlighter`) — **web-only
  SVG-бібліотека**; на мобілці або реалізуємо через
  `react-native-svg` з аналогічним SVG-body asset-ом, або через
  готові RN-бібліотеки (див. секцію 7.8).
- `data/*`, `domain/*`, `lib/*` — pure.
- Active-workout таймер (`useActiveFizrukWorkout`) — перевірити
  BackgroundTimer / KeepAwake (`expo-keep-awake`).

### 5.4 `modules/routine`

- `RoutineApp.tsx` + хаб-календар + heatmap.
- Heatmap — RN-рендер через FlashList/Grid + SVG; `react-native-svg`.
- Reminders (`useRoutineReminders`) — `expo-notifications`
  scheduled notifications замість Web Push scheduled.
- **Habit drag-reorder ([#475](https://github.com/Skords-01/Sergeant/pull/475)).** Поверх існуючого ↑/↓ API
  (`moveHabitInOrder`, залишений як accessibility-fallback) доданий
  long-press drag-and-drop через `Gesture.Pan().activateAfterLongPress(300)`
  - `react-native-reanimated`: піднятий item масштабується / отримує
    shadow+opacity, сусіди плавно розсуваються через `LinearTransition`.
    На drop обчислюється цільовий індекс за виміряними `onLayout`-висотами
    і викликається `applySetHabitOrder` з `@sergeant/routine-domain`
    через новий `setHabitOrder` callback у `useRoutineStore()`. Haptic
    feedback — `hapticTap()` на старті drag, `hapticSuccess()` на
    committed drop. Reduced-motion — `AccessibilityInfo.isReduceMotionEnabled()`
    колапсує lift / snap-back / layout-animation до `duration: 0`.
    Реалізація — `apps/mobile/src/modules/routine/pages/Habits/DraggableHabitList.tsx`
    (+ pure-хелпери `computeDropIndex` / `moveInArray` вкриті unit-тестами,
  - інтеграційні тести через `fireGestureHandler` з
    `react-native-gesture-handler/jest-utils`).
- `context/*`, `hooks/*`, `lib/*` — в більшості pure.

### 5.5 `modules/nutrition`

- `NutritionApp.tsx` + всі компоненти.
- `BarcodeScanner.tsx` (ZXing) → `expo-camera` +
  `expo-barcode-scanner` (або new `CameraView` з `barcodeScanner`
  prop у Expo 52).
- `PhotoAnalyzeCard` — AI-аналіз залишається server-side, клієнт
  надсилає фото через `expo-image-picker` / `expo-camera` →
  `multipart/form-data` → той самий ендпоінт.
- `WaterTrackerCard`, `PantryCard`, `DailyPlanCard`, `MealSheet`,
  `ShoppingListCard` — чисті UI, прямий порт.
- `domain/*`, `lib/*`, `hooks/*` — pure.

## 6. Cross-cutting concerns

### 6.1 Локальне сховище і sync

Web використовує `localStorage` + `indexedDB` + офлайн-чергу у
`useCloudSync.ts`. На мобілці:

- **Малі значення** (токени, прапорці, user-prefs) →
  `expo-secure-store` / `AsyncStorage`.
- **Великі JSON-блоби** (module-data) — або `AsyncStorage` з batching,
  або перехід на `react-native-mmkv` (sync + швидко) / `expo-sqlite`.
  Потребує замір розміру payload-ів (див. відкрите питання **Q3**).
- **Офлайн-черга** — `NetInfo` + AsyncStorage-backed queue, дзеркалить
  web-чергу у `useCloudSync.ts`. LWW-резолвер живе на сервері,
  не змінюється.
- **React Query persister** — `@tanstack/query-async-storage-persister`
  для теплого старту. Опційно.

Ключі сховища мають префіксуватись `mobile:` щоб уникнути колізій із
shared tests, і бути задокументовані в
`apps/web/src/shared/lib/storageKeys.ts` (перенести у
`@sergeant/shared` — див. **TODO-refactor R1**).

### 6.2 Стилі й тема

Web: Tailwind + tokens у `apps/web/src/index.css` + `docs/design/BRANDBOOK.md`.

Мобільні варіанти:

- **StyleSheet + theme-object** (поточний `apps/mobile/src/theme.ts`) —
  мінімум залежностей, але багатослівний.
- **NativeWind** — класова Tailwind-like API, ближче до web,
  але додає compile-time обробку і пайплайн. Дає 80% реюзу класів.
- **Tamagui / Gluestack** — design-system-first, багато готових
  компонентів, але інвазивний.

Потрібне рішення **Q5**. До прийняття — продовжуємо на StyleSheet.

### 6.3 Навігація

Web: `react-router-dom` v7.
Mobile: `expo-router` v4 (file-based, зверху React Navigation).

Мапування URL-ів на deep links — у `docs/mobile/overview.md`. Shell-рівень
вже піднятий (auth-модалка + tabs). Всередині кожного табу —
Stack-навігатор, файли під `app/(tabs)/<module>/*`.

**Phase 10 (deep links) — PR-A ✅ + PR-B 🔵, In progress.** Pure-хелпер
`apps/mobile/src/lib/deepLinks.ts` парсить/будує всі `sergeant://…`
схеми з таблиці у `docs/mobile/overview.md` і повертає `Href` для
expo-router через discriminated-union `SergeantDeepLink`. Runtime-шар —
`useDeepLinks()` (в `src/lib/useDeepLinks.ts`), який монтує
cold-start (`Linking.getInitialURL()` → `router.replace`) і
warm-start (`Linking.addEventListener("url")` → `router.push`),
дедупує однаковий URL, і пропускає `sergeant://auth/callback` через
себе (цим листенером володіє `@better-auth/expo/client`). Хук
викликається всередині `RootShell` у `app/_layout.tsx`, після того
як `Stack` із навігаційним контекстом уже змонтований. Android
`intentFilters` для scheme `sergeant` додано в `app.config.ts`;
universal links (`https://sergeant.2dmanager.com.ua` +
`applinks:` на iOS) відкладені як TODO до публікації
`.well-known/assetlinks.json` на прод-домен. Скафолди роутів
(`routine/habit/[id]`, `fizruk/workout/[id]`, `fizruk/workout/new`,
`finyk/tx/[id]`, `nutrition/scan`, `nutrition/recipe/[id]`,
`auth/callback`) рендерять спільний `DeepLinkPlaceholder`
(«Скоро» + primary-CTA + повернення на хаб), доки відповідні фази
(Phase 6 Fizruk, Phase 7 Nutrition) не підтягнуть реальні екрани.

**PR-B — Android app shortcuts + iOS quick actions.** Додає три
статичних шорткати: «Витрата» → `sergeant://finance/tx/new`,
«Сьогодні» → `sergeant://routine`, «Тренування» →
`sergeant://workout/new`. На Android локальний config-плагін
`apps/mobile/plugins/withAndroidShortcuts.ts` генерує
`android/app/src/main/res/xml/shortcuts.xml`, зливає localizable
лейбли у `res/values/strings.xml` через
`AndroidConfig.Strings.setStringItem`, і реєструє
`<meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts"/>`
у `MainActivity` через `withAndroidManifest`. На iOS плагін не
потрібен — Expo зливає `ios.infoPlist.UIApplicationShortcutItems`
прямо у згенерований `Info.plist`. Лейбли та порядок однакові на
обох платформах; іконки беремо дефолтні (`@mipmap/ic_launcher` на
Android, `UIApplicationShortcutIconTypeAdd/Date/Play` на iOS), щоб
PR-B не тягнув нових асетів. Тап шортката фаєрить `sergeant://…`
intent, який іде через уже протестований `useDeepLinks` pipeline —
жодного нового runtime-коду не додано. Pure `buildShortcutsXml` /
`shortcutStringKeys` мають unit-тести, решта плагіна — декларативні
моди, що виконуються під час `expo prebuild`.

Smoke-test скрипт для deep links — окремий PR-C (опційно).

### 6.4 Push-нотифікації

- Web: Web Push + VAPID, `usePushNotifications`, service worker.
- Mobile: `expo-notifications` → native APNs/FCM; `PushRegistrar`
  уже реєструє токен через `POST /api/v1/push/register`.
- Scheduled reminders (routine, fizruk):
  - web: `setTimeout` + service worker.
  - mobile: `Notifications.scheduleNotificationAsync` (native,
    працює у фоні без запущеного процесу).
- Payload має бути платформо-агностичний. Перевірити
  `apps/server/src/routes/push.ts` + `apps/server/src/modules/push/*` — чи воно інакше серіалізує для web/native
  (наразі, судячи з коду, single-sink).

### 6.5 Голосовий ввід і speech

- Web: Web Speech API (`SpeechRecognition` в Chrome).
- Mobile: немає вбудованої RN-альтернативи, опції:
  - `@react-native-voice/voice` (bare-only),
  - `expo-speech-recognition` (community, але працює з Expo Go),
  - server-side transcription (Whisper) — вантажити аудіо через
    `expo-av` і транскрибувати серверно.
- `speechParsers` — pure, переносимо as-is.

Вибір — питання **Q6**.

### 6.6 Камера / штрихкод / фото-аналіз

- **Штрихкод (mobile, зроблено):** `expo-camera` / `CameraView` +
  `onBarcodeScanned` + `barcodeScannerSettings` (EAN/UPC) у
  `apps/mobile/src/modules/nutrition/components/NutritionBarcodeScanScreen.tsx`,
  lookup через `useBarcodeProductLookup` → `/api/barcode` (той самий
  контракт, що web), deep link `app/(tabs)/nutrition/scan.tsx`,
  інтеграція з `AddMealSheet` через `nutritionScanBridge`.
- **Список покупок (mobile, зроблено):** вкладка «Покупки» в
  `NutritionApp`, `useShoppingList` + `pages/Shopping.tsx` поверх
  `nutritionStore` / `SHOPPING_LIST_KEY` (доменні мутації з
  `@sergeant/nutrition-domain`). Повна AI-генерація з рецептів/плану
  як на web — ще ні.
- **Комора (mobile, зроблено):** `useNutritionPantries` + `pages/Pantry.tsx`,
  stack `app/(tabs)/nutrition/pantry.tsx`, CTA з `Dashboard` — `mergeItems` /
  `parseLoosePantryText` / `groupItemsByCategory`, кілька складів. **AI-розбір
  великого списку** — `apiClient.nutrition.parsePantry` (кнопка «Розібрати AI»),
  `X-Token` з `EXPO_PUBLIC_NUTRITION_API_TOKEN` (якщо на сервері
  `NUTRITION_API_TOKEN`).
- Фото-їжа (mobile, зроблено): `expo-image-picker` (галерея + камера) +
  `expo-image-manipulator` + `expo-file-system` (base64) →
  `POST /api/nutrition/analyze-photo` / `refine-photo` з `AddMealSheet` (порція
  та відповіді на питання) → `source: "photo"`, `macroSource: "photoAI"`.

### 6.7 Графіки

Web використовує кастомні компоненти + canvas/SVG.

Варіанти для RN:

- `victory-native` + `react-native-svg` — зрілий, багато типів.
- `react-native-gifted-charts` — швидкий.
- `react-native-reanimated-charts` — якщо хочемо жести/анімації.

Вибір — питання **Q7**. Для MVP ймовірно беремо `victory-native`.

### 6.8 Body Atlas

`body-highlighter` (web-only) → варіанти:

- Ручна SVG-модель у `react-native-svg` з тап-обробкою по path-ах
  (найгнучкіше, ~1 день роботи).
- `react-native-body-highlighter` (якщо існує у потрібному стані).

### 6.9 Безпека й ключі

- Токени: `expo-secure-store` (вже підключено).
- API base URL: `EXPO_PUBLIC_API_BASE_URL` (build-time).
- Не зберігати API-секрети на клієнті. AI-виклики йдуть лише через
  `apps/server`.

### 6.10 Background tasks

- Web-PWA виконує deferred roboti через service worker.
- Mobile: `expo-background-fetch` / `expo-task-manager` для синк-пулу.
  Поки не в MVP.

## 7. Web-only API → RN заміни (чеклист)

| web API                                                     | зустрічається в                                                                                                                    | RN-заміна                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `localStorage` / `sessionStorage`                           | всюди, через `shared/lib/storage.ts`                                                                                               | `AsyncStorage` / `expo-secure-store` / `react-native-mmkv` (через адаптер).                                            |
| `window.navigator.onLine`                                   | `shared/hooks/useOnlineStatus.ts`                                                                                                  | `@react-native-community/netinfo`.                                                                                     |
| `document.visibilityState`                                  | (треба відсканувати)                                                                                                               | `AppState` з `react-native`.                                                                                           |
| `Notification`, `navigator.serviceWorker`                   | `shared/hooks/usePushNotifications.ts`                                                                                             | `expo-notifications`.                                                                                                  |
| `SpeechRecognition`, `speechSynthesis`                      | `core/hooks/useSpeech.ts`, `HubChat`, `VoiceMicButton`                                                                             | Секція 6.5.                                                                                                            |
| `getUserMedia`, `MediaStream`                               | `nutrition/components/BarcodeScanner.tsx`                                                                                          | `expo-camera`.                                                                                                         |
| `@zxing/browser` + `@zxing/library`                         | `nutrition/components/BarcodeScanner.tsx`                                                                                          | `expo-camera` barcode scanner.                                                                                         |
| `BarcodeDetector`                                           | те саме                                                                                                                            | те саме.                                                                                                               |
| `vite-plugin-pwa` / Workbox                                 | `apps/web` build                                                                                                                   | **не мігруємо**, залишається тільки на web.                                                                            |
| `react-router-dom`                                          | `apps/web/src/core/App.tsx`                                                                                                        | `expo-router`.                                                                                                         |
| Tailwind class-names                                        | скрізь                                                                                                                             | NativeWind (Q5 ✅).                                                                                                    |
| `body-highlighter`                                          | `fizruk/components/BodyAtlas.tsx`                                                                                                  | Секція 6.8.                                                                                                            |
| `navigator.vibrate`                                         | `shared/lib/haptic.ts`                                                                                                             | `expo-haptics` через адаптер з тією ж сигнатурою (**R7**).                                                             |
| `@dnd-kit/*` drag-and-drop                                  | `core/HubDashboard.tsx` (reorder)                                                                                                  | `react-native-gesture-handler` + `react-native-reanimated` → власна логіка або `react-native-draggable-flatlist`.      |
| `react-virtuoso`                                            | довгі стрічки в фінік/фізрук                                                                                                       | `@shopify/flash-list` (drop-in FlatList замінник).                                                                     |
| `react-markdown`                                            | `core/components/AssistantMessageBody.tsx` (HubChat)                                                                               | `react-native-markdown-display` або `@react-native/markdown-display`.                                                  |
| `Blob` + `URL.createObjectURL` + `a.download` (JSON backup) | `routine/components/RoutineBackupSection.tsx`, `fizruk/pages/Progress.tsx`, `nutrition/hooks/useNutritionCloudBackup.ts`           | `expo-file-system` (запис у cache) + `expo-sharing` (share sheet). Обгорнути як `exportJson` (**R8**).                 |
| `<input type="file">` для фото                              | `nutrition/NutritionApp.tsx`                                                                                                       | `expo-image-picker` + `expo-image-manipulator` (resize/compression).                                                   |
| `FileReader` → base64                                       | `nutrition/lib/fileToBase64.ts`                                                                                                    | `FileSystem.readAsStringAsync({ encoding: EncodingType.Base64 })`.                                                     |
| `window.visualViewport` + resize inset                      | `shared/hooks/useVisualKeyboardInset.ts`, `routine/hooks/useVisualKeyboardInset.ts`                                                | RN `Keyboard` events + `KeyboardAvoidingView`, або `react-native-keyboard-controller` для shared-value inset (**R9**). |
| `document.activeElement` + Tab/Escape trap                  | `shared/hooks/useDialogFocusTrap.ts`                                                                                               | Викидаємо на мобілці — RN `Modal` + `BackHandler` (Android) покривають UX. iOS свайп-back з `react-native-screens`.    |
| `document.visibilityState` / `visibilitychange`             | `shared/lib/createModuleStorage.ts` (flush-on-hide), `core/observability/webVitals.ts`, `core/stories/hooks/useStoriesAutoplay.ts` | `AppState` з `react-native` (`change` event, `active`/`background`/`inactive`).                                        |
| `useDarkMode` через `matchMedia` + `localStorage`           | `shared/hooks/useDarkMode.ts`                                                                                                      | `useColorScheme()` з `react-native` + MMKV-override через спільний storage-адаптер.                                    |
| SW-update / iOS install banner / PWA action                 | `core/app/useSWUpdate.ts`, `core/app/useIosInstallBanner.ts`, `shared/hooks/usePwaAction.ts`                                       | **Викидаємо**. OTA-оновлення — `expo-updates`; "встановити додаток" — стор-сторінка замість banner-а.                  |
| `@sentry/react`                                             | `core/observability/sentry.ts`                                                                                                     | `@sentry/react-native` (Секція 5.1, Фаза 12).                                                                          |
| `@axe-core/playwright`                                      | `apps/web/tests/a11y`                                                                                                              | **Не мігруємо**. На RN a11y тести через Detox + `accessibilityLabel`/`accessibilityRole` асерти.                       |
| `Intl.DateTimeFormat` / `toLocaleString`                    | всюди для дат/валют                                                                                                                | Expo 52 тягне Hermes з повним Intl (since 0.73). Перевірити у Фазі 2 smoke-тестом.                                     |

## 8. Тестування

- `packages/*` — той самий Jest/Vitest, зелене CI = зелено для обох клієнтів.
- `apps/mobile` — Jest (`jest-expo`) + React Native Testing Library для
  unit/component. E2E — `maestro` або `detox` (питання **Q8**).
- Ручне smoke-тестування — Expo Go на фізичному пристрої (iOS + Android)
  перед кожним merge у master після Фази 4.

## 9. CI/CD

- Наявний CI (`turbo run lint | typecheck | test`) вже покриває
  `@sergeant/mobile` (`lint` + `typecheck` скрипти в `package.json`
  є). Треба додати:
  - `apps/mobile` до `turbo.json` pipeline-ів (перевірити, уже в).
  - Перевірку `app.config.ts` (`check-build-config` скрипт
    вже існує).
- **Detox E2E — дві паралельні лінії** (див. `apps/mobile/e2e/README.md`):
  - `.github/workflows/detox-ios.yml` — `macos-14`, iPhone 15 simulator,
    `expo prebuild → pod install → pnpm e2e:build:ios → pnpm e2e:test:ios`.
    Тригер: `pull_request` + `push` на `main` (mobile-scoped paths) +
    `workflow_dispatch`.
  - `.github/workflows/detox-android.yml` — `ubuntu-latest` + KVM,
    AVD `Pixel_5_API_34` через `reactivecircus/android-emulator-runner`,
    `expo prebuild → pnpm e2e:build:android → pnpm e2e:test:android` з
    кешами pnpm store / gradle / AVD snapshot. Той самий suite-сет, що
    й iOS.
  - Обидва workflows завантажують `apps/mobile/.detox-artifacts` на
    failure (логи + скріншоти).
- EAS builds — окремий workflow (fire-on-tag, не на кожному PR).
- Preview-builds через **EAS Update** для internal testing без
  повного rebuild.

## 10. App Store / Play Store

Потрібно ще зробити:

### 10.1 iOS `Info.plist` usage descriptions (прив’язані до модулів)

- `NSCameraUsageDescription` — nutrition barcode + photo.
- `NSPhotoLibraryUsageDescription` — nutrition photo-аналіз (галерея).
- `NSPhotoLibraryAddUsageDescription` — якщо зберігаємо WeeklyDigest PDF.
- `NSMicrophoneUsageDescription` — voice input (HubChat).
- `NSSpeechRecognitionUsageDescription` — `expo-speech-recognition`.
- `NSUserNotificationsUsageDescription` / `NSRemindersUsageDescription` —
  routine reminders (опційно, якщо пишемо в Reminders.app).
- `NSFaceIDUsageDescription` — якщо додаватимемо app-lock на фінансовий
  модуль (потенційно, не MVP).
- `NSLocalNetworkUsageDescription` — якщо буде само-детект-превью
  (dev-only, віддалено).

### 10.2 Android runtime permissions

- `CAMERA` — nutrition barcode, photo capture.
- `READ_MEDIA_IMAGES` (API 33+) / `READ_EXTERNAL_STORAGE` (<33) —
  photo gallery pick.
- `RECORD_AUDIO` — voice input.
- `POST_NOTIFICATIONS` (API 33+) — reminders + sync-push.
- `SCHEDULE_EXACT_ALARM` (API 33+) — routine reminders.
- `USE_BIOMETRIC` — якщо додаватимемо app-lock.

### 10.3 Store-асети

- iOS: Apple Developer account, App Store Connect app record,
  privacy manifest (`PrivacyInfo.xcprivacy`), App Tracking Transparency
  (ймовірно NO — ми не треки), push-сертифікати APNs.
- Android: Google Play Console, internal testing track, Data Safety
  form, notification channel declarations.
- Legal: Privacy Policy URL (є у `apps/web`? треба перевірити),
  Terms of Use.
- Assets: іконка, splash, screenshots (5.5"/6.5" iOS, Android
  phone/tablet).

## 11. Технічний борг, який мігрує разом з RN

Під час порту ми змушені будемо винести pure-частини з `apps/web/src`
у пакети. План рефакторингів-супутників:

- **R1.** ✅ Done (PR [#405](https://github.com/Skords-01/Sergeant/pull/405)). `storageKeys.ts` → `@sergeant/shared`.
- **R2.** ✅ Done (PR [#414](https://github.com/Skords-01/Sergeant/pull/414)). `hubSearchEngine.ts` (pure-скорінг) +
  типи/реєстр рекомендацій + усі finance-правила вийняті у новий
  DOM-free пакет `@sergeant/insights`; LS-обгортки (`buildFinanceContext`,
  recents для пошуку, orchestrator `generateRecommendations`) лишились у
  `apps/web` і тепер імпортують pure-ядро з пакета.
- **R3.** ✅Done (PR [#415](https://github.com/Skords-01/Sergeant/pull/415)). `modules/finyk/lib/*`, `domain/*`, `constants.ts`, `utils.ts` повністю реюзаються з `@sergeant/finyk-domain`; web-шіми у `apps/web/src/modules/finyk/{domain,lib}/*.ts` видалено, імпорти у `apps/web` переведено на `@sergeant/finyk-domain/*`, pure-юніт-тести перенесені у пакет. У `apps/web` лишились тільки DOM/localStorage-залежні артефакти (`lib/{demoData,finykBackup,finykStorage,lsStats,storageManager}.ts`, `hubRoutineSync.ts`, `hooks/*`, `chartPalette/chartPalette.js`).
- **R4.** ✅Done (PR [#418](https://github.com/Skords-01/Sergeant/pull/418)). `modules/fizruk/data/*` (exercise library) + pure `domain/*` і `lib/*` винесено у новий pure-пакет `@sergeant/fizruk-domain`. У `apps/web` залишилась лише тонка `localStorage`-обгортка (`lib/fizrukStorage.ts`), React-хуки і UI. Нуль DOM-залежностей у пакеті — готовий до `apps/mobile` (Фаза 6).
- **R5.** ✅ Done (by-construction — перевірено 2026-04-20). Усі domain- та
  HTTP-schemas централізовано у `packages/shared/src/schemas/` (`api.ts`,
  `finyk.ts` + re-export через `@sergeant/shared`). `apps/mobile/src` не
  використовує `zod` взагалі (жодного `z.object` / `z.string` / `from "zod"`).
  Єдині залишки `zod` у `apps/web/src` — інфраструктурні: `shared/lib/typedStore.ts`
  (generic-обгортка, приймає будь-яку схему) + `core/lib/featureFlags.ts`
  (`FlagValuesSchema = z.record(z.string(), z.boolean())`, web-only runtime-конфіг).
  Жодного дублю business-схем між `@sergeant/shared`, `apps/web` і `apps/mobile`
  немає — R5 закрито без окремого PR.
- **R6.** ✅ Done (PR [#406](https://github.com/Skords-01/Sergeant/pull/406)). Tailwind preset + дизайн-токени у `@sergeant/design-tokens`; `apps/web/tailwind.config.js` і `apps/mobile/tailwind.config.js` обидва споживають один preset.
- **R7.** ✅ Done (PR [#425](https://github.com/Skords-01/Sergeant/pull/425) + follow-up [#428](https://github.com/Skords-01/Sergeant/pull/428)).
  `shared/lib/haptic.ts` розібрано на два адаптери. PURE-контракт
  (`HapticAdapter` + `setHapticAdapter` + `hapticTap/Success/Warning/Error/Cancel/Pattern`)
  живе у `@sergeant/shared/lib/haptic` із безпечним no-op-адаптером за
  замовчуванням. Web-імплементація на `navigator.vibrate` (з reduced-motion
  - feature-detect + try/catch) залишається у
    `apps/web/src/shared/lib/haptic.ts` і реєструється один раз у
    `apps/web/src/main.jsx` через side-effect-імпорт. Mobile-імплементація
    через `expo-haptics` (`selectionAsync`, `notificationAsync(Success/Warning/Error)`,
    `impactAsync(Light)` для cancel; `pattern` — no-op з TODO) живе у
    `apps/mobile/src/lib/haptic.ts` і реєструється у
    `apps/mobile/app/_layout.tsx`. Консьюмери (`@sergeant/finyk-domain`,
    UI-примітиви, `apps/web/*`) імпортують хелпери з `@sergeant/shared` без
    знання про платформу.
- **R8.** ✅ Done (PR [#432](https://github.com/Skords-01/Sergeant/pull/432)
  — pure-контракт + web-адаптер + перші 3 споживача; follow-up PR
  [#437](https://github.com/Skords-01/Sergeant/pull/437) — решта JSON-backup
  web-споживачів; mobile-адаптер = TODO-заглушка до Фази 4+).
  Pure-контракт `FileDownloadAdapter` + `downloadJson(filename, payload)`
  живе у `@sergeant/shared/lib/fileDownload` із безпечним no-op-дефолтом
  (dev-warn, прод-тиша). Web-імплементація `Blob` + `URL.createObjectURL`
  - `<a download>` у `apps/web/src/shared/lib/fileDownload.ts`, реєструється
    у `apps/web/src/main.jsx`. УСІ web-споживачі JSON-бекапу мігровано:
    `core/hub/HubBackupPanel.tsx`, `modules/routine/components/RoutineBackupSection.tsx`,
    `modules/fizruk/components/workouts/WorkoutBackupBar.tsx` (PR #432) +
    `modules/fizruk/pages/Progress.tsx`, `modules/finyk/hooks/useStorage.ts`
    (PR #437). Nutrition-модуль (`mealPhotoStorage`, `usePhotoAnalysis`,
    `LogCard`) використовує `URL.createObjectURL` виключно для image-preview
    (мініатюри страв, попередній перегляд фото перед аналізом) — це окремий
    пайплайн `expo-image-picker`/`expo-image-manipulator` з §10 таблиці, не
    JSON-download-контракт. Mobile-адаптер реалізовано:
    `apps/mobile/src/lib/fileDownload.ts` використовує
    `expo-file-system.writeAsStringAsync` (`cacheDirectory`) +
    `expo-sharing.shareAsync`. Імпорт — через `FileImportAdapter`
    (`expo-document-picker` + `expo-file-system.readAsStringAsync`).
- **R9.** ✅ Done (PR [#433](https://github.com/Skords-01/Sergeant/pull/433) — shared hook + web/mobile адаптери + 5 споживачів
  мігровано + видалено дублікат у `routine/hooks`). Pure-контракт
  `VisualKeyboardInsetAdapter` + `useVisualKeyboardInset(active)` живе у
  `@sergeant/shared/hooks/useVisualKeyboardInset` із безпечним no-op-дефолтом,
  що повертає `0` (SSR / тест / unconfigured). Web-імплементація на
  `window.visualViewport` (`resize` + `scroll`, 56 px-поріг проти chrome-resize)
  у `apps/web/src/shared/hooks/useVisualKeyboardInset.ts`, реєструється у
  `apps/web/src/main.jsx`. Mobile-імплементація на `Keyboard.addListener`
  (`keyboardDidShow` / `keyboardDidHide`) у `apps/mobile/src/hooks/useVisualKeyboardInset.ts`,
  реєструється у `apps/mobile/app/_layout.tsx` — БЕЗ
  `react-native-keyboard-controller` / `react-native-reanimated` deps. Мігровано
  5 споживачів: `finyk/ManualExpenseSheet`, `routine/PushupsWidget`,
  `nutrition/AddMealSheet`, `fizruk/workouts/AddExerciseSheet`, `core/HubChat` —
  усі тепер імпортують `useVisualKeyboardInset` з `@sergeant/shared`. Видалено
  дублікат `apps/web/src/modules/routine/hooks/useVisualKeyboardInset.ts`.

Кожен R-пункт робиться окремим PR перед відповідною Фазою (щоб
mobile PR був маленький і тільки про UI).

**Post-R-track cleanup.** Після закриття R1–R9 виконано точкове
прибирання мертвих експортів у `apps/web/src` (PR
[#439](https://github.com/Skords-01/Sergeant/pull/439)): ~18
символів у 7 секціях (constants, types, runtime helpers, pantry
CRUD, foodDb export/import, UI). Жодних змін у публічному API
`@sergeant/*` пакетів чи в `apps/mobile` — чисто зачистка
наслідків R-рефакторингів.

### 11.1 Mobile stubs backlog (єдиний трек)

Зведення навмисних заглушок і відкладених інтеграцій — щоб не розмазувати їх по окремих issue без зв’язку з фазами вище.

| Зона                        | Файл (приклад)                                                                                           | Цільова фаза / PR          | Коротко                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| JSON backup download        | `apps/mobile/src/lib/fileDownload.ts`                                                                    | ~~Фаза 4+ (R8)~~ Done      | `expo-file-system` + `expo-sharing` + `expo-document-picker`. Import/export UI live in `GeneralSection`. |
| Weekly digest UI            | `apps/mobile/src/core/dashboard/WeeklyDigestCard.tsx`                                                    | Після паритету з web       | Мінімальний stub замість повного `WeeklyDigestCard` з PWA.                                               |
| Deep links / hub маршрути   | `apps/mobile/src/components/DeepLinkPlaceholder.tsx`, `apps/mobile/src/modules/finyk/pages/PageStub.tsx` | За мірою появи екранів     | Плейсхолдери до повного nested-стеку.                                                                    |
| Observability               | `apps/mobile/src/core/ModuleErrorBoundary.tsx`                                                           | Фаза 10+                   | `TODO(phase-10):` `@sentry/react-native`.                                                                |
| Haptics `pattern`           | `apps/mobile/src/lib/haptic.ts`                                                                          | RN API                     | `expo-haptics` не експонує pattern — no-op + TODO.                                                       |
| Universal links             | `apps/mobile/app.config.ts`                                                                              | Публікація / Phase 10+     | Associated domains після стабільного прод-домену.                                                        |
| Routine reminders vs web SW | `apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts`                                           | Паралельно з нотифікаціями | Коментар про відмінність від web Service Worker.                                                         |

Деталі R8 та інших R-пунктів — у підпунктах **R7–R9** вище в цій же секції §11.

## 12. Ризики

- **Expo SDK upgrade cadence** — ми на SDK 52 (остання LTS на
  момент написання), далі треба планувати підйоми SDK, кожен
  ламає щось у нативних плагінах.
- **Реюз `apps/web` компонентів через `react-native-web`** — можливо,
  але не ціль: PWA і native мають різні UX. Розглядаємо лише як
  запасний сценарій для Hub-чату або DesignShowcase.
- **Розмір бандла** — усі `@sergeant/`\* тягнуться сирим TS у
  Metro; треба стежити за tree-shake-ом, особливо `@sergeant/finyk-domain`.
- **iOS background quota** — scheduled notifications + offline queue
  можуть впертись в iOS-обмеження фонових тасків. MVP — через
  push-пінг від сервера, не клієнт-сайд cron.
- **Apple App Review** — "personal finance" + AI чат = підвищена увага.
  Потрібен чіткий privacy policy і пояснення, що дані Monobank
  користувача ніколи не виходять за межі його сесії.
- **Hermes `Intl.`\* покриття.** Web активно використовує
  `toLocaleDateString`, `Intl.NumberFormat` для дат/валют у finyk/nutrition.
  RN 0.76 + Hermes має повний Intl по дефолту, але треба smoke-тест
  української локалі в Фазі 2 (компонент зі всіма формат-варіантами).
- **OTA-оновлення.** `expo-updates` дозволяє пушити JS-only фікси
  без store-review. Потрібна стратегія каналів (dev / preview / prod),
  щоб не зламати версіювання. Планується на Фазу 11.

## 13. Прийняті рішення (Q1–Q10)

> Закриті рішення — так, ці питання колись були відкритими. Якщо треба
> переглянути — окремий PR з мотивацією у "Нотатки".

- **Q1. Доля `apps/web` після міграції.** ✅ **(a) — залишаємо PWA + mobile паралельно.**
  Сайт продовжує розвиватись як окремий продуктивний клієнт для
  desktop-юзкейсу. Mobile — додатковий канал, не заміна.
- **Q2. Публікація в магазинах як MVP-ціль.** ✅ **Internal Testing після Фази 4 (Фінік).**
  Уточнення від юзера: **у юзера ще немає Apple Developer Program і
  Google Play Developer підписок.** Тож фактичний старт Internal
  Testing відкладається до моменту оформлення акаунтів.
  До того часу тестуємо на фізичному пристрої через Expo Dev Client
  (див. Q4). Задача "оформити Developer-акаунти" додається у Фазу 11
  як blocker.
- **Q3. Sync-стек на мобілці.** ✅ `**react-native-mmkv`\*\* з самого початку.
  Пропустили проміжний етап AsyncStorage — одразу йдемо в швидкий
  sync-стор. Адаптер сховища (`@sergeant/shared/storage` або локальний
  у `apps/mobile/src/lib/storage.ts`) має той самий shape, що й
  web `shared/lib/storage.ts`, щоб хуки/утиліти були платформо-агностичні.
- **Q4. Dev Client vs Expo Go.** ✅ **Expo Dev Client з Фази 1.**
  Одразу налаштовуємо EAS-збірку dev-профайлу. Плюси: свобода вибору
  нативних бібліотек (voice, MMKV на new arch без обмежень).
  Мінуси: перший раз треба 1-2 год на EAS setup.
- **Q5. Стильова система.** ✅ **NativeWind.**
  Класова Tailwind-like API. Дозволяє копіювати `className=...` з web
  компонентів із мінімальними правками. `tailwind.config` розшарити
  між web і mobile, щоб токени (кольори, spacing, font scale) жили в
  одному місці — див. **R6** (новий техборг).
- **Q6. Speech-to-text на мобілці.** ✅ `**expo-speech-recognition` як
  primary, сервер-сайд Whisper як fallback.\*\*
  MVP — `expo-speech-recognition` (працює з Dev Client). Паралельно
  додаємо фолбек-ендпоінт `POST /api/v1/speech/transcribe` (Whisper)
  для пристроїв без on-device STT або для невдалих фолбеків.
- **Q7. Бібліотека графіків.** ✅ `**victory-native`.\*_
  Використовуємо в Фазі 4 (Фінік: `BudgetTrendChart`, `CategoryChart`,
  `NetworthChart`). Обгортка-адаптер у `apps/mobile/src/components/charts/`_
  щоб пізніше можна було безболісно замінити.
- **Q8. E2E тестування.** ✅ **Detox.**
  Відступили від рекомендації maestro — беремо Detox через ширші
  можливості. Setup додає сесійних витрат, але в довгостроковій
  перспективі окупиться. Перший E2E-сьют пишемо паралельно з Фазою 4
  (щоб не писати тести пост-фактум).
- **Q9. Brand / design consistency.** ✅ **Оновлено BRANDBOOK.md**
  ([PR #409](https://github.com/Skords-01/Sergeant/pull/409)). Додано
  секцію "Native Patterns (iOS / Android)": haptics (Light/Medium/Heavy),
  safe-area правила, native-gesture-паттерни (swipe-back,
  pull-to-refresh), тип-скейл адаптації під iOS HIG / Material, dark-mode
  через `useColorScheme()`, motion + reduce-motion. Web-look не змінено.
- **Q10. Monobank OAuth на мобілці.** Технічна перевірка в рамках
  Фази 4 — без блокування. Очікуємо, що токен-флоу через
  `apps/server` працює без змін (клієнт лише вставляє токен).

### Техборг R6 (випливає з Q5) — ✅ Done

Винесено в пакет `@sergeant/design-tokens`
([PR #406](https://github.com/Skords-01/Sergeant/pull/406)).
`apps/web/tailwind.config.js` і `apps/mobile/tailwind.config.js`
обидва підключають один і той самий Tailwind preset через
`presets: [require('@sergeant/design-tokens/tailwind-preset')]`
(у mobile — після `nativewind/preset`).

## 14. Як читати цей документ

- **Якщо питаєш "а що я можу вже зараз робити?"** → переходь у
  `apps/mobile`, запускай `pnpm --filter @sergeant/mobile start`.
- **"Який наступний крок?"** → Фаза 1 (секція 4).
- **"Що саме перенести з модуля X?"** → Секція 5.X.
- **"Чим замінити `getUserMedia` / `localStorage` / ...?"** →
  Секція 7.
- **"Що блокує роботу над чимось?"** → Секція 13 (Відкриті питання).

---

_Документ живий. Редагуй у місці, де з'являється новий факт —
не додавай секції-зміни "Що нового з 12.04". PR-опис в історії
git закриває цю потребу._
