# Прожарка #2/10: Web Frontend Ergonomics

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11. **Status:** Active

**Скоуп:** Web UI ergonomics — форми, accessibility, control-flow, error-boundaries, loading states, empty states, мікро-копірайт.

**Code-area фокус:** `apps/web/src/**`, `packages/eslint-plugin-sergeant-design/**`.

**Parent session:** [`devin-c432e2635a9a4f02ace2dac26c047a1d`](https://app.devin.ai/sessions/c432e2635a9a4f02ace2dac26c047a1d). **Child session (цей PR):** [`devin-cd48c6d9e8444018a17e0002c4a0a648`](https://app.devin.ai/sessions/cd48c6d9e8444018a17e0002c4a0a648).

## Cross-refs

- [`docs/audits/2026-05-03-web-deep-dive/00-overview.md`](./2026-05-03-web-deep-dive/00-overview.md) — master 18-item roadmap (web deep-dive).
- [`docs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](./2026-05-03-web-deep-dive/01-frontend-ergonomics.md) — §3.1–§3.12 з ергономікою (форми, DataState, toast, modal, safe-area, PWA, i18n, reduced-motion, PTR, shortcuts, dark mode).
- [`docs/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md`](./2026-05-03-web-deep-dive/round-13-burndown-sprint.md) — sprint plan (Superseded — статуси перенесені в `00-overview.md` § 11.5 round 14).
- [`docs/audits/2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md) — execution tracker для базових UX-покращень (форми, dark mode, sheet gestures).
- [`docs/audits/archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md) — генеральний UX/UI аудит 2026-04-28 (historical record).
- [`docs/audits/2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md) — UX-прожарка post-onboarding day 0-7.
- [`docs/design/empty-states.md`](../design/empty-states.md) — тиер-система (Tier 1 full-screen / Tier 2 compact / Tier 3 inline-text).
- [`docs/design/radius-rhythm.md`](../design/radius-rhythm.md) — size-driven border-radius scale (Marker → Hero).

## TL;DR — топ-7 болів (свіжий зріз 2026-05-13)

1. **Error-toast у тупику.** ~16 файлів роблять `toast.error("...")` без `action` — користувач у дед-енді ([§ F1](#f1-toasterror-без-action--p0-fixed)). FIX-у-цьому-PR.
2. **Modal a11y vs «псевдо-модалки».** ~17 використань `fixed inset-0` поза `<Modal>` / `<Sheet>` — кожен такий новий dialog мусить вручну робити `aria-modal`, focus-trap, scroll-lock ([§ F2](#f2-modal-a11y-псевдо-діалоги-в-апі-fixed-inset-0--p1)). Не у цьому PR.
3. **Keyboard-shortcuts роадмеп розклеєний.** Модалка `?` каже про `Cmd+S`, `Cmd+Z`, `Cmd+/`, `G H..N` chord — handler-ів немає, користувач відчуває «фейк-promise» ([§ F3](#f3-keyboard-shortcuts-handler-und-coverage--p1-doc-fixed)). DOC FIX-у-цьому-PR.
4. **PWA service-worker `prompt-on-update` під час стрімінгу AI.** Toast «Доступне нове оновлення» з кнопкою «Reload» з'являється посеред чату → reload розриває streamingResponse → loss-of-context ([§ F4](#f4-pwa-defer-update-prompt-during-streaming--p1)). Не у цьому PR.
5. **`toast.error(error.message)` без human-mapping.** Сирі error.message інколи протікають у UI (`TypeError: Cannot read property 'data' of undefined`) — лякає, не допомагає ([§ F5](#f5-toasterrorerrormessage-у-кількох-callsite-ах--p2)). Не у цьому PR.
6. **PTR під час активної синхронізації.** `<PullToRefresh>` дозволяє повторно тригерити `requestCloudPull` поки попередня не завершилася → race + дубльовані toast-фейли ([§ F6](#f6-pull-to-refresh-під-час-активного-sync--p2)). Не у цьому PR.
7. **`useApiForm` rollout: ~10 форм усе ще на manual `useState`.** Foundation `useApiForm` (zod resolver) є в `apps/web/src/shared/forms/`, але високого-traffic форми (PersonalInfoSection, MemoryBankSection) поки що на manual setState ([§ F7](#f7-useapiform-rollout-burndown--p2)). Не у цьому PR.

## Outstanding-items working-list (P0/P1/P2)

З попередніх прожарок взяті ТІЛЬКИ items без landing PR / без статусу
"Done" / "Closed" / "✅" станом на 2026-05-13.

### F1: `toast.error(...)` без `action` — P0 [FIXED]

**З 2026-05-03 §3.4** ([`01-frontend-ergonomics.md:60-90`](./2026-05-03-web-deep-dive/01-frontend-ergonomics.md)) — Toast-policy анти-патерн.

**Поточний стан коду** (2026-05-13):

- `apps/web/src/modules/routine/useRoutineAppState.ts:317` — `toast.error("Не вдалося оновити дані. Перевір з'єднання.")` без retry.
- `apps/web/src/modules/nutrition/NutritionApp.tsx:366` — той самий патерн у PTR-fail.
- `apps/web/src/modules/finyk/FinykApp.tsx:142` — `toast.error("Не вдалось завантажити синк-дані")` без action.
- `apps/web/src/core/profile/PersonalInfoSection.tsx:50,56,72,78,94,100,112,119,132,140` — 10 callsite-ів error-toast без action.
- Іще ~7 файлів (повний список — `apps/web/eslint.toast-error-action-allowlist.json`).

**Дії:**

- **Add** ESLint rule `sergeant-design/require-toast-error-action` в [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js) з burndown-allowlist (same shape as `no-raw-local-storage`).
- **Add** [`docs/ui/toast-policy.md`](../ui/toast-policy.md) — канонічний tone-table + anti-pattern matrix.
- **Add** [`apps/web/eslint.toast-error-action-allowlist.json`](../../apps/web/eslint.toast-error-action-allowlist.json) — 14 файлів, які зараз порушують rule; цільовий стан — `[]`.
- **Change** `useRoutineAppState.ts:317` і `NutritionApp.tsx:366` — додано `action: { label: "Повторити", onClick: retry }` (показові first-converts).
- **Change** [`eslint.config.js`](../../eslint.config.js) — wire rule як `warn` для `apps/web/**/*.{ts,tsx,js,jsx}`.

### F2: Modal a11y «псевдо-діалоги» в API `fixed inset-0` — P1

**З 2026-05-03 §3.5** — рекомендує ESLint custom rule + axe prop-тест.

**Поточний стан коду** (2026-05-13):

```
$ rg "fixed inset-0" apps/web/src --files-with-matches | wc -l
~17
```

Серед них легітимні (`<Modal>`, `<Sheet>`, `<ConfirmDialog>`, `<InputDialog>`, `<KeyboardShortcutsModal>`, `<OnboardingWizard>`), але є й ad-hoc:

- `apps/web/src/shared/components/ui/QuickActionsMenu.tsx:143` — `fixed inset-0 z-50` без `role="dialog"` / focus trap.
- `apps/web/src/shared/components/ui/StreakCelebration.tsx:138` — `fixed inset-0 z-9999` без `aria-modal`.
- `apps/web/src/shared/components/ui/FeatureSpotlight.tsx:323` — `pointer-events-none` overlay; не діалог, але стирає `pointer-events` від background, що ламає screen-reader navigation.
- `apps/web/src/shared/components/layout/ModuleSettingsDrawer.tsx:60` — drawer без focus-trap.
- `apps/web/src/shared/components/ui/FloatingActionButton.tsx:234` — backdrop без `role="presentation"`.

**Дії (не в цьому PR):**

- **Add** ESLint rule `sergeant-design/no-bare-fixed-inset-modal` — warn-only з allowlist для тих ~5 легітимних use-cases.
- **Add** axe prop-test snippet у `Modal.test.tsx` (вже існує) + поширення на `QuickActionsMenu`, `StreakCelebration`, `ModuleSettingsDrawer`.
- **Change** 4-5 файлів вище: додати `role="dialog"` або `role="presentation"`, focus-trap, scroll-lock.

**Чому не зараз:** треба inventory + risky a11y-зміни (focus-trap може ламати existing flows). Окрема прожарка #2.X — Modal/Dialog a11y.

### F3: Keyboard shortcuts — handler-und-coverage — P1 [DOC FIXED]

**З 2026-05-03 §3.11** — рекомендує browser-conflict review + chord-pattern reg.

**Поточний стан коду** (2026-05-13):

- [`KeyboardShortcutsModal.tsx:101-143`](../../apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx) рекламує:
  - `Cmd+/` — AI асистент (handler НЕ зареєстровано).
  - `Cmd+S` — Зберегти (НЕ зареєстровано — і browser-default = Save Page).
  - `Cmd+Z` — Undo (handler НЕ зареєстровано — лише browser default для text inputs).
  - `G H..N` chord — Navigation jumps (НЕ зареєстровано).
- Зареєстровані: `?` (показ модалки), `Cmd/Ctrl+K` (search) — у [`useHubKeyboardShortcuts.ts`](../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts).

**Дії:**

- **Add** [`docs/ui/shortcuts.md`](../ui/shortcuts.md) — реєстр + browser-conflict matrix + статус (registered vs TBD) FIX-у-цьому-PR.
- **Change** (не зараз) — або wire-up missing handler-ів (G-chord pattern, Cmd+/ AI), або прибрати їх з `DEFAULT_SHORTCUTS` до тих пір. Покладемо в окрему прожарку shortcuts-rollout.

### F4: PWA defer update-prompt during streaming — P1

**З 2026-05-03 §3.7** — рекомендує defer reload-prompt під час активного streaming.

**Поточний стан коду** (2026-05-13):

- `apps/web/src/sw.ts` + `apps/web/src/shared/hooks/useSWUpdate.ts` показує prompt одразу як новий SW активний, без перевірки чи зараз йде Hub-streaming або mutation у `MutationCache`.

**Дії (не в цьому PR):**

- **Change** `useSWUpdate.ts`: subscribe to `queryClient.getMutationCache().subscribe(...)` + `useStreamingState()` — defer prompt, аж поки stream `idle` AND no in-flight mutations.
- **Add** test `useSWUpdate.test.ts` що мокає `MutationCache` + `streamingStore` і перевіряє defer.

**Чому не зараз:** потребує знання streaming-state API, не покрите аудитом. Запланувати окремо.

### F5: `toast.error(error.message)` без human-mapping — P2

**Сирий error.message протікає у UI:**

- `apps/web/src/core/profile/PersonalInfoSection.tsx:50,72,94,...` — `toast.error(res.error.message ?? "Не вдалося оновити ім'я")` — `??` fallback ОК, але `res.error.message` сам по собі — це backend-string (наприклад `validation_error: name too long`), не український UX-string.
- `apps/web/src/core/profile/DangerZoneSection.tsx:36` — той самий патерн.
- `apps/web/src/core/profile/SessionsSection.tsx:75` — те саме.

**Дії (не в цьому PR):**

- **Add** `mapApiErrorToUserCopy(error)` — централізована функція в `apps/web/src/shared/lib/api/` що мапить `error.code` → UA-copy.
- **Change** 5-7 callsite-ів у `core/profile/*` — використовувати `mapApiErrorToUserCopy(res.error)` замість прямого `.message`.

### F6: Pull-to-refresh під час активного sync — P2

**З 2026-05-03 §3.10** — PTR не повинен дозволяти подвійний тригер.

**Поточний стан коду:**

- [`PullToRefresh.tsx`](../../apps/web/src/shared/components/ui/PullToRefresh.tsx) дозволяє тригерити `onRefresh()` повторно поки попередня не resolve-нула. Раніше була race, але `disabled` prop існує — просто не wired-up з `requestCloudPull` state.

**Дії (не в цьому PR):**

- **Add** `useCloudPullPending()` hook що повертає boolean — чи зараз pending pull.
- **Change** call-sites `<PullToRefresh disabled={cloudPullPending}>` у `routine`, `nutrition`, `finyk` модулях.

### F7: `useApiForm` rollout burndown — P2

**З 2026-05-03 §3.1** — рекомендує мігрувати всі 10+ форм на foundation `useApiForm` (zod resolver, React Hook Form, mode `onTouched`).

**Поточний стан коду** (2026-05-13):

- ✅ Migrated: `WelcomeScreen` (`apps/web/src/core/app/WelcomeScreen.tsx`), `LoginForm`, `RegisterForm`, `ForgotPasswordForm` — done у PR #1796.
- ⏳ Manual setState (рекомендовано рефакторити):
  - `apps/web/src/core/profile/PersonalInfoSection.tsx` — 4 inputs у manual state.
  - `apps/web/src/core/profile/MemoryBankSection.tsx` — textarea + JSON parsing.
  - `apps/web/src/modules/finyk/components/FinykLoginScreen.tsx` — API key input.
  - `apps/web/src/core/pricing/WaitlistForm.tsx` — email input.

**Дії (не в цьому PR):**

- Burndown rollout — мігрувати per-form, кожна = окремий невеликий PR.

## Прогрес виконання (у цьому PR)

| Item                            | Action                                                                                                                                                                                                             | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| F1 — Toast-policy + ESLint rule | Додано `sergeant-design/require-toast-error-action` з burndown allowlist; додано `docs/ui/toast-policy.md`; виправлено 2 high-traffic PTR-fail callsite-и; решта 14 файлів — у allowlist для burndown.             | DONE   |
| F3 — Shortcuts registry doc     | Додано `docs/ui/shortcuts.md` — реєстр + browser-conflict matrix + TBD-handler-и зі `DEFAULT_SHORTCUTS`.                                                                                                           | DONE   |
| F2 / F4 / F5 / F6 / F7          | Інвентаризовані вище з конкретними `file:line` посиланнями та діями Add/Change. Не закриваються у цьому PR — потребують окремих focused прожарок (Modal a11y, SW-update defer, error-mapping, useApiForm rollout). | LOGGED |

## Файли цього PR

```
docs/audits/2026-05-13-web-frontend-ergonomics-roast.md      (новий, цей файл)
docs/audits/README.md                                         (один рядок про новий roast)
docs/ui/toast-policy.md                                       (новий — F1)
docs/ui/shortcuts.md                                          (новий — F3)
packages/eslint-plugin-sergeant-design/index.js               (+1 rule)
packages/eslint-plugin-sergeant-design/__tests__/require-toast-error-action.test.mjs  (новий — 16 tests)
eslint.config.js                                              (+rule wiring, +allowlist read, +plugin self-exclusion)
apps/web/eslint.toast-error-action-allowlist.json             (новий — 14 legacy callsite-ів)
apps/web/src/modules/routine/useRoutineAppState.ts            (PTR-fail toast → action: { label, onClick })
apps/web/src/modules/nutrition/NutritionApp.tsx               (PTR-fail toast → action: { label, onClick })
```

## Що НЕ зроблено в цьому PR (next prozharkas)

- **Modal a11y inventory + ESLint rule** (`no-bare-fixed-inset-modal`) — потребує detailed inventory ~17 callsite-ів.
- **SW-update defer-while-streaming** — окрема focused прожарка, бо потрібен deep dive у streaming + mutation-cache state.
- **`mapApiErrorToUserCopy(error)` централізована функція** — потребує мапи кодів і UA-copy.
- **`useApiForm` rollout** — 7-10 невеликих PR-ів, бо кожна форма має свої invariant-и (debounced submit, optimistic UI, …).
- **Keyboard-handler wire-up** (`Cmd+/`, `G H..N`) — окрема прожарка shortcuts-rollout.

## Як перевіряти CI

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
# або
pnpm check
```

Очікувано:

- `pnpm test --filter @sergeant/eslint-plugin-sergeant-design` — 16 нових тестів `require-toast-error-action` pass.
- `pnpm lint` — `apps/web/**/*.{ts,tsx}` повинен показати `0 errors`. Warnings — лише з burndown-rule на файлах з allowlist (allowlist бере їх off — тому warnings залишаються лише на 2 файлах, які я NEвдало забув добавити, а потім fix-ив переходом на `action: { label, onClick }`).
- `pnpm typecheck` — нічого нового не торкнулося type-сурфейсу `useToast` API.
