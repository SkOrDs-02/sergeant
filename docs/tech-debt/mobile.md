# Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor)

> **Last validated:** 2026-05-13 by Devin (mobile reliability/UX roast: wired `core/ModuleErrorBoundary.tsx` to `captureError`, dropped stale `useRoutineReminders.ts` allowlist entry, re-counted >600 LOC inventory — 4 files current, up from 2). **Next review:** 2026-08-11.
> **Status:** Active

> **Оновлено 2026-05-13 (roast #10).** Registry revalidated alongside `docs/audits/2026-05-13-mobile-reliability-ux-roast.md`:
> ModuleErrorBoundary TODO(phase-10) closed — `componentDidCatch` now forwards via `captureError` (no DSN required for the call itself; gating remains inside `lib/observability.ts`). `useRoutineReminders.ts` no longer holds a stale entry in the mobile `no-strict-bypass` allowlist. Large-file inventory drifted: `fizruk/lib/dualWrite/adapter.ts` 737 → 804 (+67), `PlanCalendar.tsx` 616 → 661 (+45), plus two newly-over-600 files — `fizruk/lib/dualWrite/diff.ts` 633 and `routine/pages/Calendar.tsx` 628.
>
> **Оновлено 2026-05-13 (T7 verification job).** Додано T7 verification job: `.github/workflows/mobile-flaky-verify.yml`
> гонить mobile jest-suite 20 разів поспіль (workflow_dispatch + weekly Monday 05:00 UTC cron) і
> фейлить на першому fail-і — baseline для зняття «⏳ flaky» tag-у з roadmap T7.
>
> **Оновлено 2026-05-12.** Registry revalidated after mobile onboarding decomposition:
> `OnboardingWizard.tsx` is now a thin 390-LOC shell, with `wizardState`, `useReduceMotion`,
> `StepIndicator`, `WelcomeStep`, `ModulesStep`, `GoalsStep`, and shared onboarding style helpers
> living under `apps/mobile/src/core/onboarding/`. Current large-file carry-over is 2 files:
> `fizruk/lib/dualWrite/adapter.ts` and `PlanCalendar.tsx`.
>
> **Оновлено 2026-05-03.** Перша версія registry: інвентаризація mobile-частини
> монорепо, що раніше трекалась лише фрагментарно у `frontend.md` та audit-у
> `docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`. Цей файл — living
> burndown для `apps/mobile/**` (Expo 52 + RN 0.76) та `apps/mobile-shell/**`
> (Capacitor wrapper навколо `apps/web`).

> Scope: **`apps/mobile/`** (Expo 52, React Native 0.76, NativeWind, MMKV, Jest 29)
> та **`apps/mobile-shell/`** (Capacitor 7 wrapper + Vitest unit tests).
>
> Методологія: пофайловий аудит код-маркерів (`as unknown as`, `: any`,
> `@ts-ignore`, `localStorage.*`), great-LOC big-files cutoff (>600 LOC),
> TODO/FIXME, скіпнуті тести, observability gating. Перший PR — лише цей
> документ + ESLint guardrail-extension у [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277).
> Виправлення йдуть окремими тематичними PR (див. [Roadmap](#roadmap--pr-breakdown)).

> **Як читати:** позначки в стовпчику «Статус» оновлюються в момент злиття PR.
> Це жива сторінка — не «звіт», а контроль міграцій.

> **CI freshness gate.** Маркер `**Оновлено YYYY-MM-DD.**` у заголовку
> перевіряє [`scripts/check-tech-debt-freshness.mjs`](../../scripts/check-tech-debt-freshness.mjs)
> у складі `pnpm lint`. PR падає, якщо маркер старший за 60 днів
> (поріг — `FRESHNESS_THRESHOLD_DAYS`). Re-validate сторінку (статуси,
> цифри, нові пункти) і онови дату — будь-який інший edit без бампу
> маркера лічильник не скидає.

## Зміст

1. [Summary — per-category](#summary--per-category)
2. [Type-safety bypasses (`as unknown as`, `as any`, `@ts-ignore`)](#type-safety-bypasses)
3. [`: any` types у production-коді](#-any-types)
4. [Storage / cloud-sync інваріанти](#storage--cloud-sync)
5. [Великі файли (>600 LOC)](#великі-файли-600-loc)
6. [TODO/FIXME маркери](#todofixme-маркери)
7. [Observability — Sentry RN](#observability--sentry-rn)
8. [Tests — coverage & flakiness](#tests--coverage--flakiness)
9. [Capacitor (`apps/mobile-shell`) — coverage](#capacitor-appsmobile-shell--coverage)
10. [TypeScript-version drift](#typescript-version-drift)
11. [Roadmap — PR breakdown](#roadmap--pr-breakdown)

---

## Summary — per-category

| Категорія                                | Статус                  | Короткий висновок                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint guardrails                        | ~~Блокер~~ → **OK**     | ✅ [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277). `no-raw-local-storage` + `no-strict-bypass` тепер активні на `apps/mobile/src` + `apps/mobile/app`.                                                                                                                                                                                                                      |
| Type-safety bypasses (`as unknown as X`) | **Високий**             | 7 production файлів у allowlist. Усі — adapter-и між domain-shape та локальними view-model-ями (RN-specific). Migration plan: 6 — domain-alignment, 1 — Expo SDK 52 type-update.                                                                                                                                                                                                         |
| `: any` types у production               | ~~Високий~~ → **OK**    | ✅ [PR #1461](https://github.com/Skords-01/Sergeant/pull/1461). 0 production-файлів з `: any`. `TxRow.tsx` + `TxListItem.tsx` переведено на `(tx: TxRowTx) => void` (mirror веб-twin shape-а), `eslint-disable @typescript-eslint/no-explicit-any` директиви прибрано.                                                                                                                   |
| Storage migration                        | **OK** (guardrail-only) | RN не має `localStorage`; усі persist-операції через `safeReadLS`/`safeWriteLS` adapter над MMKV. Прямих `localStorage.*` у коді — 0 (усі згадки у JSDoc-коментарях, що документують web→mobile порт).                                                                                                                                                                                   |
| Cloud-sync invariants                    | **Середній**            | `useLocalStorage` ↔ `useSyncedStorage` дисципліна тримається `sergeant-design/no-raw-tracked-storage` — це окреме правило, статус OK.                                                                                                                                                                                                                                                    |
| Великі файли (>600 LOC)                  | **Середній**            | **3** production-файли >600 LOC у mobile (re-count 2026-05-13, після #1922): `fizruk/lib/dualWrite/adapter.ts` 804 (was 737), `fizruk/lib/dualWrite/diff.ts` 633 (newly over threshold), `PlanCalendar.tsx` 661 (was 616). `routine/pages/Calendar.tsx` 628 → decomposed into `pages/Calendar/` folder (P2.2b, #1922) — `index.tsx` 183 LOC. `OnboardingWizard.tsx` лишається у 390 LOC. |
| TODO/FIXME маркери                       | **Низький**             | 5 маркерів, усі типу `TODO(mobile-migration, Phase X)` / `TODO(phase-N)` — план відомий, чекає черги.                                                                                                                                                                                                                                                                                    |
| Observability (Sentry RN)                | **Середній**            | `apps/mobile/src/lib/observability.ts` готовий, `Sentry.init` гейтується `EXPO_PUBLIC_SENTRY_DSN`. Без DSN — runtime no-op. На staging/prod DSN ще не підключено. **2026-05-13:** `core/ModuleErrorBoundary.tsx` `componentDidCatch` тепер форвардить помилки через `captureError({ moduleName, source })` — TODO(phase-10) закрито.                                                     |
| Tests — Jest                             | **OK**                  | 98 test-файлів, Jest 29. Skipped/`xit`/`xdescribe` — 0. Приклад flaky tests-у не виявлено у quick-grep (детальний test-stability audit — окремий PR).                                                                                                                                                                                                                                    |
| Capacitor coverage                       | ~~Середній~~ → **OK**   | ✅ [PR #1415](https://github.com/Skords-01/Sergeant/pull/1415) + [PR #2538](https://github.com/Skords-01/Sergeant/pull/2538). `apps/mobile-shell` має 8 test-файлів включно з `boundary.test.ts` (23 тести: Web Compatibility, Native Bridge, Deep Links).                                                                                                                               |
| TypeScript-version drift                 | **Середній**            | `apps/mobile`: `typescript ~5.9.0`. `apps/web` + `apps/server`: `^6.0.3`. `tools/console`: `^5.7.2`. Mobile блокує bump через RN/Expo type compatibility — план: дочекатись Expo SDK 53.                                                                                                                                                                                                 |

---

## Type-safety bypasses

ESLint правило [`sergeant-design/no-strict-bypass`](../../packages/eslint-plugin-sergeant-design/index.js)
блокує нові `@ts-expect-error`, `@ts-ignore`, `as any`, та `as unknown as X`
у production-коді на `apps/web/src/**`, `apps/server/src/**`, та починаючи
з [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277) — `apps/mobile/src/**` + `apps/mobile/app/**`.

На момент розширення (2026-05-01) у production-коді mobile знайдено
**7 файлів** з `as unknown as X` (інших патернів — 0). Усі додані до
allowlist у [`eslint.config.js`](../../eslint.config.js); migration файла
= видалення рядка з allowlist.

| Файл                                                                           | Кількість       | Категорія                                                                                           |
| ------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/modules/finyk/pages/Overview/CategoryChartSection.tsx`        | `as unknown as` | Domain-shape adapter — `chartPaletteList` приведено до `string[]`.                                  |
| `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx`        | `as unknown as` | Snapshot → `ManualExpensePayload` для `addManualExpense`.                                           |
| `apps/mobile/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx` | `as unknown as` | Local view-model `Workout` ↔ `@sergeant/fizruk-domain.DomainWorkout`.                               |
| `apps/mobile/src/modules/fizruk/hooks/useCustomExercises.ts`                   | `as unknown as` | New-exercise-payload → `CustomExercise` (поки немає окремого `CreateExerciseInput`).                |
| `apps/mobile/src/modules/fizruk/hooks/useRecovery.ts`                          | `as unknown as` | Locally-stored workouts → `Partial<Workout>[]` для domain-recovery-helper.                          |
| `apps/mobile/src/modules/fizruk/pages/Exercise.tsx`                            | `as unknown as` | Аналогічно — `readonly DomainWorkout[]` з local snapshot.                                           |
| `apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts`                 | `as unknown as` | `Notifications.NotificationTriggerInput` (Expo SDK 52 розширило union; mobile код ще не дотягнули). |

**Fix recipes:**

- 6 з 7 — alignment локальних view-model-ів з `@sergeant/fizruk-domain` /
  `@sergeant/finyk-domain` shape-ами (зробити `Workout` (mobile) extends-сумісним з `DomainWorkout`,
  або додати explicit converter `toDomainWorkout(local: Workout): DomainWorkout`).
- 1 з 7 — `useRoutineReminders.ts`: bump `expo-notifications` types у `package.json`
  чи додати локальний type-guard для `NotificationTriggerInput` union.

Орієнтовно ~6 файлів закриваються за один тематичний PR (3-4 години). Експо-SDK
fix — окремий PR (потенційно з deps-bump).

---

## `: any` types

**Стан:** 0 production-файлів. ✅ [PR #1461](https://github.com/Skords-01/Sergeant/pull/1461)
закрив M2 — `TxRow.tsx` + `TxListItem.tsx` дзеркалять `TxRowTx` interface
з веб-twin-а byte-for-byte; `accounts: readonly MonoAccount[]`,
`txSplits: TxSplitsMap`, `customCategories: readonly CustomCategoryInput[]`,
`onPressManual` / `onSwipeDeleteManual` тепер `(tx: TxRowTx) => void`.
Директиви `eslint-disable @typescript-eslint/no-explicit-any` прибрано.

**Next:** додати `apps/mobile/src/**` до scope правила
`@typescript-eslint/no-explicit-any` у `eslint.config.js` як guardrail
(наразі активне лише для web/server) — окремий ~10-рядковий PR, не блокує.

---

## Storage / cloud-sync

### Прямі `localStorage.*` виклики

**Стан:** 0 production call-сайтів. У RN глобал `localStorage` відсутній взагалі —
будь-який прямий виклик призведе до runtime-крешу. ESLint правило
[`sergeant-design/no-raw-local-storage`](../../packages/eslint-plugin-sergeant-design/index.js)
розширене на `apps/mobile/src/**` + `apps/mobile/app/**` у [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277)
без allowlist (всі `localStorage` згадки на mobile — у JSDoc-коментарях, що
документують web→mobile порт; AST-traversal коментарі не торкається).

### MMKV adapter

`apps/mobile/src/lib/storage.ts` — primitive: `safeReadLS` / `safeReadStringLS` /
`safeWriteLS` / `safeRemoveLS`, що дзеркалить веб-API над `react-native-mmkv`
instance `id: "sergeant.mobile.v1"`.

### Cloud-sync дисципліна

`useLocalStorage` (RN-варіант) зобов'язаний викликати `enqueueChange(key)`
після кожного запису для tracked-keys із shared registry
[`packages/shared/src/sync/modules.ts`](../../packages/shared/src/sync/modules.ts)
(після PR #052c mobile-side `sync/config.ts` видалений
разом з рештою v1 engine tree — `SYNC_MODULES` тепер тільки в shared).
Альтернатива — `useSyncedStorage` обгортка, яка робить це автоматично.
ESLint правило [`sergeant-design/no-raw-tracked-storage`](../../packages/eslint-plugin-sergeant-design/index.js)
блокує `useLocalStorage` з tracked-keys поза `useSyncedStorage`. **Стан: OK** —
allowlist на 1 файл (`useSyncedStorage.ts` сам), 0 інших порушень.

---

## Великі файли (>600 LOC)

3 production-файли у `apps/mobile/` (поточний re-count 2026-05-13 через `find apps/mobile/src apps/mobile/app -name '*.ts*' ! -name '*.test.*' | xargs wc -l | sort -nr`; `OnboardingWizard` лишається декомпозованим — див. нижче):

| Файл                                                      | LOC | Пріоритет | Нотатка                                                                                                                                                                           |
| --------------------------------------------------------- | --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/modules/fizruk/lib/dualWrite/adapter.ts` | 804 | P2        | SQLite dual-write adapter (виріс із 737 за 10 днів). Розбити за operation-family (`workouts`, `dailyLog`, `templates`, `wellbeing`, `activeWorkout`) без зміни SQL/LWW semantics. |
| `apps/mobile/src/modules/fizruk/pages/PlanCalendar.tsx`   | 661 | P2        | Workout-planning календар (виріс із 616). Можна винести `PlanCalendarHeader`, `WeekRow`, `DaySheet` як sub-components.                                                            |
| `apps/mobile/src/modules/fizruk/lib/dualWrite/diff.ts`    | 633 | P2        | **Новий** >600 LOC entry (2026-05-13). Diff-utilities для fizruk dual-write — потенційно split на per-shape diff-helpers (`workoutsDiff`, `dailyLogDiff`, …).                     |

> **2026-05-13 sync (P2.2b, #1922):** `apps/mobile/src/modules/routine/pages/Calendar.tsx` (628 LOC)
> decomposed into a 13-file `pages/Calendar/` folder per the
> [`2026-05-13 mobile audit`](../audits/2026-05-13-mobile-reliability-ux-roast.md#p22--two-new-600-loc-offenders-dualwritediffts-633-routinepagescalendartsx-628):
> `index.tsx` orchestrator (183 LOC), `DayCell.tsx`, `WeekHeader.tsx`,
> `MonthGridView.tsx`, `MonthHeader.tsx`, `TimeModeSegmented.tsx`,
> `StatsPill.tsx`, `EventRow.tsx`, `GroupedEventList.tsx`,
> `useCalendarAggregates.ts` (completion-aggregator hook), `formatters.ts`,
> `constants.ts`, `types.ts`. No sub-file exceeds 200 LOC; routing imports
> (`./pages/Calendar`) are unchanged because the entry is `index.tsx`.

> **2026-05-03 sync:** `TransactionsPage.tsx` (1215 LOC, найбільший файл у репо)
> декомпозовано у [#1453](https://github.com/Skords-01/Sergeant/pull/1453) на 14
> модулів під `pages/Transactions/`: оркестратор `TransactionsPage.tsx` (523 LOC),
> `types.ts` (45 — `FilterChip`/`FeedItem`/`DayCollapseMap`/`DraftRange` +
> `BASE_FILTERS`/`DAY_COLLAPSE_KEY`), `utils.ts` (67 — date / day-key / month
> formatters + `readDayCollapse`/`isDayExpanded`), 3 хуки
> (`useDayCollapse` 51, `useCategoryFilters` 106, `useTransactionsFeed` 196) + 9
> компонентів (`TransactionsHeader` 91, `TransactionsSearchBar` 44,
> `TransactionsFilterChips` 143, `TransactionsEmptyState` 49,
> `TransactionsFeedItem` 120, `AccountFilterSheet` 88, `DateRangeFilterSheet` 92,
> `CategoryFilterSheet` 108, `BankActionsSheet` 64). Усі ≤ 523 LOC. Існуючі
> 30/30 тестів `TransactionsPage.test.tsx` пройшли без правок — поведінкова
> парність підтверджена.

> **2026-05-03 sync:** `CelebrationModal.tsx` (671 LOC) декомпозовано у
> [#1465](https://github.com/Skords-01/Sergeant/pull/1465) на 6 модулів у
> `apps/mobile/src/components/ui/CelebrationModal/`: оркестратор
> `CelebrationModal.tsx` (297 LOC) + `confetti/` sub-package + `haptics.ts`
>
> - `hooks/` + `constants.ts` + `types.ts` + `index.ts`. Lazy-import анімаційних
>   утиліт залишається як подальша оптимізація — не блокер.
>
> **2026-05-12 sync:** `OnboardingWizard.tsx` повторно виріс до 805 LOC і був
> декомпозований до 390 LOC. Оркестратор лишив public API (`OnboardingWizard`,
> `OnboardingWizardProps`, `OnboardingFinishOptions`, `getOnboardingStore`), а
> state/reducer, reduce-motion hook, step indicator, welcome/modules/goals UI
> і спільні style helpers винесено у `apps/mobile/src/core/onboarding/`.
> P2 для цього файла знову закрито; regression coverage — `OnboardingWizard.test.tsx`.

**Fix recipe (наступні файли — P2):** наслідувати модель з
[#1453](https://github.com/Skords-01/Sergeant/pull/1453) — pure utils →
`utils.ts` / типи + константи → `types.ts` / state-derivation → `hooks/*.ts` /
presentational pieces → `components/*.tsx`. Орекстратор тримає state і
компоновку, всі дочірні модулі — pure props-in / callbacks-out.

---

## TODO/FIXME маркери

5 маркерів у `apps/mobile/src` (не-test). Всі — план міграції, не bug-fix:

| Файл                                                         | Маркер                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `apps/mobile/src/core/settings/NotificationsSection.tsx:239` | `{/* TODO(mobile-migration, Phase 6): wire to useMonthlyPlan once … */}`   |
| `apps/mobile/src/core/settings/RoutineSection.tsx:28`        | `// TODO(mobile-migration): swap for the canonical routine-module storage` |

**2026-05-13 update:** `core/ModuleErrorBoundary.tsx` TODO(phase-10) закрито у роасті `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` — `componentDidCatch` тепер форвардить через `captureError`. `ExperimentalSection.tsx` markers щезли у попередньому settings sweep — реальний quick-grep видає тільки 2 живих TODO. `AI-LEGACY:` маркерів — 0. `FIXME` / `HACK` / `XXX` — 0.

---

## Observability — Sentry RN

`apps/mobile/src/lib/observability.ts` (Phase 12 scaffold):

- `initObservability()` — гейтується `EXPO_PUBLIC_SENTRY_DSN` через
  `apps/mobile/src/lib/observability/env.ts:getSentryDsn()`. Без DSN —
  лог `"[observability] sentry disabled (no DSN)"` і ранній return.
- `captureError(error, context?)` — wrap навколо `Sentry.captureException`,
  не дає Sentry зламати host-app (try/catch + console.error fallback).
- Ідемпотентний (`Sentry.init` не викликається повторно).
- Покрито Jest-тестом `apps/mobile/src/lib/observability.test.ts`
  (mock `@sentry/react-native` та `getSentryDsn`, перевірка обох гілок).

**Стан P1 (operational):** на staging/prod DSN ще **не** виставлено →
помилки не агрегуються в Sentry. Розблокування: створити DSN-проект у
Sentry для mobile та виставити `EXPO_PUBLIC_SENTRY_DSN` у Expo build secrets
(Expo EAS Secrets або CI env). Жодного коду більше дописувати не треба —
Phase 12 scaffold уже готовий.

`apps/mobile/src/core/ModuleErrorBoundary.tsx` TODO(phase-10) — **closed**
2026-05-13. `componentDidCatch` тепер викликає `captureError(error, { moduleName, source: "mobile.ModuleErrorBoundary" })` через `@/lib/observability`. До провіжнінгу DSN це лишається лог-у-консоль (як і раніше), але код-сайт уже готовий — DSN-PR більше не вимагає правок цього файла.

---

## Observability — PostHog Mobile

`apps/mobile/src/lib/observability/posthog.ts` (PR-15 parity):

- `initPostHog()` — гейтується `EXPO_PUBLIC_POSTHOG_KEY` через
  `apps/mobile/src/lib/observability/posthogEnv.ts:getPostHogKey()`. Без key —
  повний no-op (жодного fetch, жодного MMKV write).
- `capturePostHogEvent(name, payload)` — fire-and-forget. Події до завершення
  init буферизуються (до `MAX_QUEUE = 100`), після — летять напряму у HTTP
  `/capture/` endpoint.
- `identifyPostHogUser(userId, traits)` / `resetPostHog()` — wired через
  `AnalyticsIdentityBridge` + `IdentityBridge` при login/logout.
- Super-properties: `platform` (iOS/Android), `is_capacitor: false`, `is_expo: true`.
- Покрито Jest-тестом `apps/mobile/src/lib/__tests__/posthog.test.ts`
  (10 тестів: no-op гейт, buffering, identify stitch, reset).

**Стан (2026-05-07):** код готовий. Для активації потрібно лише виставити
`EXPO_PUBLIC_POSTHOG_KEY` у Expo EAS Secrets (той самий project key, що й
`VITE_POSTHOG_KEY` для web). Опційно `EXPO_PUBLIC_POSTHOG_HOST` (default:
`https://eu.i.posthog.com`).

---

## Tests — coverage & flakiness

- **111 test-файлів** у `apps/mobile` (Jest 29 + `jest-expo` preset).
- **Skipped tests:** 0 (`grep '\b(it|test|describe)\.skip\b\|\b(xit|xdescribe|xtest)\b'` → 0 matches).
- **`AI-LEGACY:` у тестах:** 0.

Detailed test-stability audit (timing-sensitive, snapshot-drift) — окремий PR.
Quick-grep flaky-індикаторів (`flaky`, `unstable`, `retries`, `setTimeout` всередині
`it`) виявив 2 файли, що використовують `jest.useFakeTimers()` — це норма для
hook-тестів з `useEffect` cleanup, не сигнал flaky.

**T7 verification gate ([sprint-roadmap §1.1](../planning/sprint-roadmap-q2q3-2026.md#11-tech-борг)).**
Гіпотеза «mobile suite є flaky через `isReduceMotionEnabled` mock» закрита у
PR [#2453](https://github.com/Skords-01/Sergeant/pull/2453) (commit
[`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00) для
OnboardingWizard + [`f11c1f49`](https://github.com/Skords-01/Sergeant/commit/f11c1f49)
для WeeklyDigestFooter / HubSettingsPage). Verification:
[`.github/workflows/mobile-flaky-verify.yml`](../../.github/workflows/mobile-flaky-verify.yml)
— manual `workflow_dispatch` (+weekly cron) job, який гонить `pnpm --filter
@sergeant/mobile test` 20 разів поспіль і фейлить на першій помилці. Baseline-rule:
20/20 green поспіль за останній місяць → знімаємо flag «⏳ Очікує 20-run CI verification»
з roadmap-у. Якщо < 20/20 — fail-rate (X/20) логується у цьому файлі як baseline
і застосовуємо OnboardingWizard fix-pattern (`mockResolvedValue(false)` замість
never-resolving Promise).

| Дата      | Run number | Result | Notes                                                                                                                               |
| --------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| _pending_ | —          | —      | Initial 20-run baseline ще не запускалось. Після merge T7 PR — actions → «Mobile flaky-tests verification (20-run)» → Run workflow. |

---

## Capacitor (`apps/mobile-shell`) — coverage

`apps/mobile-shell/` — Capacitor 7 wrapper навколо `apps/web` (build glue,
не app-код). Тести (Vitest):

- `src/__tests__/deepLinkBridge.test.ts`
- `src/__tests__/parseDeepLink.test.ts`
- `src/platform.test.ts`
- `src/index.test.ts`
- `src/auth-storage.test.ts`

**5 тестових файлів — лише unit.** Boundary-/integration-тестів для
нативних мостів (`pushNative.ts`, `barcodeNative.ts`) — 0. Це **середній**
борг: нативні мости тестуються лише ручним сценарієм на пристрої. Можна
додати mock-плагіни Capacitor + integration-тест на JS-API контракт.

---

## TypeScript-version drift

| App / Package       | TypeScript version |
| ------------------- | ------------------ |
| `apps/web`          | `^6.0.3`           |
| `apps/server`       | `^6.0.3`           |
| `apps/mobile`       | `~5.9.0`           |
| `tools/openclaw`    | `^5.7.2`           |
| `apps/mobile-shell` | (наслідує root)    |

Web/server рухаються на bleeding-edge TS 6, mobile тримається на 5.9 (RN/Expo
type-compatibility), console відстає до 5.7. Дрифт сам по собі не блокер
(кожен app компілює власні типи окремо), але:

- `@sergeant/shared`, `@sergeant/api-client`, `@sergeant/{finyk,fizruk,nutrition,routine}-domain` —
  імпортуються mobile + web/server, тож код shared-пакетів **не** може
  використовувати TS 6-only фічі без conditional-types-fallback на 5.9.
- Phase-up план: дочекатись Expo SDK 53 (де RN типи синхронізують з TS 6),
  одночасно бампнути mobile + console до `^6.x`.

---

## Roadmap — PR breakdown

| #   | PR                                                 | Скоуп                                                                                                  | Estimate  | Status                                                                                             |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------- |
| M1  | Mobile ESLint guardrail-extension                  | `eslint.config.js`: scope `no-raw-local-storage` + `no-strict-bypass` на mobile, 7 файлів в allowlist. | done      | ✅ [#1277](https://github.com/Skords-01/Sergeant/pull/1277)                                        |
| M2  | Mobile `: any` cleanup                             | `TxRow.tsx` + `TxListItem.tsx`: `any` → `TxRowTx` (mirror веб-twin shape-а).                           | XS (0.5h) | done — ✅ [#1461](https://github.com/Skords-01/Sergeant/pull/1461)                                 |
| M3  | Domain-shape alignment fizruk × 4                  | `WorkoutJournalSection`, `useCustomExercises`, `useRecovery`, `Exercise` — drop `as unknown as`.       | M (3-4h)  | TODO                                                                                               |
| M4  | Domain-shape alignment finyk × 2                   | `CategoryChartSection`, `TransactionsPage` (snapshot adapter).                                         | S (1-2h)  | TODO (snapshot-adapter залишається після [#1453](https://github.com/Skords-01/Sergeant/pull/1453)) |
| M5  | `expo-notifications` SDK 52 type alignment         | `useRoutineReminders.ts` — drop `as unknown as Notifications.NotificationTriggerInput`.                | S (1h)    | done — drop cast, build typed `WeeklyTriggerInput` inline (PR pending)                             |
| M6  | Decompose `TransactionsPage.tsx` (1215 LOC)        | Mirror web's `pages/transactions/**` split.                                                            | L (1d)    | done — ✅ [#1453](https://github.com/Skords-01/Sergeant/pull/1453)                                 |
| M6b | Decompose `CelebrationModal.tsx` (671 LOC)         | Розбити на orchestrator + `confetti/` + `haptics.ts` + `hooks/` + `constants.ts` + `types.ts`.         | M (3-4h)  | done — ✅ [#1465](https://github.com/Skords-01/Sergeant/pull/1465)                                 |
| M7  | Sentry RN DSN provisioning                         | Створити Sentry project, виставити `EXPO_PUBLIC_SENTRY_DSN` в Expo EAS Secrets.                        | XS (0.5h) | TODO (code-sites ready — `ModuleErrorBoundary` forwarding closed 2026-05-13)                       |
| M8  | Capacitor native-bridge integration tests          | Mock Capacitor plugins + JS-API контракт-тести для `pushNative`, `barcodeNative`.                      | M (3-4h)  | ✅ done — [PR #2538](https://github.com/Skords-01/Sergeant/pull/2538) (23 boundary tests)          |
| M9  | TS 6 bump для mobile + console (після Expo SDK 53) | `apps/mobile`, `tools/console` → `^6.x`.                                                               | M-L       | BLOCKED on Expo SDK 53                                                                             |

Кожен PR — ізольований, тестується окремо `pnpm lint` + (де доречно)
`pnpm --filter @sergeant/mobile test`.

---

## Status log

- **2026-05-01:** Перша версія registry. ESLint guardrail-extension на mobile
  ([#1277](https://github.com/Skords-01/Sergeant/pull/1277)). Inventory
  верифіковано grep-ом + ESLint dry-run на свіжому `main`.
- **2026-05-03:** [#1453](https://github.com/Skords-01/Sergeant/pull/1453)
  декомпозував `TransactionsPage.tsx` (1215 LOC, найбільший файл у репо) на 14
  модулів у `pages/Transactions/` (оркестратор 523 LOC + types/utils + 3 хуки +
  9 компонентів). M6 → done. Великі файли (>600 LOC) на mobile: 5 → 4.
- **2026-05-03:** [#1461](https://github.com/Skords-01/Sergeant/pull/1461)
  закрив M2 — `TxRow.tsx` + `TxListItem.tsx` `any` → `TxRowTx` (mirror
  веб-twin shape-а), `eslint-disable @typescript-eslint/no-explicit-any`
  директиви прибрано. `: any` у production — 0.
- **2026-05-03:** [#1465](https://github.com/Skords-01/Sergeant/pull/1465)
  декомпозував `CelebrationModal.tsx` (671 LOC) на 6 модулів у
  `components/ui/CelebrationModal/` (оркестратор 297 LOC + `confetti/` + `haptics.ts` +
  `hooks/` + `constants.ts` + `types.ts` + `index.ts`). Великі файли (>600 LOC) на mobile: 4 → 3.
- **2026-05-03:** [#1467](https://github.com/Skords-01/Sergeant/pull/1467)
  (unified KVStore) побічно стоншив `OnboardingWizard.tsx` 623 → 593 LOC
  (12 insertions / 42 deletions), що відсунуло файл під поріг 600.
  Великі файли (>600 LOC) на mobile: 3 → 2.
- **2026-05-12:** mobile onboarding burn-down — `OnboardingWizard.tsx` 805 → 390 LOC,
  extracted `wizardState`, `useReduceMotion`, `StepIndicator`, `WelcomeStep`,
  `ModulesStep`, `GoalsStep`, and shared style helpers under `core/onboarding`.
  Re-count shows 2 current >600 files: `fizruk/lib/dualWrite/adapter.ts` 737 and
  `fizruk/pages/PlanCalendar.tsx` 616.
- **2026-05-06:** M5 closeout — `apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts`
  більше не кастить трігер через `as unknown as Notifications.NotificationTriggerInput`.
  Hook будує типізований `WeeklyTriggerInput` inline з
  `Notifications.SchedulableTriggerInputTypes.WEEKLY` поверх Expo-agnostic
  `{weekday, hour, minute}` shape, який тепер повертає
  `computeTriggerForHabitWeekday` (раніше включав некоректний
  `repeats: true` — це поле є тільки у `TimeIntervalTriggerInput`, не у
  `WeeklyTriggerInput`). Mobile hook + routine-domain тести оновлено.
