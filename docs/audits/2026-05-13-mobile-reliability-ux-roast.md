# Прожарка #10/10 — Mobile (Expo + Capacitor) Reliability & UX (2026-05-13)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active
> **Scope:** `apps/mobile/**` (Expo 52 + RN 0.76 + Expo Router + NativeWind + MMKV + Jest 29) та `apps/mobile-shell/**` (Capacitor 7 wrapper + Vitest). Окрема активна ініціатива з SQLite-міграції (Stage 8/9) сюди не входить — її ведуть інші сесії. Mobile-strategy ADR — [`0052-mobile-strategy-capacitor-primary`](../adr/0052-mobile-strategy-capacitor-primary.md); dual-track sunset — [initiative 0002](../initiatives/0002-mobile-platform-decision.md).

## Cross-refs (попередні прожарки/аудити цієї теми)

- [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md) — повний audit `2026-05-07`; mobile-частина закрита PR #2215 (Jest reliability), #2192/#2199 (sync_op_outbox), umbrella imports.
- [`2026-05-07-full-app-regression-ux-audit.md`](./2026-05-07-full-app-regression-ux-audit.md) — fix-pass log, mobile TransactionsPage providers fix, mobile Jest OOM closure.
- [`2026-04-28-ux-improvement-plan.md`](./archive/2026-04-28-ux-improvement-plan.md) — UX тех-план, mobile-частина 12/14 Done, дві Partial: E2E and device validation, Accessibility audit.
- [`docs/tech-debt/mobile.md`](../tech-debt/mobile.md) — living burndown, recount-нуто разом з цією прожаркою.
- [`apps/mobile/AGENTS.md`](../../apps/mobile/AGENTS.md) — surface-specific gotchas (NativeWind, MMKV-only, Expo Router).
- [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) — Capacitor/Expo dual-track, sunset зараз не active.

## TL;DR — топ-7 болів

1. **Mobile `ModuleErrorBoundary` не форвардив помилки у Sentry** (`apps/mobile/src/core/ModuleErrorBoundary.tsx:232` мав `TODO(phase-10)`). Боундарі ловить crash модуля, друкує у console, і все — операторам жодного сигналу. Закрито у цьому PR.
2. **Stale ESLint allowlist entry для `useRoutineReminders.ts`** (`eslint.config.js:694`). M5 у `mobile.md` зафіксований як done 2026-05-06, але allowlist-рядок усе ще стоїть → код може регрешити назад під `as unknown as Notifications.NotificationTriggerInput` і ESLint це проґавить. Закрито у цьому PR.
3. **`docs/tech-debt/mobile.md` дрифтить за реальністю на 2 файли + 67 LOC.** Кількість >600 LOC файлів зросла з 2 до 4 (`dualWrite/diff.ts` 633 і `routine/pages/Calendar.tsx` 628 пробили поріг; `adapter.ts` 737 → 804; `PlanCalendar.tsx` 616 → 661). Розділ "TODO/FIXME маркери" згадував 5 маркерів, фактичний quick-grep — 3 (потім 2 після закриття #1). Закрито у цьому PR через refresh.
4. **Dead-code: `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` (206 LOC).** Жодного імпортера у `apps/mobile/**` — `grep -rn "modules/shared/ModuleErrorBoundary\|shared/ModuleErrorBoundary" apps/mobile` повертає 0. Єдиний живий боундарі — `apps/mobile/src/core/ModuleErrorBoundary.tsx`. Потрібен mini-PR на видалення, але видаляти у цій прожарці страшно без cross-repo grep (може бути dynamic import).
5. **Sentry DSN на staging/prod не виставлено.** `apps/mobile/src/lib/observability.ts:34` гейтиться `EXPO_PUBLIC_SENTRY_DSN`; на mobile DSN ще не провіжнено. Без code-зміни цей пункт не закривається — потрібно лише EAS Secret + redeploy.
6. **Detox e2e (`hub-ux-smoke.e2e.ts`) не прогнаний на актуальній iOS/Android матриці** (див. UX plan §"E2E and device validation: Partial"). Без CI-інтеграції e2e залишаються "існує, але прогінали востаннє давно" — це P2.
7. **Capacitor shell coverage стара аналітика.** `mobile.md` казав "5 test-файлів" — реально 8 (`auth-storage`, `pushNative`, `index`, `barcodeNative`, `platform`, `parseDeepLink`, `deepLinkBridge`, `boundary`). Категорію вже бампнули на OK, але цифру не оновили. Закрито у цьому PR через `Capacitor coverage` row refresh.

---

## P0 — нічого хардового

Жодного active P0 mobile-блокера на момент прожарки. Web bootstrap blocker з `2026-05-07-app-audit.md` (`kvStoreBoot.ts` umbrella import) закритий ще у фіксспасі `2026-05-08`, mobile-side всі 5 файлів вже мігровані на `@sergeant/db-schema/migrate/runner` (audit-comparison item #4).

---

## P1 — те, що болить операторам

### P1.1 — Mobile error-boundary forward у Sentry — **closed у цьому PR**

- **Файл:** `apps/mobile/src/core/ModuleErrorBoundary.tsx:232`
- **Симптом:** `componentDidCatch(error)` лише друкував `console.error`; `apps/mobile/src/lib/observability.ts:55` (`captureError`) ніколи не викликався. Якщо `Фінік`/`Фізрук`/`Рутина`/`Харчування` mount-крашиться, оператори про це не дізнаються.
- **Дія:** Change. Імпортувати `captureError` із `@/lib/observability`, у `componentDidCatch` викликати `captureError(error, { moduleName: this.props.moduleName ?? null, source: "mobile.ModuleErrorBoundary" })` за межами існуючого `console.error` try/catch блоку. Без DSN `captureError` лишається безпечним `console.error`-фолбеком — host-app не ламається.
- **Тести:** додано три нові `it()`-кейси у `apps/mobile/src/core/ModuleErrorBoundary.test.tsx`:
  - forwards caught errors з `moduleName` контекстом;
  - forwards caught errors з `moduleName: null` коли prop не задано;
  - не ламає host-боундарі якщо `captureError` сам кинув.

### P1.2 — Stale ESLint allowlist `useRoutineReminders.ts` — **closed у цьому PR**

- **Файл:** `eslint.config.js:694`
- **Симптом:** M5 (`docs/tech-debt/mobile.md:325`) — done 2026-05-06: `useRoutineReminders.ts` більше не має `as unknown as Notifications.NotificationTriggerInput`. Але allowlist-entry для цього файлу у мобільному `sergeant-design/no-strict-bypass` залишилася → майбутнє регресія може повернути cast і ESLint це не зловить.
- **Дія:** Remove allowlist row + замінити коментарем, що пояснює чому row дроп-нутий. Verify: `grep -r "as unknown as" apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts` → 0.

### P1.3 — `tech-debt/mobile.md` drift — **closed у цьому PR**

- **Файл:** `docs/tech-debt/mobile.md`
- **Симптом:** `Last validated: 2026-05-12`, але:
  - LOC >600 файлів — заявлено 2, фактично 4 (за `find apps/mobile/src apps/mobile/app -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.test.*" | xargs wc -l | sort -nr | head -20`).
  - `ExperimentalSection.tsx:31` + `:53` TODO-маркери — quick-grep видає 0 (видалені у попередніх settings sweep, але registry не оновили).
  - "Capacitor coverage" — заявлено 5 test files, фактично 8.
- **Дія:** Refresh `Last validated`, оновити три таблиці (Summary, >600 LOC, TODO/FIXME), додати inline-нотатку про закриття `ModuleErrorBoundary` TODO.

---

## P2 — те, що болить maintainer-у

### P2.1 — Dead-code `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` (206 LOC)

- **Файл:** `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx`
- **Симптом:** Жодного імпортера у `apps/mobile/**` — `grep -rn "modules/shared/ModuleErrorBoundary\|shared/ModuleErrorBoundary" apps/mobile` → 0. Усі consumer-и (`apps/mobile/app/(tabs)/{finyk,nutrition,routine}/_layout.tsx`, `apps/mobile/src/modules/routine/RoutineApp.tsx`, `apps/mobile/src/modules/nutrition/NutritionApp.tsx`) тягнуть `@/core/ModuleErrorBoundary`, не `modules/shared/`.
- **Дія:** Remove (mini-PR). Перед видаленням — глобальний grep по dynamic-import-у `require.context`/`import("modules/shared/...")` щоб не зачепити Expo Router file-based проактивну активацію. У цій прожарці тільки **трекнуто** — видалення вимагає окремого фокус-PR.

### P2.2 — Two new >600 LOC offenders (`dualWrite/diff.ts` 633, `routine/pages/Calendar.tsx` 628)

- **Файли:**
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/diff.ts` (633 LOC, **новий**)
  - `apps/mobile/src/modules/routine/pages/Calendar.tsx` (628 LOC, **новий**)
- **Симптом:** Реєстр LOC у `mobile.md` спирався на 2026-05-12 PowerShell-recount, який пропустив ці два файли. Поточний `wc -l` показує 4 файли над межею, не 2.
- **Дія:** Change у `mobile.md` (зроблено). Decomposition самих файлів — окремі PR (P2):
  - `dualWrite/diff.ts` → split per-shape diff-utilities (`workoutsDiff`, `dailyLogDiff`, `templatesDiff`, …) як module-folder, mirror `dualWrite/adapter.ts` operation-family прийнятий patten.
  - `routine/pages/Calendar.tsx` → винести `DayCell`, `WeekHeader`, completion-aggregator hook у `pages/Calendar/` folder. Не блокер. **✅ Closed in #2780** — `Calendar.tsx` розкладено у `pages/Calendar/` folder (13 sub-files): `index.tsx` (183 LOC), `DayCell.tsx`, `WeekHeader.tsx`, `MonthGridView.tsx`, `MonthHeader.tsx`, `TimeModeSegmented.tsx`, `StatsPill.tsx`, `EventRow.tsx`, `GroupedEventList.tsx`, `useCalendarAggregates.ts` (completion-aggregator hook), `formatters.ts`, `constants.ts`, `types.ts`. Жоден файл не перевищує 200 LOC, page остаточно під лімітом 600 (Hard Rule #18).

### P2.3 — Domain-shape alignment fizruk × 4 + finyk × 2 (M3 + M4)

- **Файли (зі стейлим allowlist у `eslint.config.js:685-690`):**
  - `apps/mobile/src/modules/finyk/pages/Overview/CategoryChartSection.tsx:35`
  - `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx:122`
  - `apps/mobile/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx:76`
  - `apps/mobile/src/modules/fizruk/hooks/useCustomExercises.ts:148`
  - `apps/mobile/src/modules/fizruk/hooks/useRecovery.ts:32`
  - `apps/mobile/src/modules/fizruk/pages/Exercise.tsx:133`
- **Дія:** Change. План у `mobile.md:93-99` (alignment локальних view-model-ів з `@sergeant/{fizruk,finyk}-domain` shape-ами або explicit `toDomain*` converter). Скуп — окремий PR M3+M4 (~3-4h). У цій прожарці не вмістилося (>10 файлів змін).

### P2.4 — Detox e2e device matrix not run on CI (UX plan §"E2E and device validation: Partial")

- **Файл:** `apps/mobile/e2e/hub-ux-smoke.e2e.ts` (existing) + `apps/mobile/package.json:e2e:test:ios`
- **Симптом:** `pnpm --filter @sergeant/mobile e2e:test:ios` запускається локально (потребує Xcode + iOS sim), але немає CI-крука. Detox e2e залишаються "існує, але прогінали востаннє давно". `docs/planning/mobile-e2e-testing.md` тримає план, але не trigger.
- **Дія:** Окрема ініціатива (mobile-e2e-CI), не блокер цього roast. Track-нуто.

### P2.5 — `apps/mobile-shell/` deprecation/parity drift

- **Файл:** `docs/initiatives/0002-mobile-platform-decision.md:4-6`
- **Симптом:** Initiative 0002 "Phase 1/2 shipped; sunset schedule superseded" — Capacitor + Expo підтримуються паралельно "до Expo feature parity". У `docs/architecture/platforms.md` критерій ≥18/22 рядків ✅, але `report-shell-tax.mjs` не друкує trend. Maintenance-tax росте, dual-track не активний → потрібен квартальний recount.
- **Дія:** Окремий tracking-PR (`docs/initiatives/0002-…` — додати свіжий cost baseline). Не блокер цього roast.

---

## P3 — нюанси

- **Capacitor coverage row в `mobile.md`** заявляв 5 test-files, реально 8 (`__tests__/boundary.test.ts` додано у PR #1415 follow-up). Не критично, але категорія "OK" коректна, цифра — стале. Реєстр оновлено у `tech-debt/mobile.md` рефрешем.
- **TS-version drift (`apps/mobile`: `~5.9.0` vs web/server `^6.0.3`).** Блокується Expo SDK 53. Track only.
- **`AGENTS.md` mobile sub-tree** — Last validated 2026-05-10 by @Skords-01/Devin. Next review — 2026-08-08. Все ще actual, цей roast не міняє surface-rules.

---

## Прогрес виконання (цей PR)

- ✅ **P1.1** Forward mobile `ModuleErrorBoundary` errors у `captureError` — closes TODO(phase-10) at `apps/mobile/src/core/ModuleErrorBoundary.tsx:232`. Закрито разом з 3 новими Jest-кейсами у `ModuleErrorBoundary.test.tsx`.
- ✅ **P1.2** Drop stale `useRoutineReminders.ts` entry з `sergeant-design/no-strict-bypass` mobile allowlist у `eslint.config.js`. M5 row у `mobile.md` тепер коректний.
- ✅ **P1.3** Refresh `docs/tech-debt/mobile.md` — Last validated 2026-05-13, LOC recount (2 → 4 files >600), TODO/FIXME shrink (5 → 2 живих, 1 closed), Capacitor coverage цифра (5 → 8), ModuleErrorBoundary inline-нотатка.
- 📝 **P2.1** Dead-code `modules/shared/ModuleErrorBoundary.tsx` — track only (видалення потребує крос-grep перевірки на dynamic imports, окремий mini-PR).
- 📝 **P2.2 / P2.3 / P2.4 / P2.5** — track only (>10 файлів змін → окремі follow-up PR).
- ✅ **P2.2b** Follow-up shipped in #2780 — `apps/mobile/src/modules/routine/pages/Calendar.tsx` (628 LOC) decomposed into a 13-file `pages/Calendar/` folder; `index.tsx` is 183 LOC. Adds 2 new unit-test files (`formatters.test.ts`, `useCalendarAggregates.test.ts`); existing `Calendar.test.tsx` was moved inside the folder and remains green.

## Outstanding (відкрите після цього PR)

| #     | Surface                  | Дія                                                                                       | Власник | Estimate |
| ----- | ------------------------ | ----------------------------------------------------------------------------------------- | ------- | -------- |
| M3    | `apps/mobile/fizruk`     | Domain-shape alignment × 4 (drop 4× `as unknown as` через `toDomain*` converter)          | TBD     | M (3-4h) |
| M4    | `apps/mobile/finyk`      | Domain-shape alignment × 2 (CategoryChartSection + TransactionsPage snapshot adapter)     | TBD     | S (1-2h) |
| M7    | Sentry RN DSN            | Provision EAS Secret `EXPO_PUBLIC_SENTRY_DSN`; code already wired (closed 2026-05-13)     | ops     | XS       |
| M9    | TS 6 bump mobile+console | Чекає Expo SDK 53 (blocked, not actionable)                                               | TBD     | M-L      |
| P2.1  | Dead-code cleanup        | Remove `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` after dynamic-import grep | TBD     | XS       |
| P2.2a | fizruk dualWrite         | Decompose `dualWrite/diff.ts` 633 LOC за per-shape diff-helpers                           | TBD     | M (3-4h) |
| P2.2b | routine/Calendar.tsx     | ✅ Closed in #2780 — `Calendar.tsx` → `pages/Calendar/` folder (13 sub-files)             | @Devin  | M (3-4h) |
| P2.2c | fizruk PlanCalendar.tsx  | Декомпозиція 661 LOC (наростилося +45)                                                    | TBD     | M        |
| P2.2d | fizruk adapter.ts        | Декомпозиція 804 LOC (наростилося +67)                                                    | TBD     | M-L      |
| P2.4  | Detox e2e CI             | Зачепити `hub-ux-smoke.e2e.ts` у CI matrix (iOS sim runner)                               | ops     | M-L      |
| P2.5  | Shell-tax recount        | Свіжий `report-shell-tax.mjs` друк + quarter trend у `docs/initiatives/0002-...`          | TBD     | S        |
| UX-A  | A11y full screen-reader  | Sweep усіх screens VoiceOver + TalkBack (UX plan §"Accessibility audit: Partial")         | TBD     | M        |
