# Прожарка #2/10: Web Frontend Ergonomics

> **Last validated:** 2026-06-06 by @claude (audit-closeout pass — F1–F7 all DONE verified in progress table; keyboard-handler wire-up deferred to separate shortcuts-rollout roast as explicitly stated in §F3; status flipped to Closed). **Next review:** 2026-09-06.
> **Status:** Archived — усі F1–F7 завершені станом на 2026-06-03. Keyboard-handler wire-up (`Cmd+/`, `G H..N`) виокремлено в окрему прожарку shortcuts-rollout (out of scope цього документа).
> **Скоуп:** Web UI ergonomics — форми, accessibility, control-flow, error-boundaries, loading states, empty states, мікро-копірайт.

**Code-area фокус:** `apps/web/src/**`, `packages/eslint-plugin-sergeant-design/**`.

**Parent session:** [`devin-c432e2635a9a4f02ace2dac26c047a1d`](https://app.devin.ai/sessions/c432e2635a9a4f02ace2dac26c047a1d). **Child session (цей PR):** [`devin-cd48c6d9e8444018a17e0002c4a0a648`](https://app.devin.ai/sessions/cd48c6d9e8444018a17e0002c4a0a648).

## Cross-refs

- [`docs/audits/2026-05-03-web-deep-dive/00-overview.md`](../2026-05-03-web-deep-dive/00-overview.md) — master 18-item roadmap (web deep-dive).
- [`docs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`](../2026-05-03-web-deep-dive/01-frontend-ergonomics.md) — §3.1–§3.12 з ергономікою (форми, DataState, toast, modal, safe-area, PWA, i18n, reduced-motion, PTR, shortcuts, dark mode).
- [`docs/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md`](../2026-05-03-web-deep-dive/round-13-burndown-sprint.md) — sprint plan (Superseded — статуси перенесені в `00-overview.md` § 11.5 round 14).
- [`docs/audits/archive/2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md) — execution tracker для базових UX-покращень (форми, dark mode, sheet gestures).
- [`docs/audits/archive/2026-04-28-ux-ui-audit.md`](./2026-04-28-ux-ui-audit.md) — генеральний UX/UI аудит 2026-04-28 (historical record).
- [`docs/audits/2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md) — UX-прожарка post-onboarding day 0-7.
- [`docs/05-design/design/empty-states.md`](../../05-design/design/empty-states.md) — тиер-система (Tier 1 full-screen / Tier 2 compact / Tier 3 inline-text).
- [`docs/05-design/design/radius-rhythm.md`](../../05-design/design/radius-rhythm.md) — size-driven border-radius scale (Marker → Hero).

## TL;DR — топ-7 болів (свіжий зріз 2026-05-13)

1. **Error-toast у тупику.** ~16 файлів роблять `toast.error("...")` без `action` — користувач у дед-енді ([§ F1](#f1-toasterror-без-action--p0-fixed)). FIX-у-цьому-PR.
2. **Modal a11y vs «псевдо-модалки».** ~17 використань `fixed inset-0` поза `<Modal>` / `<Sheet>` — кожен такий новий dialog мусить вручну робити `aria-modal`, focus-trap, scroll-lock ([§ F2](#f2-modal-a11y-псевдо-діалоги-в-api-fixed-inset-0--p1-part-1-fixed-part-ii-outstanding)). Не у цьому PR.
3. **Keyboard-shortcuts роадмеп розклеєний.** Модалка `?` каже про `Cmd+S`, `Cmd+Z`, `Cmd+/`, `G H..N` chord — handler-ів немає, користувач відчуває «фейк-promise» ([§ F3](#f3-keyboard-shortcuts--handler-und-coverage--p1-doc-fixed)). DOC FIX-у-цьому-PR.
4. **PWA service-worker `prompt-on-update` під час стрімінгу AI.** Toast «Доступне нове оновлення» з кнопкою «Reload» з'являється посеред чату → reload розриває streamingResponse → loss-of-context ([§ F4](#f4-pwa-defer-update-prompt-during-streaming--p1)). Не у цьому PR.
5. **`toast.error(error.message)` без human-mapping.** Сирі error.message інколи протікають у UI (`TypeError: Cannot read property 'data' of undefined`) — лякає, не допомагає ([§ F5](#f5-toasterrorerrormessage-без-human-mapping--p2-fixed)). FIX-у-цьому-PR.
6. **PTR під час активної синхронізації.** `<PullToRefresh>` дозволяє повторно тригерити `requestCloudPull` поки попередня не завершилася → race + дубльовані toast-фейли ([§ F6](#f6-pull-to-refresh-під-час-активного-sync--p2--closed-in-2743)). Не у цьому PR.
7. **`useApiForm` rollout: ~10 форм усе ще на manual `useState`.** Foundation `useApiForm` (zod resolver) є в `apps/web/src/shared/forms/`, але високого-traffic форми (PersonalInfoSection, MemoryBankSection) поки що на manual setState ([§ F7](#f7-useapiform-rollout-burndown--p2)). Не у цьому PR.

## Outstanding-items working-list (P0/P1/P2)

З попередніх прожарок взяті ТІЛЬКИ items без landing PR / без статусу
"Done" / "Closed" / "✅" станом на 2026-05-13.

### F1: `toast.error(...)` без `action` — P0 [FIXED]

**З 2026-05-03 §3.4** ([`01-frontend-ergonomics.md:60-90`](../2026-05-03-web-deep-dive/01-frontend-ergonomics.md)) — Toast-policy анти-патерн.

**Поточний стан коду** (2026-05-13):

- `apps/web/src/modules/routine/useRoutineAppState.ts:317` — `toast.error("Не вдалося оновити дані. Перевір з'єднання.")` без retry.
- `apps/web/src/modules/nutrition/NutritionApp.tsx:366` — той самий патерн у PTR-fail.
- `apps/web/src/modules/finyk/FinykApp.tsx:142` — `toast.error("Не вдалось завантажити синк-дані")` без action.
- `apps/web/src/core/profile/PersonalInfoSection.tsx:50,56,72,78,94,100,112,119,132,140` — 10 callsite-ів error-toast без action.
- Іще ~7 файлів (повний список — `apps/web/eslint.toast-error-action-allowlist.json`).

**Дії:**

- **Add** ESLint rule `sergeant-design/require-toast-error-action` в [`packages/eslint-plugin-sergeant-design/index.js`](../../../packages/eslint-plugin-sergeant-design/index.js) з burndown-allowlist (same shape as `no-raw-local-storage`).
- **Add** [`docs/05-design/ui/toast-policy.md`](../../05-design/ui/toast-policy.md) — канонічний tone-table + anti-pattern matrix.
- **Add** [`apps/web/eslint.toast-error-action-allowlist.json`](../../../apps/web/eslint.toast-error-action-allowlist.json) — 14 файлів, які зараз порушують rule; цільовий стан — `[]`.
- **Change** `useRoutineAppState.ts:317` і `NutritionApp.tsx:366` — додано `action: { label: "Повторити", onClick: retry }` (показові first-converts).
- **Change** [`eslint.config.js`](../../../eslint.config.js) — wire rule як `warn` для `apps/web/**/*.{ts,tsx,js,jsx}`.

### F2: Modal a11y «псевдо-діалоги» в API `fixed inset-0` — P1 [PART-1 FIXED, PART-II CLOSED 2026-06-03]

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

**Дії:**

- ✅ **Add** ESLint rule `sergeant-design/no-bare-fixed-inset-modal` — warn-only з file-path allowlist для 6 легітимних модальних примітивів (`Modal`, `Sheet`, `ConfirmDialog`, `InputDialog`, `KeyboardShortcutsModal`, `OnboardingWizard`). FIXED у follow-up PR (rule only, part-1).
- **Add** axe prop-test snippet у `Modal.test.tsx` (вже існує) + поширення на `QuickActionsMenu`, `StreakCelebration`, `ModuleSettingsDrawer`. **OUTSTANDING — part-II.**
- **Change** 4-5 файлів вище: додати `role="dialog"` або `role="presentation"`, focus-trap, scroll-lock. **OUTSTANDING — part-II.**

**Чому part-II не зараз:** rule додано як warn-only, щоб підсвічувати нові регресії; виправлення існуючих файлів потребує risky a11y-зміни (focus-trap може ламати existing flows) — окрема прожарка #2.X — Modal/Dialog a11y.

**UA note 2026-06-03 — PART-II CLOSED:**

Проведено повний інвентар 5 зазначених компонентів; виявлені реальні прогалини та закриті:

- `QuickActionsMenu.tsx` — вже мав `useDialogFocusTrap` + `useBodyScrollLock` + `role="menu"` у тому ж коміті, що додав rule (part-1). Жодних змін не потрібно.
- `StreakCelebration.tsx` / `FeatureSpotlight.tsx` — файли НЕ існують у репозиторії. Streak-celebration обробляє `CelebrationModal.tsx`, який вже має `role="dialog"` + `aria-modal` + `useFocusTrap`. `FeatureSpotlight` був перспективним placeholder-ом в audit-документі; компонент так і не було створено.
- `FloatingActionButton.tsx` — **FIXED**: додано `useDialogFocusTrap` (замінює hand-rolled `document.addEventListener("keydown", handleEscape)`) + `useBodyScrollLock` для backdrop-overlay. `role="presentation"` + `aria-hidden` на backdrop вже були. Окремий `menuRef` підключений до `role="menu"` контейнера як root фокус-trap-у.
- `ModuleSettingsDrawer.tsx` — **FIXED**: вже мав `role="dialog"` + `aria-modal` + `useDialogFocusTrap`. Додано відсутній `useBodyScrollLock(open)`.

Typecheck: ✅ clean. ESLint: ✅ 0 errors. Shared-tests: ✅ 666/666 passed.

### F3: Keyboard shortcuts — handler-und-coverage — P1 [DOC FIXED]

**З 2026-05-03 §3.11** — рекомендує browser-conflict review + chord-pattern reg.

**Поточний стан коду** (2026-05-13):

- [`KeyboardShortcutsModal.tsx:101-143`](../../../apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx) рекламує:
  - `Cmd+/` — AI асистент (handler НЕ зареєстровано).
  - `Cmd+S` — Зберегти (НЕ зареєстровано — і browser-default = Save Page).
  - `Cmd+Z` — Undo (handler НЕ зареєстровано — лише browser default для text inputs).
  - `G H..N` chord — Navigation jumps (НЕ зареєстровано).
- Зареєстровані: `?` (показ модалки), `Cmd/Ctrl+K` (search) — у [`useHubKeyboardShortcuts.ts`](../../../apps/web/src/core/hooks/useHubKeyboardShortcuts.ts).

**Дії:**

- **Add** [`docs/05-design/ui/shortcuts.md`](../../05-design/ui/shortcuts.md) — реєстр + browser-conflict matrix + статус (registered vs TBD) FIX-у-цьому-PR.
- **Change** (не зараз) — або wire-up missing handler-ів (G-chord pattern, Cmd+/ AI), або прибрати їх з `DEFAULT_SHORTCUTS` до тих пір. Покладемо в окрему прожарку shortcuts-rollout.

### F4: PWA defer update-prompt during streaming — P1 ✅ Closed

**Status:** Closed 2026-06-03 (drift — реалізовано, але не позначено у цьому roast-і). `apps/web/src/core/app/useSWUpdate.ts` (hook переїхав з `shared/hooks/` у `core/app/`) тепер містить defer-логіку: `scheduleOrShowUpdateToast()` перевіряє `isHubStreaming()` + `hasMutationsInFlight(queryClient.getMutationCache())` і відкладає toast (polling 1s) поки Hub busy; `HARD_SHOW_TIMEOUT_MS = 10 хв` failsafe (R5) гарантує, що prompt урешті покажеться навіть при «застряглому» streaming-флазі. Gap закрито.

**Original concern (2026-05-13):** `apps/web/src/sw.ts` + `useSWUpdate.ts` показували prompt одразу як новий SW активний, без перевірки чи зараз йде Hub-streaming або mutation у `MutationCache` — reload посеред чату розривав streamingResponse (loss-of-context).

**Resolution:** реалізовано рекомендовану зміну — subscribe-перевірка streaming-state + mutation-cache, defer аж поки stream idle AND no in-flight mutations, з hard-timeout failsafe.

### F5: `toast.error(error.message)` без human-mapping — P2 [FIXED]

✅ Closed in [#TBD-F5](https://github.com/Skords-01/Sergeant/pulls?q=is%3Apr+map+api+error+user+copy) — додано `apps/web/src/shared/lib/api/mapApiErrorToUserCopy.ts` + 13 unit-тестів (5 Better-Auth codes, unknown fallback, status fallback, null/undefined); 9 callsite-ів у `apps/web/src/core/profile/*` (`PersonalInfoSection`, `DangerZoneSection`, `SessionsSection`, `ChangePasswordSection`) переведені на `mapApiErrorToUserCopy(res.error, fallback)`.

**Резолюція:** усі callsite-и у `apps/web/src/core/profile/*` (`PersonalInfoSection`, `DangerZoneSection`, `SessionsSection`, `ChangePasswordSection`) переведені на `mapApiErrorToUserCopy(res.error, fallback)` — сирий `error.message` більше не протікає у UI. Деталі — у summary вище.

### F6: Pull-to-refresh під час активного sync — P2 ✅ Closed in #2743

**З 2026-05-03 §3.10** — PTR не повинен дозволяти подвійний тригер.

**Поточний стан коду:**

- [`PullToRefresh.tsx`](../../../apps/web/src/shared/components/ui/PullToRefresh.tsx) дозволяв тригерити `onRefresh()` повторно поки попередня не resolve-нула. Раніше була race; проп `enabled` існував, але не був wired-up з `requestCloudPull` state.

**Зроблено (PR #2743):**

- **Added** `useCloudPullPending()` hook у `apps/web/src/shared/hooks/useCloudPullPending.ts` — `useSyncExternalStore` обгортка над in-process counter `requestCloudPull`-ів, що повертає `true` поки хоч один pull у польоті.
- **Added** `subscribeCloudPullPending` / `getCloudPullPending` + захищений `Math.max(0, ...)` counter у [`cloudPullRequest.ts`](../../../apps/web/src/shared/lib/modules/cloudPullRequest.ts).
- **Changed** call-sites — `<PullToRefresh enabled={!cloudPullPending}>` у [`RoutineTimeline.tsx`](../../../apps/web/src/modules/routine/RoutineTimeline.tsx), [`NutritionApp.tsx`](../../../apps/web/src/modules/nutrition/NutritionApp.tsx), [`TransactionList.tsx`](../../../apps/web/src/modules/finyk/pages/transactions/TransactionList.tsx) (фактичний PTR call-site для finyk; `FinykApp.tsx` сам PTR не рендерить).
- **Tests:** 5 у `useCloudPullPending.test.tsx` (hook happy-path + overlap + timeout + behavior: spy на `HTMLDivElement.prototype.addEventListener` підтверджує, що `<PullToRefresh>` від'єднує touch-listener-и поки cloud-pull pending) + 3 у `cloudPullRequest.test.ts` (subscribe API, counter не йде в негатив на overlapping settles).

### F7: `useApiForm` rollout burndown — P2 ✅ Closed 2026-06-03

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

**UA note 2026-06-03 — CLOSED:**

Повний статус по кожній формі:

- `PersonalInfoSection.tsx` — **MIGRATED**: name-поле та email-поле переведені на окремі `useApiForm<NameValues>` / `useApiForm<EmailValues>` instances з zod-схемами (`nameSchema` / `emailSchema`). Помилки сервера тепер відображаються inline (через `serverError`) замість `toast.error`. Аватар, верифікація email — залишаються `async`-обробниками (не форми — немає `<form>` + submit, тому `useApiForm` не застосовний). Тест `PersonalInfoSection.test.tsx` оновлено: `error path` перевіряє `role="alert"` inline замість `toast.error`.
- `MemoryBankSection.tsx` — **SKIPPED (not applicable)**: не має форми з input-submit-flow. Компонент є списком записів з delete/undo, import/export (file-input), та chat-trigger. Жодного `<form>` або submit-callback — `useApiForm` не застосовний.
- `FinykLoginScreen.tsx` — **MIGRATED**: компонент переписано з prop-drilling (`tokenInput` / `onTokenInputChange` / `showToken` / `onToggleShowToken` / `toast`) на самостійну `useApiForm<TokenValues>` форму з zod-схемою (`token: z.string().trim().min(1)`). `onConnect` сигнатура змінена з `() => void` на `(token: string) => void`. `FinykApp.tsx` оновлено відповідно (видалено `tokenInput` / `showToken` state-клітинки та `toast` prop передачу). Клавіатурна вставка через `setValue` (RHF API) замість `register().onChange`.
- `WaitlistForm.tsx` — вже було на `useApiForm` (мігровано раніше). Змін не потрібно.

Typecheck: ✅ clean. ESLint: ✅ 0 errors. Form tests (PersonalInfoSection + MemoryBankSection + WaitlistForm): ✅ 18/18 passed.

## Прогрес виконання

| Item                            | Action                                                                                                                                                                                                                                                                                 | Status               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| F1 — Toast-policy + ESLint rule | Додано `sergeant-design/require-toast-error-action` з burndown allowlist; додано `docs/05-design/ui/toast-policy.md`; виправлено 2 high-traffic PTR-fail callsite-и; решта 14 файлів — у allowlist для burndown.                                                                       | DONE                 |
| F3 — Shortcuts registry doc     | Додано `docs/05-design/ui/shortcuts.md` — реєстр + browser-conflict matrix + TBD-handler-и зі `DEFAULT_SHORTCUTS`.                                                                                                                                                                     | DONE                 |
| F2-part-I — ESLint rule         | `sergeant-design/no-bare-fixed-inset-modal` warn-only rule додано.                                                                                                                                                                                                                     | DONE                 |
| F2-part-II — a11y fixes         | `FloatingActionButton`: `useDialogFocusTrap` + `useBodyScrollLock` замість hand-rolled listeners. `ModuleSettingsDrawer`: додано `useBodyScrollLock`. `QuickActionsMenu`, `CelebrationModal` (streak/confetti), `FeatureSpotlight` (не існує) — були вже коректними або не застосовні. | DONE 2026-06-03      |
| F4 — PWA SW defer               | Реалізовано в `useSWUpdate.ts` (defer + hard-timeout failsafe).                                                                                                                                                                                                                        | DONE (drift, closed) |
| F5 — error mapping              | `mapApiErrorToUserCopy` + 9 callsite-ів у `core/profile/*`.                                                                                                                                                                                                                            | DONE                 |
| F6 — PTR double-trigger         | `useCloudPullPending` + `enabled` prop wired у PR #2743.                                                                                                                                                                                                                               | DONE                 |
| F7 — useApiForm rollout         | `PersonalInfoSection` (name + email forms), `FinykLoginScreen` — мігровано. `MemoryBankSection` — не застосовно (немає submit-форм). `WaitlistForm` — вже був мігрований.                                                                                                              | DONE 2026-06-03      |

## Файли цього PR

```
docs/audits/2026-05-13-web-frontend-ergonomics-roast.md      (новий, цей файл)
docs/audits/README.md                                         (один рядок про новий roast)
docs/05-design/ui/toast-policy.md                                       (новий — F1)
docs/05-design/ui/shortcuts.md                                          (новий — F3)
packages/eslint-plugin-sergeant-design/index.js               (+1 rule)
packages/eslint-plugin-sergeant-design/__tests__/require-toast-error-action.test.mjs  (новий — 16 tests)
eslint.config.js                                              (+rule wiring, +allowlist read, +plugin self-exclusion)
apps/web/eslint.toast-error-action-allowlist.json             (новий — 14 legacy callsite-ів)
apps/web/src/modules/routine/useRoutineAppState.ts            (PTR-fail toast → action: { label, onClick })
apps/web/src/modules/nutrition/NutritionApp.tsx               (PTR-fail toast → action: { label, onClick })
```

## Що НЕ зроблено в цьому PR (next prozharkas)

- ~~**Modal a11y inventory + ESLint rule** (`no-bare-fixed-inset-modal`)~~ ✅ Closed F2-part-I + F2-part-II (2026-06-03).
- ~~**SW-update defer-while-streaming**~~ ✅ Closed F4 (drift — реалізовано в `useSWUpdate.ts`).
- ~~**`mapApiErrorToUserCopy(error)` централізована функція**~~ ✅ Закрито у F5 fix.
- ~~**`useApiForm` rollout**~~ ✅ Closed F7 (2026-06-03).
- **Keyboard-handler wire-up** (`Cmd+/`, `G H..N`) — окрема прожарка shortcuts-rollout. Залишається відкритим.

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
