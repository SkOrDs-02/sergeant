# Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor)

> **Last validated:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-10-18.
> **Status:** Active

> **Оновлено 2026-07-20.** Re-audit: **0** production files над 600 **effective** LOC (Hard Rule #18 на mobile не enforced як web/server, але inventory тримаємо). Raw >600 monitor: `routine/lib/sqliteWriter/adapter.ts` 735/~597, `nutrition/lib/sqliteWriter/adapter.ts` 636/~533, `core/dashboard/HubDashboard.tsx` 604/~481. Type-bypass allowlist **порожній** (0 `as unknown as` у production). Test-файлів: **148** (mobile) + **11** (mobile-shell). Live TODO: NotificationsSection, RoutineSection, useChatSend Phase 8, HubReports billing/export. Coverage floor lines = **30** (`coverage-thresholds.json`). Expo лишається **52** / RN **0.76.9**; M9 SDK 53 — dep-blocked.
>
> **Оновлено 2026-06-04.** PR [#3363](https://github.com/Skords-01/Sergeant/pull/3363) закрив adapter/PlanCalendar; **2026-06-15:** `diff.ts` декомпозовано → лічильник >600 eff **0**.

> **Оновлено 2026-05-15 (code-debt audit annex).** Monorepo-wide code-debt scan (Claude Opus 4.7 external session). **One new item not in the §6 TODO/FIXME table:** `apps/mobile/src/core/hub/useChatSend.ts:144` — `Mobile hub-context — TODO Phase 8` (NEW, not previously tracked alongside `NotificationsSection.tsx:239` and `RoutineSection.tsx:28` which are already enumerated). Phase 8 unlock залежить від hub-context wiring у mobile; рекомендована категорія — Phase 8 mobile-migration row у §11 Roadmap.

> **Оновлено 2026-05-13 (roast #10).** Registry revalidated alongside `docs/90-work/audits/2026-05-13-mobile-reliability-ux-roast.md`:
> ModuleErrorBoundary TODO(phase-10) closed — `componentDidCatch` now forwards via `captureError` (no DSN required for the call itself; gating remains inside `lib/observability.ts`). `useRoutineReminders.ts` no longer holds a stale entry in the mobile `no-strict-bypass` allowlist. Large-file inventory drifted: `fizruk/lib/dualWrite/adapter.ts` 737 → 804 (+67), `PlanCalendar.tsx` 616 → 661 (+45), plus two newly-over-600 files — `fizruk/lib/dualWrite/diff.ts` 633 and `routine/pages/Calendar.tsx` 628.
>
> **Оновлено 2026-05-13 (roast #10 follow-up).** Видалено dead-code файл `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` (206 LOC) — audit roast P2.1 ✅ closed. Pre-flight `grep -rn "modules/shared/ModuleErrorBoundary\|shared/ModuleErrorBoundary" apps/mobile` → 0; `grep -rn 'require\.context\|import(".*ModuleErrorBoundary' apps/mobile` → 0. Єдиним живим пер-модульним боундарі залишається `apps/mobile/src/core/ModuleErrorBoundary.tsx`.
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
> `docs/90-work/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`. Цей файл — living
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
> перевіряє [`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs)
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

| Категорія                                | Статус                  | Короткий висновок                                                                                                                                                   |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint guardrails                        | ~~Блокер~~ → **OK**     | ✅ [PR #1277](https://github.com/Skords-01/Sergeant/pull/1277). `no-raw-local-storage` + `no-strict-bypass` тепер активні на `apps/mobile/src` + `apps/mobile/app`. |
| Type-safety bypasses (`as unknown as X`) | ~~Високий~~ → **OK**    | ✅ Allowlist порожній (M3–M5 done). Production `as unknown as` = 0 (лише JSDoc згадки).                                                                             |
| `: any` types у production               | ~~Високий~~ → **OK**    | ✅ [PR #1461](https://github.com/Skords-01/Sergeant/pull/1461). 0 production-файлів з `: any`.                                                                      |
| Storage migration                        | **OK** (guardrail-only) | RN не має `localStorage`; усі persist через MMKV adapter.                                                                                                           |
| Cloud-sync invariants                    | **OK**                  | `no-raw-tracked-storage` OK.                                                                                                                                        |
| Великі файли (>600 LOC)                  | **Низький / monitor**   | **0** files >600 **effective** LOC. Raw>600 monitor: sqliteWriter adapters + HubDashboard (див. §5).                                                                |
| TODO/FIXME маркери                       | **Низький**             | ~6 live markers (settings Phase 6, hub Phase 8, HubReports billing/export) — план відомий.                                                                          |
| Observability (Sentry RN)                | **Середній**            | Code ready; DSN provisioning — M7 `external-infra`.                                                                                                                 |
| Tests — Jest                             | **OK**                  | **148** test-файлів. Skipped/`xit` — 0. Coverage floor lines **30**.                                                                                                |
| Capacitor coverage                       | **OK**                  | **11** test-файлів у `apps/mobile-shell` (boundary + native bridge supplements).                                                                                    |
| TypeScript-version drift                 | **OK**                  | `~6.0.3` aligned. Expo SDK 52→53 — M9 `dep-blocked`.                                                                                                                |

---

## Type-safety bypasses

ESLint правило [`sergeant-design/no-strict-bypass`](../../../packages/eslint-plugin-sergeant-design/index.js)
блокує нові `@ts-expect-error`, `@ts-ignore`, `as any`, та `as unknown as X`
у production-коді на `apps/mobile/src/**` + `apps/mobile/app/**`
([PR #1277](https://github.com/Skords-01/Sergeant/pull/1277)).

**Стан 2026-07-20:** allowlist у `eslint.mobile.js` **порожній**; production
`as unknown as` = **0** (M3/M4/M5 closed). Нові bypasses падають на lint.
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
[`sergeant-design/no-raw-local-storage`](../../../packages/eslint-plugin-sergeant-design/index.js)
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
[`packages/shared/src/sync/modules.ts`](../../../packages/shared/src/sync/modules.ts)
(після PR #052c mobile-side `sync/config.ts` видалений
разом з рештою v1 engine tree — `SYNC_MODULES` тепер тільки в shared).
Альтернатива — `useSyncedStorage` обгортка, яка робить це автоматично.
ESLint правило [`sergeant-design/no-raw-tracked-storage`](../../../packages/eslint-plugin-sergeant-design/index.js)
блокує `useLocalStorage` з tracked-keys поза `useSyncedStorage`. **Стан: OK** —
allowlist на 1 файл (`useSyncedStorage.ts` сам), 0 інших порушень.

---

## Великі файли (>600 LOC)

**0** production-файлів >600 **effective** LOC у `apps/mobile/` (re-audit 2026-07-20).
`max-lines` Hard Rule #18 на mobile **не** enforced (web/server only); inventory —
для visibility. Raw >600 monitor:

| Файл                                            | raw / eff  | Нотатка               |
| ----------------------------------------------- | ---------- | --------------------- |
| `modules/routine/lib/sqliteWriter/adapter.ts`   | 735 / ~597 | Monitor (headroom ~3) |
| `modules/nutrition/lib/sqliteWriter/adapter.ts` | 636 / ~533 | Monitor               |
| `core/dashboard/HubDashboard.tsx`               | 604 / ~481 | Monitor               |

Історично закриті: `adapter.ts` / `PlanCalendar` (#3363), `diff.ts` → `diff/`,
`Calendar.tsx` → `pages/Calendar/` (#2780), `TransactionsPage` (#1453),
`CelebrationModal` (#1465), `OnboardingWizard` → 390 LOC.
---

## TODO/FIXME маркери

Live markers у `apps/mobile/src` (не-test), re-audit 2026-07-20:

| Файл                                     | Маркер                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `core/settings/NotificationsSection.tsx` | `TODO(mobile-migration, Phase 6): wire to useMonthlyPlan`           |
| `core/settings/RoutineSection.tsx`       | `TODO(mobile-migration): swap for canonical routine-module storage` |
| `core/hub/useChatSend.ts`                | `TODO Phase 8` — mobile hub-context                                 |
| `core/hub/HubReports.tsx`                | `TODO(billing)` + `TODO(H4)` WeeklyDigestCard                       |
| `core/hub/reports/exportReport.ts`       | `TODO(export): expo-print`                                          |

`AI-LEGACY:` / `FIXME` / `HACK` / `XXX` — 0. ModuleErrorBoundary TODO(phase-10) — closed.
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

- **148 test-файлів** у `apps/mobile` (Jest 29 + `jest-expo` preset; re-audit 2026-07-20).
- **Coverage floor:** lines **30** (`coverage-thresholds.json`).
- **Skipped tests:** 0.
- **`AI-LEGACY:` у тестах:** 0.

Detailed test-stability audit (timing-sensitive, snapshot-drift) — окремий PR.
Quick-grep flaky-індикаторів (`flaky`, `unstable`, `retries`, `setTimeout` всередині
`it`) виявив 2 файли, що використовують `jest.useFakeTimers()` — це норма для
hook-тестів з `useEffect` cleanup, не сигнал flaky.

**T7 verification gate ([sprint-roadmap §1.1](../planning/archive/sprint-roadmap-q2q3-2026.md#11-tech-борг)).**
Гіпотеза «mobile suite є flaky через `isReduceMotionEnabled` mock» закрита у
PR [#2453](https://github.com/Skords-01/Sergeant/pull/2453) (commit
[`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00) для
OnboardingWizard + [`f11c1f49`](https://github.com/Skords-01/Sergeant/commit/f11c1f49)
для WeeklyDigestFooter / HubSettingsPage). Verification:
[`.github/workflows/mobile-flaky-verify.yml`](../../../.github/workflows/mobile-flaky-verify.yml)
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
не app-код). Тести (Vitest), re-audit 2026-07-20 — **11** файлів:

- `src/__tests__/boundary.test.ts`, `deepLinkBridge.test.ts`, `parseDeepLink.test.ts`
- `src/platform.test.ts`, `src/index.test.ts`, `src/auth-storage.test.ts` (+ supplement)
- `src/barcodeNative.test.ts` (+ supplement), `src/pushNative.test.ts` (+ supplement)

✅ [PR #1415](https://github.com/Skords-01/Sergeant/pull/1415) + [PR #2538](https://github.com/Skords-01/Sergeant/pull/2538)
(boundary / native-bridge coverage). M8 — done.
---

## TypeScript-version drift

| App / Package              | TypeScript version |
| -------------------------- | ------------------ |
| `apps/web`                 | `^6.0.3`           |
| `apps/server`              | `^6.0.3`           |
| `apps/mobile`              | `~6.0.3`           |
| `packages/openclaw-plugin` | `^6.0.3` (inherit) |
| `apps/mobile-shell`        | (наслідує root)    |

Monorepo на TS 6.x (Hard Rule #19). Historical `tools/openclaw` workspace видалено — OpenClaw surface = external gateway + `packages/openclaw-plugin` (ADR-0055).

Залишковий platform drift — **Expo SDK 52 → 53** (не TypeScript): див. ADR-0063 і roadmap M9 нижче.

---

## Roadmap — PR breakdown

| #   | PR                                          | Скоуп                                                                                                  | Estimate  | Status                                                                                                                                                                          |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Mobile ESLint guardrail-extension           | `eslint.config.js`: scope `no-raw-local-storage` + `no-strict-bypass` на mobile, 7 файлів в allowlist. | done      | ✅ [#1277](https://github.com/Skords-01/Sergeant/pull/1277)                                                                                                                     |
| M2  | Mobile `: any` cleanup                      | `TxRow.tsx` + `TxListItem.tsx`: `any` → `TxRowTx` (mirror веб-twin shape-а).                           | XS (0.5h) | done — ✅ [#1461](https://github.com/Skords-01/Sergeant/pull/1461)                                                                                                              |
| M3  | Domain-shape alignment fizruk × 4           | `WorkoutJournalSection`, `useCustomExercises`, `useRecovery`, `Exercise` — drop `as unknown as`.       | M (3-4h)  | done 2026-05-15 (PR-03: journal selectors widened, 3-file adapter `lib/toDomain.ts`, explicit literal у `useCustomExercises.add`, 4 allowlist rows dropped)                     |
| M4  | Domain-shape alignment finyk × 2            | `CategoryChartSection`, `TransactionsPage` (snapshot adapter).                                         | S (1-2h)  | done 2026-05-15 (PR-02: `readonly string[]` palette, `upgradeCategory()` reuse, 2 allowlist rows dropped)                                                                       |
| M5  | `expo-notifications` SDK 52 type alignment  | `useRoutineReminders.ts` — drop `as unknown as Notifications.NotificationTriggerInput`.                | S (1h)    | done — drop cast, build typed `WeeklyTriggerInput` inline (PR pending)                                                                                                          |
| M6  | Decompose `TransactionsPage.tsx` (1215 LOC) | Mirror web's `pages/transactions/**` split.                                                            | L (1d)    | done — ✅ [#1453](https://github.com/Skords-01/Sergeant/pull/1453)                                                                                                              |
| M6b | Decompose `CelebrationModal.tsx` (671 LOC)  | Розбити на orchestrator + `confetti/` + `haptics.ts` + `hooks/` + `constants.ts` + `types.ts`.         | M (3-4h)  | done — ✅ [#1465](https://github.com/Skords-01/Sergeant/pull/1465)                                                                                                              |
| M7  | Sentry RN DSN provisioning                  | Створити Sentry project, виставити `EXPO_PUBLIC_SENTRY_DSN` в Expo EAS Secrets.                        | XS (0.5h) | 🚫 Blocked-reason: external-infra — TODO (code-sites ready — `ModuleErrorBoundary` forwarding closed 2026-05-13; чекає Sentry project + `EXPO_PUBLIC_SENTRY_DSN` в EAS Secrets) |
| M8  | Capacitor native-bridge integration tests   | Mock Capacitor plugins + JS-API контракт-тести для `pushNative`, `barcodeNative`.                      | M (3-4h)  | ✅ done — [PR #2538](https://github.com/Skords-01/Sergeant/pull/2538) (23 boundary tests)                                                                                       |
| M9  | Expo SDK 53 upgrade (mobile platform)       | `apps/mobile` Expo 52 → 53 per ADR-0063. TS 6.x already aligned.                                       | M-L       | 🚫 Blocked-reason: dep-blocked — SDK 53 bump tracked separately (not TS drift)                                                                                                  |

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
- **2026-06-04:** PR [#3363](https://github.com/Skords-01/Sergeant/pull/3363)
  (wave-1 delegation fan-out) закрив §5 «Великі файли» × 2: ✅
  `fizruk/lib/dualWrite/adapter.ts` (804 LOC) декомпозовано на orchestrator
  (188 LOC) + 9 per-operation-family файлів; ✅
  `fizruk/pages/PlanCalendar.tsx` (661 LOC) стоншено до 406 LOC.
  Великі файли (>600 LOC) на mobile: 3 → 1
  (лишався `fizruk/lib/dualWrite/diff.ts` 633).
- **2026-06-15:** `diff.ts` декомпозовано у `lib/dualWrite/diff/` → лічильник **0**.
- **2026-07-20:** Full reconcile — summary/type-bypass/TODO/tests/Capacitor
  цифри синхронізовано з HEAD; raw>600 monitor-лист оновлено (sqliteWriter + HubDashboard).
