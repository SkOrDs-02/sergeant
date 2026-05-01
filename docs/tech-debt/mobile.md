# Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor)

> **Last validated:** 2026-05-01 by @devin-ai-integration[bot]. **Next review:** 2026-07-30.
> **Status:** Active

> **Оновлено 2026-05-01.** Перша версія registry: інвентаризація mobile-частини
> монорепо, що раніше трекалась лише фрагментарно у `frontend.md` та audit-у
> `docs/audits/2026-04-28-sergeant-comprehensive-audit.md`. Цей файл — living
> burndown для `apps/mobile/**` (Expo 52 + RN 0.76) та `apps/mobile-shell/**`
> (Capacitor wrapper навколо `apps/web`).

> Scope: **`apps/mobile/`** (Expo 52, React Native 0.76, NativeWind, MMKV, Jest 29)
> та **`apps/mobile-shell/`** (Capacitor 6 wrapper + Vitest unit tests).
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

| Категорія                                | Статус                  | Короткий висновок                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint guardrails                        | ~~Блокер~~ → **OK**     | ✅ [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277). `no-raw-local-storage` + `no-strict-bypass` тепер активні на `apps/mobile/src` + `apps/mobile/app`.                                    |
| Type-safety bypasses (`as unknown as X`) | **Високий**             | 7 production файлів у allowlist. Усі — adapter-и між domain-shape та локальними view-model-ями (RN-specific). Migration plan: 6 — domain-alignment, 1 — Expo SDK 52 type-update.                       |
| `: any` types у production               | **Високий**             | 2 production файли (`TxRow.tsx`, `TxListItem.tsx`) — `any` на pressable handler-ах. Заміна на `GestureResponderEvent` тривіальна.                                                                      |
| Storage migration                        | **OK** (guardrail-only) | RN не має `localStorage`; усі persist-операції через `safeReadLS`/`safeWriteLS` adapter над MMKV. Прямих `localStorage.*` у коді — 0 (усі згадки у JSDoc-коментарях, що документують web→mobile порт). |
| Cloud-sync invariants                    | **Середній**            | `useLocalStorage` ↔ `useSyncedStorage` дисципліна тримається `sergeant-design/no-raw-tracked-storage` — це окреме правило, статус OK.                                                                  |
| Великі файли (>600 LOC)                  | **Середній**            | 5 production-файлів >600 LOC у mobile (`TransactionsPage` 1215, `CelebrationModal` 671, `PlanCalendar` 670, `Calendar` 628, `OnboardingWizard` 623). `TransactionsPage` — пріоритет 1.                 |
| TODO/FIXME маркери                       | **Низький**             | 5 маркерів, усі типу `TODO(mobile-migration, Phase X)` / `TODO(phase-N)` — план відомий, чекає черги.                                                                                                  |
| Observability (Sentry RN)                | **Середній**            | `apps/mobile/src/lib/observability.ts` готовий, `Sentry.init` гейтується `EXPO_PUBLIC_SENTRY_DSN`. Без DSN — runtime no-op. На staging/prod DSN ще не підключено.                                      |
| Tests — Jest                             | **OK**                  | 94 test-файли, Jest 29. Skipped/`xit`/`xdescribe` — 0. Приклад flaky tests-у не виявлено у quick-grep (детальний test-stability audit — окремий PR).                                                   |
| Capacitor coverage                       | **Середній**            | `apps/mobile-shell` має 5 unit-тестів (deepLink, parseDeepLink, platform, index, auth-storage). Boundary-/integration-тестів для нативних мостів (`pushNative`, `barcodeNative`) — 0.                  |
| TypeScript-version drift                 | **Середній**            | `apps/mobile`: `typescript ~5.9.0`. `apps/web` + `apps/server`: `^6.0.3`. `apps/console`: `^5.7.2`. Mobile блокує bump через RN/Expo type compatibility — план: дочекатись Expo SDK 53.                |

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

Всупереч web (де `: any` у production давно обнуляли), mobile має 2 production-файли
з `: any` на event-handler-ах:

| Файл                                                      | Контекст                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/mobile/src/modules/finyk/components/TxRow.tsx`      | `onPress`/`onLongPress` callback аргументи типізовані як `any`. |
| `apps/mobile/src/modules/finyk/components/TxListItem.tsx` | Аналогічно — pressable callbacks.                               |

**Fix recipe:** заміна на `GestureResponderEvent` із `react-native` (стандартний RN тип).
Тривіальний PR, ~10 рядків. Після фіксу можна додати `apps/mobile/src/**` до
загального scope правила `@typescript-eslint/no-explicit-any` (зараз він уже
у конфігу для web/server, але mobile додано допоміжно).

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
після кожного запису для tracked-keys у `apps/mobile/src/sync/config.ts`.
Альтернатива — `useSyncedStorage` обгортка, яка робить це автоматично.
ESLint правило [`sergeant-design/no-raw-tracked-storage`](../../packages/eslint-plugin-sergeant-design/index.js)
блокує `useLocalStorage` з tracked-keys поза `useSyncedStorage`. **Стан: OK** —
allowlist на 1 файл (`useSyncedStorage.ts` сам), 0 інших порушень.

---

## Великі файли (>600 LOC)

5 production-файлів у `apps/mobile/`:

| Файл                                                                    | LOC  | Пріоритет | Нотатка                                                                                                                   |
| ----------------------------------------------------------------------- | ---- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx` | 1215 | **P1**    | Mobile port web-`Transactions.tsx` (767 LOC). Web уже декомпозовано (sub-pages); mobile повторює стару моноліт-структуру. |
| `apps/mobile/src/components/ui/CelebrationModal.tsx`                    | 671  | P2        | Конфетті/анімаційний модал. Декомпозиція + lazy-import анімаційних утиліт.                                                |
| `apps/mobile/src/modules/fizruk/pages/PlanCalendar.tsx`                 | 670  | P2        | Workout-planning календар. Можна винести `PlanCalendarHeader`, `WeekRow`, `DaySheet` як sub-components.                   |
| `apps/mobile/src/modules/routine/pages/Calendar.tsx`                    | 628  | P2        | Routine-calendar. Аналогічно — header + day-cell винести.                                                                 |
| `apps/mobile/src/core/OnboardingWizard.tsx`                             | 623  | P2        | Mobile port web-`OnboardingWizard.tsx` (965 LOC). Структура крок-за-кроком — кожен крок як окремий компонент.             |

**Fix recipe (P1 — TransactionsPage):** повторити декомпозицію вже зробленого
вебу — `pages/transactions/{TransactionsHeader, TransactionList, TransactionsBatchToolbar, useTransactionFilters, useTransactionSelection}.tsx`.
~1 день.

---

## TODO/FIXME маркери

5 маркерів у `apps/mobile/src` (не-test). Всі — план міграції, не bug-fix:

| Файл                                                         | Маркер                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `apps/mobile/src/core/settings/ExperimentalSection.tsx:31`   | `// TODO(mobile-migration): replace with a shared FLAG_REGISTRY once …`    |
| `apps/mobile/src/core/settings/ExperimentalSection.tsx:53`   | `// envelope). See TODO above.`                                            |
| `apps/mobile/src/core/settings/NotificationsSection.tsx:239` | `{/* TODO(mobile-migration, Phase 6): wire to useMonthlyPlan once … */}`   |
| `apps/mobile/src/core/settings/RoutineSection.tsx:28`        | `// TODO(mobile-migration): swap for the canonical routine-module storage` |
| `apps/mobile/src/core/ModuleErrorBoundary.tsx:232`           | `// TODO(phase-10): forward via @sentry/react-native once mobile …`        |

`AI-LEGACY:` маркерів — 0. `FIXME` / `HACK` / `XXX` — 0.

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

`apps/mobile/src/core/ModuleErrorBoundary.tsx:232` має `TODO(phase-10)`
forward-error у Sentry — закривається тим самим DSN-PR (одна додаткова
змінна, не код).

---

## Tests — coverage & flakiness

- **94 test-файли** у `apps/mobile` (Jest 29 + `jest-expo` preset).
- **Skipped tests:** 0 (`grep '\b(it|test|describe)\.skip\b\|\b(xit|xdescribe|xtest)\b'` → 0 matches).
- **`AI-LEGACY:` у тестах:** 0.

Detailed test-stability audit (timing-sensitive, snapshot-drift) — окремий PR.
Quick-grep flaky-індикаторів (`flaky`, `unstable`, `retries`, `setTimeout` всередині
`it`) виявив 2 файли, що використовують `jest.useFakeTimers()` — це норма для
hook-тестів з `useEffect` cleanup, не сигнал flaky.

---

## Capacitor (`apps/mobile-shell`) — coverage

`apps/mobile-shell/` — Capacitor 6 wrapper навколо `apps/web` (build glue,
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
| `apps/console`      | `^5.7.2`           |
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

| #   | PR                                                 | Скоуп                                                                                                  | Estimate  | Status                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------- |
| M1  | Mobile ESLint guardrail-extension                  | `eslint.config.js`: scope `no-raw-local-storage` + `no-strict-bypass` на mobile, 7 файлів в allowlist. | done      | ✅ [#1277](https://github.com/Skords-01/Sergeant/pull/1277) |
| M2  | Mobile `: any` cleanup                             | `TxRow.tsx` + `TxListItem.tsx`: `any` → `GestureResponderEvent`.                                       | XS (0.5h) | TODO                                                        |
| M3  | Domain-shape alignment fizruk × 4                  | `WorkoutJournalSection`, `useCustomExercises`, `useRecovery`, `Exercise` — drop `as unknown as`.       | M (3-4h)  | TODO                                                        |
| M4  | Domain-shape alignment finyk × 2                   | `CategoryChartSection`, `TransactionsPage` (snapshot adapter).                                         | S (1-2h)  | TODO                                                        |
| M5  | `expo-notifications` SDK 52 type alignment         | `useRoutineReminders.ts` — drop `as unknown as Notifications.NotificationTriggerInput`.                | S (1h)    | TODO                                                        |
| M6  | Decompose `TransactionsPage.tsx` (1215 LOC)        | Mirror web's `pages/transactions/**` split.                                                            | L (1d)    | TODO                                                        |
| M7  | Sentry RN DSN provisioning                         | Створити Sentry project, виставити `EXPO_PUBLIC_SENTRY_DSN` в Expo EAS Secrets.                        | XS (0.5h) | TODO                                                        |
| M8  | Capacitor native-bridge integration tests          | Mock Capacitor plugins + JS-API контракт-тести для `pushNative`, `barcodeNative`.                      | M (3-4h)  | TODO                                                        |
| M9  | TS 6 bump для mobile + console (після Expo SDK 53) | `apps/mobile`, `apps/console` → `^6.x`.                                                                | M-L       | BLOCKED on Expo SDK 53                                      |

Кожен PR — ізольований, тестується окремо `pnpm lint` + (де доречно)
`pnpm --filter @sergeant/mobile test`.

---

## Status log

- **2026-05-01:** Перша версія registry. ESLint guardrail-extension на mobile
  ([#1277](https://github.com/Skords-01/Sergeant/pull/1277)). Inventory
  верифіковано grep-ом + ESLint dry-run на свіжому `main`.
