# Web deep-dive — Frontend ergonomics & UX

> **Last validated:** 2026-05-04 by @Skords-01.
> **Status:** Active
> **Scope:** Forms, loading/empty/error states, Toast, Modal, mobile safe-area, PWA install banner, auth error translation, i18n readiness, feature-reveal pattern.
> **Related:** [`00-overview.md`](./00-overview.md), `docs/audits/UX-UI-AUDIT-2026.md`, `docs/audits/UX-IMPROVEMENT-PLAN.md`.

Це найбільш недоінвестований шар системи. Архітектура й сервер — на 8.5/10, форм-стек — десь 6/10. Нижче — точкова прожарка з конкретними fix points.

---

## 3.1 [Bad] Немає одного form-двигуна

**Що бачу.** `apps/web/src/shared/components/ui/Input.tsx` сам по собі чудовий: typed defaults, char counter, `aria-invalid`, `aria-live`. Але **навколо** нього — зоопарк:

- `apps/web/src/shared/hooks/useFormValidation.ts` — самопис.
- `apps/web/src/core/auth/AuthPage.tsx` — локальні `validate*`-функції.
- `PasswordStrengthBar` — inline у тому ж компоненті.
- Submit — fragmentований: десь `mutate({...}, { onSuccess, onError })`, десь свій async, десь інлайн.

Це означає, що 30+ форм у проєкті по-різному обробляють:

- Submit-loading state
- Field-level errors з сервера (per `fields[].path`)
- Reset on success
- Disabled submit if pristine
- Optimistic update + rollback

**Чому це дороге.** Кожен новий developer (включно з AI-агентами) має заново вчити «як саме у нас форми». Bug-и в одній формі не масштабуються на інші. UX-консистентність деградує.

**Recommendation / fix points.**

1. Прийняти **одне** з рішень і зробити це частиною Hard Rules:
   - **React Hook Form + zod resolver** — де-факто стандарт, найкращі community resources.
   - **Conform** — краще для server-mutations, але менш матчить існуючий стек.
   - **Власний `useForm({ schema, onSubmit })`** — гірше у довгій перспективі, але контроль вищий.
2. Створити `useApiForm(schema, mutationFn)` хук, який:
   - Ставить `isSubmitting` під час mutation;
   - Маршалює `details: [{ path, message }]` з 400-відповіді в `setFieldError(path, message)`;
   - Показує toast або scroll-to-first-error на validation fail;
   - Disabling submit if pristine;
   - Reset on success (опційно).
3. Замінити, **починаючи з high-traffic** форм:
   - Auth (sign-in, sign-up, forgot-password)
   - Finyk Transactions (create / edit)
   - Fizruk template editor
   - Nutrition food add
   - Routine task create
4. Додати ESLint custom rule (через `sergeant-design`-plugin): «JSX `<form>` має мати `data-form-id` атрибут АБО використовувати `useApiForm`». Це створить тиск довести міграцію до кінця.

**Tracker hook.** Після того, як вибір зроблено, винести план у `docs/audits/UX-IMPROVEMENT-PLAN.md` з KPI «N out of 30 forms migrated».

---

## 3.2 [Bad] Loading states — не бачу system-wide skeleton policy

> **2026-05-04 update.** Wrapper доданий: `<DataState>` у `apps/web/src/shared/components/ui/DataState.tsx` + 10 contract tests у `DataState.test.tsx`. Precedence error → loading → empty → success зафіксовано тестом, slot-и описані у JSDoc на пропсах. Експорт через UI-barrel (`shared/components/ui/index.ts`). Наступний крок — refactor високотрафічних екранів (`MonoTransactionsPanel`, `BudgetPanel`, `RoutineList`) на цей wrapper в окремих PR-ах.

**Що бачу.** Є `ModulePageLoader.tsx`, `PageTransition.tsx`, окремі `... loading` тексти всередині сторінок. Кожна сторінка вирішує сама. Skeleton-component-library немає; немає й уніфікованої політики «коли skeleton, коли spinner, коли nothing».

**Recommendation / fix points.**

Запровадити обгортку `<DataState>`:

```tsx
<DataState
  query={txQuery}
  skeleton={<TransactionListSkeleton />}
  empty={<EmptyTx onAdd={openCreate} />}
  error={(err, retry) => <ErrorTx error={err} onRetry={retry} />}
  stale={(data, isStale) => isStale && <Badge>оновлюється…</Badge>}
>
  {(data) => <TransactionList items={data} />}
</DataState>
```

Це single-spot для:

- Skeleton під час `isLoading`;
- Empty state з actionable CTA;
- Error state з retry;
- Stale state (`isStale`) → невеликий бейдж зверху, без блокування контенту.

Додатково:

- Вирівняти duration shimmer-анімації на всю апу.
- Forsovan'o — `useReducedMotion()` свідомо вимикає shimmer.
- Skeleton-структура має повторювати **layout** контенту (число рядків, висота карток), щоб не було LCP-strep'у.

**Where to start.** Найбільш помітні екрани: HubHomeView, кожен модульний `*Page`.

---

## 3.3 [Good] HubBottomNav — feature reveal з one-time toast

**Що бачу.** `apps/web/src/core/app/HubBottomNav.tsx:123-164` — справді гарний UX-патерн:
дочекатися, поки юзер створить «перший справжній запис», і тільки тоді відкрити Reports tab з bounce-анімацією + one-time toast.

**Чому це сильно.** Onboarding-friction знижується: юзер не бачить порожніх tab-ів до моменту, коли вони мають сенс. One-time toast пояснює зміну UI без переривання.

**Recommendation.** Закодифікуй цей паттерн як `useFeatureReveal(featureId, condition)` у `shared/hooks/`. API:

```ts
const { revealed, dismiss } = useFeatureReveal('reports', {
  condition: hasFirstTransaction,
  toast: 'Reports tab активований — спробуй зараз',
});
```

Persistence — через `safeReadLS('feature_reveal_reports')`. Це дозволить переюзати паттерн для інших модулів (наприклад, нутриція → Stats tab з'являється після 7 прийомів їжі).

---

## 3.4 [Bad] Toast-policy не задокументована

**Що бачу.** `useToast` + `<Toast>` базовий компонент є. Але:

- Немає правил, що вмістити в toast vs у inline error vs у modal.
- Немає policy на тривалість (success 3s? error до dismiss? sync issues — sticky?).
- Я бачу sync error toast, який тримається після login flow — але немає тестування «як юзер dismiss-ить його, якщо помилка не виправилась».
- `toast.error("Щось пішло не так")` без actionable retry — антипаттерн, який треба заборонити.

**Recommendation / fix points.**

1. Створити `docs/ui/toast-policy.md` з правилами:

   | Tone | Duration | Actionable | Приклад |
   | --- | --- | --- | --- |
   | success | 3s auto-dismiss | optional undo | «Транзакцію збережено [Undo]» |
   | info | 4s auto-dismiss | optional CTA | «Версія 2.4 доступна [Update]» |
   | warn | 6s auto-dismiss | optional CTA | «Слабкий зв'язок — синхронізація на паузі» |
   | error | until dismiss / retry | **обов'язково** retry | «Не вдалося синхронізувати [Retry]» |

2. ESLint rule (через `sergeant-design`): `toast.error(...)` без `action: { label, onClick }` → error.
3. Додати тест на toast queue: одночасно 5+ toast'ів повинні стекатися без overflow або loss.

---

## 3.5 [Bad] Modal/Sheet без єдиного focus-management контракту

**Що бачу.** `Modal.tsx` (232 рядки) має focus-trap. Є **два** хуки: `useFocusTrap` і `useDialogFocusTrap`. У `KeyboardShortcutsModal`, `ConfirmDialog`, `InputDialog`, `CelebrationModal` — кожен сам.

**Ризик.** Якщо хтось зробив custom dialog через `<div className="fixed inset-0">` (не через `<Modal>`), це автоматичний a11y-bug:

- Focus escape поза modal-ом;
- ESC не закриває;
- Scrim-click не закриває;
- Screen reader не оголошує `role=dialog`;
- Tab-cycle не циклує.

Я не запускав axe на всі сторінки, тож **гарантовано не знаю**, скільки таких dialog-ів є. Це треба перевірити CI-прогоном.

**Recommendation / fix points.**

1. ESLint custom rule: «JSX-element-name `Modal` only with prop `aria-labelledby` AND prop `role` (default `dialog`)».
2. Уніфікувати на **один** focus-trap hook (`useDialogFocusTrap`). Видалити `useFocusTrap` або зробити його alias.
3. У `Modal.tsx` додати **jest-axe** prop-test, який ловить `aria-modal`, `aria-labelledby`, `role=dialog` без тебе.
4. Додати у CI scan «grep `className=".*fixed inset-0"` поза `Modal.tsx` → fail». Brute-force, але дешево.

---

## 3.6 [Bad] Mobile inset / safe-area policy фрагментована

**Що бачу.** `useVisualKeyboardInset.ts`, `safe-area-inset-*` у різних компонентах, окремий `KeyboardAccessory.tsx`. Але:

- На iOS Safari динамічний адресний бар (URL bar collapse) робить `100vh` ненадійним. Не бачу `100dvh` policy документованої.
- iPhone notch + bottom-tab + onscreen-keyboard = трикутник, в якому деякі форми ховаються.
- `apps/mobile-shell` (Capacitor) має свої insets, які можуть розходитись з web.

**Recommendation / fix points.**

1. Створити `useSafeViewport()` хук:

   ```ts
   const { vh, kbInset, topInset, bottomInset } = useSafeViewport();
   // vh: 'dvh' | 'svh' | 'lvh' (preferred unit), kbInset: pixels
   ```

2. Замінити **всі** `min-h-screen` / `100vh` на `100dvh` через codemod (~15 файлів).
3. Додати E2E test (Playwright + iPhone emulation), який перевіряє, що bottom-CTA не накривається віртуальною клавіатурою при відкритій формі. Покрити: auth login, finyk create transaction, fizruk add exercise, nutrition add food, hubchat input.
4. Документувати в `docs/mobile/safe-area.md` різницю між web vs Capacitor inset обчисленнями.

---

## 3.7 [Good, але неповно] PWA install / iOS install banner / SW update

**Що бачу.** `usePwaInstall`, `useIosInstallBanner`, `useSWUpdate` — всі є. Але:

- Я не бачу A/B-experiment-flag на показ install-prompt. Користувачі його часто закривають → треба cooldown logic. Треба перевірити, чи `dismiss` ставить cooldown ≥7 днів.
- Update prompt — стандартний `[Update available] [Apply]`. Це OK. Але якщо юзер у сесії з активним AI-tool-call-ом (стрім), `applyUpdate` його перерве. Не бачу logic, який відкладає update до idle.

**Recommendation / fix points.**

1. Перевірити cooldown-policy у `usePwaInstall.ts` / `useIosInstallBanner.ts`. Якщо `dismiss` reset cooldown < 7 днів — піднімай.
2. **Defer-update-while-streaming** policy:
   - `useSWUpdate.applyUpdate()` чекає, поки `chatStreaming === false` І 5s idle;
   - У UI показувати «Update applies after current task» бейдж.
3. A/B-flag на install prompt: показувати тільки після ≥3 sessions ≥1 min (зараз, мабуть, відразу).
4. Tracking: PostHog event `pwa.install.prompt.shown / dismissed / accepted`. Виміряти conversion.

---

## 3.8 [Bad] AuthPage — error-translate сильна, але i18n узагалі немає

**Що бачу.** `apps/web/src/core/auth/AuthContext.tsx:51-100` — `translateAuthError` гарна функція, але вона **single-locale (uk)** з hardcoded strings. Немає `i18next`, немає `lingui`, немає **навіть constants-файла перекладів**.

**Чому це попередження, не блокер.** Якщо найближчі 6 місяців MVP лишається UA-only — це не proмarket-ризик. Але якщо колись з'явиться англомовний онбординг (а проєкт має продукт-потенціал) — треба буде переписати цей шар end-to-end.

**Recommendation / fix points.**

1. Завести `apps/web/src/shared/i18n/uk.ts` з усіма hardcoded strings (auth, sync errors, validation messages, empty states). Це **поки не runtime-i18n**, просто constants:

   ```ts
   export const messages = {
     auth: {
       invalidCredentials: 'Невірний email або пароль',
       emailTaken: 'Цей email вже зареєстровано',
       // ...
     },
     sync: { ... },
     validation: { ... },
   };
   ```

2. Накласти ESLint custom-rule «no inline string literals у JSX, що мають літеру з кирилицею» — це підготує ґрунт для майбутньої міграції на runtime-i18n.
3. Не впроваджувати i18n-runtime, **поки** нема product-вимоги. Але мати готову карту: «messages → t('messages.auth.invalidCredentials')» — однорядкова заміна на момент Х.
4. Документ `docs/i18n/readiness.md` з checklist'ом для переходу.

**Point of no return.** Якщо проєкт почне приймати англомовних beta-юзерів без runtime-i18n — це debt буде дорожче з кожним релізом.

---

## 3.9 [Mixed] Анімації / `prefers-reduced-motion` — глобально не форсовано

**Що бачу.** `useReducedMotion` хук є. Але я не побачив гарантії, що **ВСІ** animations (Framer Motion components, Tailwind `animate-*`, CSS transitions у `index.css`) його поважають. axe не ловить це автоматично.

**Recommendation / fix points.**

1. Створити `<MotionGate>` wrapper, який видає `null` для анімаційних variant-ів, якщо `useReducedMotion()`.
2. У `index.css` додати:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
   }
   ```
   Це brute-force, але гарантовано покриває все.
3. Manual smoke-test з macOS / iOS «Reduce motion» увімкненим.

---

## 3.10 [Mixed] Pull-to-refresh / iOS PWA конфлікти

**Що бачу.** `usePullToRefresh` хук є. Native-style? На iOS PWA пишається — перевір, що не конфліктує з SW navigations cache.

**Recommendation.**

- Додати тест на «pull-to-refresh during pending sync» — не повинно стартувати другу sync queue.
- Disable pull-to-refresh, поки `useSWUpdate.updating === true`.
- Document expected behavior у `docs/mobile/pull-to-refresh.md`.

---

## 3.11 [Mixed] KeyboardShortcutsModal — конфлікти з браузерними shortcut-ами

**Що бачу.** Гарна фіча, але у браузері:

- `Ctrl+K` = location bar focus у Firefox / Edge.
- `Ctrl+L` = location bar focus всюди.
- `Ctrl+/` — стандартний для «show shortcuts» у багатьох SaaS (GitHub, Notion).

**Recommendation.**

- Перевірити registry shortcut-ів на конфлікти з топ-5 браузерами.
- Use `Cmd/Ctrl+/` як conventional shortcut for "show shortcuts" (зараз, мабуть, інший).
- Документувати в `docs/ui/shortcuts.md`.

---

## 3.12 [Bad] `useDarkMode` — manual toggle, нема system-default detection

**Що бачу.** Manual toggle через `useDarkMode`. Не бачу `prefers-color-scheme` listener або «follow system» опції.

**Recommendation / fix points.**

1. Tri-state: `'light' | 'dark' | 'auto'`. `auto` слухає `window.matchMedia('(prefers-color-scheme: dark)')`.
2. Default — `auto`. Manual toggle — переходить у explicit.
3. Persist у `safeReadLS('theme')`.
4. Додати тест: switch system theme → app оновлює клас `.dark` без перезавантаження.

---

## Прив'язка до roadmap (00-overview)

| Item у roadmap | Section тут |
| --- | --- |
| Form-engine unification | §3.1 |
| `<DataState>` wrapper | §3.2 |
| Toast policy + ESLint rule | §3.4 |
| Modal a11y rule + axe-prop-test | §3.5 |
| Safe-viewport + `100dvh` codemod | §3.6 |
| PWA install A/B + defer-update-while-streaming | §3.7 |
| i18n key extraction (UA-only) | §3.8 |
| `prefers-reduced-motion` global gate | §3.9 |

> **Tracker hook.** Коли з'явиться чек-лист реалізації, винеси у `docs/audits/UX-IMPROVEMENT-PLAN.md` (Active) з KPI на квартал.
