# Page Audit — Auth & Onboarding pages

> **Last validated:** 2026-05-13 by Devin (child session).
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Scope slug:** `01-auth-onboarding`
> **Audit type:** static analysis (no dev server, no code changes)
> **Pages in scope:**
>
> - `AuthPage` (`apps/web/src/core/auth/AuthPage.tsx`)
> - `AuthContext` / `authClient` (`apps/web/src/core/auth/AuthContext.tsx`, `authClient.ts`)
> - `ResetPasswordPage` (`apps/web/src/core/auth/ResetPasswordPage.tsx`)
> - Scaffolded auth siblings (`LoginForm.tsx`, `RegisterForm.tsx`, `GoogleSignInButton.tsx`, `ForgotPasswordPanel.tsx`, `useForgotPassword.ts`, `authSchemas.ts`, `authFormPrimitives.tsx`)
> - `OnboardingWizard` + `WelcomeOneScreen` + `useOnboardingWizardState` (`apps/web/src/core/onboarding/`)
> - `ModuleRow`, `ModuleChecklist`, `PresetSheet`, `FirstActionSheet`
> - `DemoModeBanner`, `DailyNudge`, `ReEngagementCard`, `CelebrationModal`, `SoftAuthPromptCard`, `FirstRunHintBanner`, `PermissionsPrompt`
> - Onboarding hooks / utils (`useOnboardingState`, `useFirstEntryCelebration`, `useModuleFirstRun`, `onboardingGate`, `firstRealEntry`, `picksStorage`, `vibePicks`, `presetApply`, `presetPrefill`)
> - `seedDemoData/*`, `seedDemoData.ts`, `demoSeed.ts`, `cleanupDemoData.ts`

## Summary

| Severity  | Count  |
| --------- | ------ |
| Critical  | 0      |
| High      | 6      |
| Medium    | 14     |
| Low       | 5      |
| **Total** | **25** |

Three themes dominate the scope:

1. **Auth styling is silently broken.** 14 occurrences of `text-error` / `bg-error` / `border-error` across the auth tree reference a colour token that does not exist in `@sergeant/design-tokens` (the registered status token is `danger`). Tailwind silently drops unknown utilities, so the password-strength bar, server-error banners, and reset-password "no-token" alert render with no colour at all. Same file (`ResetPasswordPage.tsx`) even mixes `text-danger` (correct) and `text-error` (broken) across siblings, proving the inconsistency.
2. **Hard Rule #18 (max-lines: 600) is knowingly violated in `AuthPage.tsx` (693 LOC)** and an entire decomposition (`LoginForm.tsx`, `RegisterForm.tsx`, `GoogleSignInButton.tsx`, `ForgotPasswordPanel.tsx`, `useForgotPassword.ts`, `authSchemas.ts`, `authFormPrimitives.tsx`) sits scaffolded-but-unwired next to it. The scaffolded files' own JSDoc admits this in `useForgotPassword.ts:1–11`. Net result: duplicate code paths, untested live code, lint flag ignored.
3. **Touch-target discipline collapses outside the `Button` component.** Five FTUX surfaces (`DailyNudge` x 2, `DemoModeBanner`, `SoftAuthPromptCard`, `ReEngagementCard`, `FirstRunHintBanner`) inline plain `<button>` elements with `w-6 h-6` / `w-8 h-8` / `px-3 py-2` / `min-h-[40px]` that ship 24–32 px hit-areas — well under the WCAG 2.5.5 / Apple-HIG 44×44 floor that the root `AGENTS.md` § Touch targets calls out as the project contract.

Secondary themes: missing `Last validated:` / `Status:` markers (Hard Rule #10) on every file in scope, sparse use of `AI-CONTEXT` / `AI-DANGER` markers in high-risk auth code, fragile `as <Type>` casts around Better Auth's Proxy-based client, raw-localStorage writes that bypass the `@shared/storage` allowlist, and naive Ukrainian pluralization in `ReEngagementCard`.

## Findings

### F1 — `text-error` / `bg-error` / `border-error` token does not exist [severity: high] [perspective: tailwind/ux/bug]

**Page:** AuthPage, LoginForm (scaffolded), RegisterForm (scaffolded), ForgotPasswordPanel, authFormPrimitives, ResetPasswordPage
**File:** `apps/web/src/core/auth/AuthPage.tsx`, `authFormPrimitives.tsx`, `ResetPasswordPage.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordPanel.tsx`
**Lines:** 14 occurrences total — e.g. `AuthPage.tsx:60`, `:63`, `:119`, `:237`, `:384`, `:597`; `authFormPrimitives.tsx:24`, `:27`, `:107`; `ResetPasswordPage.tsx:114`, `:201`; `ForgotPasswordPanel.tsx:79`; `LoginForm.tsx:128`; `RegisterForm.tsx:147`.

**Description.**
`packages/design-tokens/tailwind-preset.js:122–129` registers status colours `success`, `danger`, `warning`, `info` (each with `-soft` and `-strong` companions) — **there is no `error` token**. `apps/web/tailwind.config.js` only extends with the design-tokens preset; `apps/web/src/index.css` has no `--c-error` variable. In Tailwind 4 unknown utility classes are silently dropped, so the password-strength bar (`["bg-error", "bg-amber-400", "bg-brand-500"]`), the AuthPage server-error banner, the reset-password "Посилання неповне" alert, and the FieldError text all paint with no colour at all. The same file `ResetPasswordPage.tsx` uses `text-danger` correctly at L158 / L189 for per-field errors but `text-error` / `bg-error` at L114 / L201 for surface-level errors — proof the token name is a mistake, not an intentional alias.

**Why it matters.**
Users see an unstyled "weakest password" segment in the strength bar, an unstyled server-error banner ("Невірний пароль" with no red/no panel), and an unstyled "link expired" alert on the reset-password landing. Worst case: a sign-in failure looks like a no-op because the error text has no `text-danger` colour and blends into body text.

**Recommendation.**
Either (a) replace all 14 occurrences with `text-danger` / `bg-danger` / `border-danger` (and use `-soft` for the soft-tinted backgrounds, e.g. `bg-danger-soft`), or (b) add `error` as a semantic alias of `danger` in `tailwind-preset.js`:

```js
// packages/design-tokens/tailwind-preset.js — inside `colors:`
error: statusColors.danger,
"error-soft": "rgb(var(--c-danger-soft) / <alpha-value>)",
"error-strong": "#b91c1c",
```

Prefer (a) — fewer aliases, single source of truth. Add an ESLint custom rule (`sergeant-design/known-color-tokens`) so the next typo (e.g. `text-err`) is caught at PR time.

---

### F2 — `AuthPage.tsx` exceeds Hard Rule #18 max-lines budget [severity: high] [perspective: rule]

**Page:** AuthPage
**File:** `apps/web/src/core/auth/AuthPage.tsx`
**Lines:** L1–L693 (whole file)

**Description.**
`AuthPage.tsx` is 693 lines. The root `AGENTS.md` § Hard rules and `docs/governance/rules/18-module-size-discipline-600.md` enforce `max-lines: 600` on web TS/TSX. The file inlines `PasswordStrengthBar`, `PasswordVisibilityToggle`, `FieldError`, `LoginForm`, `RegisterForm`, the Google OAuth button (with inline SVG), and the forgot-password panel — every one of which has an extracted sibling sitting next to it (see F3).

**Why it matters.**
`active-initiative` Hard Rule with a recorded TODO. The file's own siblings document the violation in their JSDoc (`useForgotPassword.ts:3–10`: «PR #2586 re-inlined AuthPage UX … and reverted the decomposition — `AuthPage.tsx` is now 693 LOC again»). The lint budget exists because beyond 600 LOC the code becomes very hard to review — every Auth change now touches a file that combines five distinct responsibilities (validation, OAuth, password reset, password meter, visibility toggle).

**Recommendation.**
Wire `AuthPage.tsx` to import the existing scaffolded siblings (`LoginForm`, `RegisterForm`, `GoogleSignInButton`, `ForgotPasswordPanel`, `useForgotPassword`, `PasswordStrengthBar`, `PasswordVisibilityToggle`, `FieldError`) and delete the inline copies. Target ≤300 LOC for the composition root. Tracked in the 2026-05-13 dead-code roast § P1.6 per `useForgotPassword.ts:10`.

---

### F3 — Scaffolded auth decomposition is dead code [severity: high] [perspective: rule/code-quality]

**Page:** AuthPage
**Files:**

- `apps/web/src/core/auth/LoginForm.tsx`
- `apps/web/src/core/auth/RegisterForm.tsx`
- `apps/web/src/core/auth/GoogleSignInButton.tsx`
- `apps/web/src/core/auth/ForgotPasswordPanel.tsx`
- `apps/web/src/core/auth/useForgotPassword.ts`
- `apps/web/src/core/auth/authSchemas.ts`
- `apps/web/src/core/auth/authFormPrimitives.tsx`

**Lines:** Each file's `@scaffolded` JSDoc header (L1–L11); `AuthPage.tsx:130` (`function LoginForm(...)`), `:260` (`function RegisterForm(...)`), `:532` / `:538` (call sites of the _inline_ copies).

**Description.**
`grep -rn 'LoginForm\|RegisterForm\|...'` for non-test importers returns only `AuthPage.tsx` itself — and AuthPage references its own _inline_ `function LoginForm` / `function RegisterForm` declared at L130 / L260, not the scaffolded sibling exports. The siblings exist with `@scaffolded` markers and even have their own `.test.tsx` files (e.g. `LoginForm.test.tsx` would be testing a dead file). `useForgotPassword.ts:3–11` acknowledges this in its JSDoc:

> `@scaffolded — extracted from AuthPage.tsx by [a53e10b0]… [PR #2586] re-inlined AuthPage UX (autocomplete, password toggle, errors) and reverted the decomposition — AuthPage.tsx is now 693 LOC again. These helpers stay as the canonical re-decomposition target.`

**Why it matters.**
Two divergent copies of auth UX (one shipped, one tested). A bug fixed in the inline `LoginForm` inside `AuthPage.tsx` will not flow into `LoginForm.tsx`, and vice versa. Test coverage may target the dead path. This is exactly the carcass Rule #18 was designed to prevent.

**Recommendation.**
Either (a) finish the decomposition this sprint — wire AuthPage to the scaffolded siblings (see F2), or (b) delete the scaffolded siblings + their tests + cite the rationale in an ADR. Do not let both copies coexist past 2026-05-31.

---

### F4 — `PermissionsPrompt.tsx` is unwired dead code [severity: high] [perspective: code-quality]

**Page:** Onboarding (legacy)
**File:** `apps/web/src/core/onboarding/PermissionsPrompt.tsx`
**Lines:** L1–L263 (whole file)

**Description.**
The component renders a "permissions interstitial" (push / mic / camera) and is documented as «фінальний інтерстиціал онбордингу». But `grep PermissionsPrompt apps/web/src` returns only `PermissionsPrompt.tsx` itself and `PermissionsPrompt.test.tsx` — no production import path. The new one-screen wizard (`WelcomeOneScreen` → `OnboardingWizard`) explicitly skipped permissions (`picksStorage.ts:14–17`: «the permissions interstitial became a just-in-time prompt inside the modules that need them»).

**Why it matters.**
263 LOC of unwired UI + 153 LOC of tests for a flow no user ever sees. Bundle bloat (lazy-loaded but still ships when the module barrel pulls it in), and the next maintainer is misled into thinking permissions are still gathered up-front.

**Recommendation.**
Delete `PermissionsPrompt.tsx` and `PermissionsPrompt.test.tsx`. Repoint the JSDoc reference in `picksStorage.ts:14–17` to the actual just-in-time prompt sites (e.g. `usePushNotifications` in each module). If the component is intended to be reintroduced after a roadmap item, mark it `AI-LEGACY: expires YYYY-MM-DD` per Rule #10 / AI-marker contract.

---

### F5 — CelebrationModal hijacks global Enter/Space keydowns [severity: high] [perspective: bug/a11y]

**Page:** Hub (post-FTUX celebration)
**File:** `apps/web/src/core/onboarding/CelebrationModal.tsx`
**Lines:** L123–L133

**Description.**

```ts
useEffect(() => {
  if (!visible) return;
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClose();
    }
  };
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [visible, handleClose]);
```

The listener is attached to `window`, not the modal node, and calls `preventDefault()` for **Enter**, **Space**, and **Escape** as long as `visible` is true. Backdrop is focusable (`backdropRef`) but the modal does not trap focus. Result: while the celebration overlay is on screen, **any** Space press scrolls nothing, and **any** Enter press fires `handleClose()` instead of activating the focused element (e.g. an OS notification button, an autocomplete suggestion, a focused button inside the modal — both fire, then the modal closes).

**Why it matters.**
A11y regression — keyboard users who pause at the modal to read copy lose default Space scroll. The "Continue" button inside the modal triggers two effects (button onClick + this handler). Background page focus is broken until the modal auto-dismisses 10 s later. Worst case: dismiss + accidental navigation if a focused link is in the page behind the backdrop.

**Recommendation.**
Scope the listener to the modal element (`backdropRef.current?.addEventListener(...)`) and don't `preventDefault()` Space; only Escape should close. Inside the modal, the "Continue" button handles Enter naturally via the standard `<button>` keyboard contract — no extra global listener needed. Add a focus trap (the project already has `useDialogFocusTrap` — used in `OnboardingWizard.tsx:5`).

---

### F6 — "Забули пароль?" never pre-fills the email the user typed [severity: high] [perspective: bug]

**Page:** AuthPage (login tab)
**File:** `apps/web/src/core/auth/AuthPage.tsx`
**Lines:** L166, L203

**Description.**

```ts
// Стежимо за поточним email у полі — потрібен <button "Забули пароль">…
const emailValue = formState.defaultValues?.email ?? "";
…
onClick={() => onForgotPassword(emailValue)}
```

`formState.defaultValues` is react-hook-form's record of the **initial** defaults (passed to `useApiForm` as `{ email: "", password: "" }`), not the live input. It never changes as the user types. So `emailValue` is permanently `""` and the forgot-password panel opens with an empty email even though the user just typed one in. The sibling `RegisterForm` does it correctly at L304 with `const passwordValue = watch("password") ?? "";`.

**Why it matters.**
Users who already typed their email and clicked the "Забули пароль?" link have to type the email again. The whole purpose of the prefill JSDoc comment ("Стежимо за поточним email у полі") is defeated. Friction at the worst possible moment (user can't log in and is trying to recover their account).

**Recommendation.**
Replace with `watch("email")`:

```ts
const { register, submit, formState, isSubmitting, watch } = useApiForm<LoginValues, boolean>({ … });
const emailValue = watch("email") ?? "";
```

Add a regression test in `AuthPage.test.tsx`: type "user@example.com" → click "Забули пароль?" → assert the forgot-panel email input receives `"user@example.com"`.

---

### F7 — DailyNudge close X is `w-6 h-6` (24×24) — half the touch-target floor [severity: medium] [perspective: a11y]

**Page:** Hub (DailyNudge)
**File:** `apps/web/src/core/onboarding/DailyNudge.tsx`
**Lines:** L104–L111

**Description.**
The dismiss `<button>` declares `w-6 h-6` (24×24 px). WCAG 2.5.5 (Target Size, AAA) and Apple HIG mandate ≥44×44 for primary controls; the project's own `AGENTS.md § Touch targets` codifies the same minimum. The `Button` component auto-applies `min-h-[44px] min-w-[44px]`, but this inline `<button>` bypasses it. No `data-compact` attribute either — the project's opt-out for genuinely small cells (heatmaps).

**Why it matters.**
Mis-taps. Users on touch devices have to thread a 24 px target while the rest of the screen is 16 px text. Apple's Human Interface Guidelines documents this as a primary reason for tap-rejection metrics.

**Recommendation.**
Either swap to `<Button variant="ghost" size="xs" iconOnly aria-label="Закрити">` (which auto-applies `min-h-[44px] min-w-[44px]`), or wrap the icon in a wrapper with `min-h-[44px] min-w-[44px]` and centre the 24 px icon inside. Same pattern as `DemoModeBanner.tsx:91` uses correctly.

---

### F8 — DailyNudge popover trigger is `w-8 h-8` (32×32) — below touch-target floor [severity: medium] [perspective: a11y]

**Page:** Hub (DailyNudge)
**File:** `apps/web/src/core/onboarding/DailyNudge.tsx`
**Lines:** L82–L92

**Description.**
The Popover trigger renders an inline `<button>` with `w-8 h-8` (32×32 px). Same root cause as F7: avoiding the design-system `Button` skips the auto-applied touch-target floor.

**Why it matters.**
Same as F7 — 32 px is still below the contract. The trigger sits next to a 44×44 `Button variant="primary" size="xs"`, so the inconsistency is visible: one button is comfortable, the next is fiddly.

**Recommendation.**
Use the `Button` primitive with `iconOnly` + `aria-label="Інші дії"`, or add `min-h-[44px] min-w-[44px]` to the wrapping `<button>`.

---

### F9 — DemoModeBanner CTA forces `min-h-[40px]` below touch-target floor [severity: medium] [perspective: a11y]

**Page:** Hub (DemoModeBanner)
**File:** `apps/web/src/core/onboarding/DemoModeBanner.tsx`
**Lines:** L101–L109

**Description.**

```tsx
<Button
  type="button"
  variant="primary"
  size="sm"
  className="flex-1 min-h-[40px]"
  onClick={goToWizard}
>
  Створити свій
</Button>
```

The `Button` size=`sm` auto-applies `min-h-[44px]`, but the inline `className="min-h-[40px]"` overrides it (Tailwind's last-class wins). Net hit-area: 40 px, below the 44 px floor.

**Why it matters.**
Even more egregious than F7/F8 — the project's `Button` component would have done the right thing, but a bespoke override took 4 px out. Probably copy-pasted from a non-Button context.

**Recommendation.**
Drop the `min-h-[40px]` from `className` and trust the Button primitive. If the visual height needs to feel tighter, use `size="sm"` paired with `data-compact` and document the exception inline.

---

### F10 — SoftAuthPromptCard "Пізніше" plain button is ~28 px tall [severity: medium] [perspective: a11y]

**Page:** Hub (SoftAuthPromptCard)
**File:** `apps/web/src/core/onboarding/SoftAuthPromptCard.tsx`
**Lines:** L101–L107

**Description.**

```tsx
<button
  type="button"
  onClick={handleDismiss}
  className="text-xs text-muted hover:text-text px-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
>
  {messages.actions.later}
</button>
```

`text-xs` = 12 px line-height ~16 px, `py-2` = 8 px each side = ~32 px tall hit-area, but the visual click target is the text bounding box (~28 px). The sibling "Створити акаунт" is a proper `<Button>` with the 44 px floor; the secondary "Пізніше" loses ~16 px.

**Why it matters.**
Same root cause as F7–F9. The button is a real user action (dismisses the prompt for the session), not a tooltip; it deserves the 44 px floor.

**Recommendation.**
`<Button variant="ghost" size="sm">{messages.actions.later}</Button>` or wrap with the `touch-target` utility (defined in `apps/web/src/index.css` per the root `AGENTS.md § Touch targets`).

---

### F11 — ReEngagementCard "Пізніше" plain button is ~28 px tall [severity: medium] [perspective: a11y]

**Page:** Hub (ReEngagementCard)
**File:** `apps/web/src/core/onboarding/ReEngagementCard.tsx`
**Lines:** L49–L55

**Description.**
Same pattern as F10: a `text-xs … px-3 py-2 rounded-xl` plain `<button>` next to a proper `<Button>` primary. ~28 px hit-area. The card is shown to returning users who have been inactive — punishing them for coming back with a too-small dismiss control is the wrong UX gradient.

**Recommendation.**
Same as F10. Standardize secondary "Later" / "Пізніше" CTAs across `SoftAuthPromptCard`, `ReEngagementCard`, `DailyNudge` on a shared design-system primitive that guarantees 44×44 hit-area.

---

### F12 — FirstRunHintBanner CTA `px-2.5 py-1` is ~26 px tall [severity: medium] [perspective: a11y]

**Page:** Module first-run hint (nutrition / finyk / routine)
**File:** `apps/web/src/core/onboarding/FirstRunHintBanner.tsx`
**Lines:** L88–L99

**Description.**

```tsx
<button
  type="button"
  onClick={onDismiss}
  className={cn(
    "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1",
    "text-xs font-semibold transition-colors",
    v.cta,
  )}
>
  {ctaLabel}
</button>
```

`py-1` = 4 px each side + `text-xs` ~16 px = ~24–26 px hit-area. The banner is the _only_ place where a user can dismiss this first-run hint inside a module — making it small is a soft trap.

**Recommendation.**
Promote to `<Button variant="secondary" size="sm">{ctaLabel}</Button>` so the 44 px floor and design-system focus styling come for free. Module-accent containment (Rule #12) still holds because `v.cta` only sets text/border colours within the module subtree.

---

### F13 — ReEngagementCard pluralization breaks for 11–14 [severity: medium] [perspective: i18n/bug]

**Page:** Hub (ReEngagementCard)
**File:** `apps/web/src/core/onboarding/ReEngagementCard.tsx`
**Lines:** L38–L42

**Description.**

```tsx
<p className="text-xs text-muted leading-relaxed max-w-xs">
  Тебе не було {daysInactive}{" "}
  {daysInactive === 1 ? "день" : daysInactive < 5 ? "дні" : "днів"}. …
</p>
```

Ukrainian pluralization has a special "few" form for `n mod 10 ∈ {2,3,4}` **except when `n mod 100 ∈ {11..14}`**. The naive ladder produces:

| `daysInactive` | Current output                                                                | Correct |
| -------------- | ----------------------------------------------------------------------------- | ------- |
| 1              | 1 день                                                                        | 1 день  |
| 2              | 2 дні                                                                         | 2 дні   |
| 5              | 5 днів                                                                        | 5 днів  |
| **11**         | **11 днів**                                                                   | 11 днів |
| **12**         | **12 днів** (current returns "12 днів" — checked: `12 < 5` is false → "днів") | 12 днів |

Actually re-evaluating: `daysInactive === 1 ? "день" : daysInactive < 5 ? "дні" : "днів"` returns:

| `daysInactive` | Current  | Correct  |
| -------------- | -------- | -------- |
| 1              | день     | день     |
| 2              | дні      | дні      |
| 4              | дні      | дні      |
| 5–14           | днів     | днів     |
| **21**         | **днів** | **день** |
| **22**         | **днів** | **дні**  |
| **31**         | **днів** | **день** |

So the bug is at multiples-of-10-plus-1 / -2/3/4 (21 days, 22 days, 31 days, 32 days, …). The card is unlikely to show >30 days inactive, but the i18n contract still says "use the project plural helper".

**Recommendation.**
Use `Intl.PluralRules('uk', { type: 'cardinal' })` or the existing helper in `@sergeant/shared` (`pluralize-uk` style — search for `pluralUk`/`pluralizeUk`). Example:

```ts
const pr = new Intl.PluralRules("uk-UA");
const forms = { one: "день", few: "дні", many: "днів", other: "днів" };
const word = forms[pr.select(daysInactive)] ?? "днів";
```

---

### F14 — Lifecycle markers missing on every file in scope [severity: medium] [perspective: lifecycle]

**Page:** All in-scope files
**File:** entire `apps/web/src/core/auth/` and `apps/web/src/core/onboarding/`
**Lines:** Top-of-file JSDoc / module header missing.

**Description.**
Hard Rule #10 (`docs/governance/rules/10-lifecycle-markers.md`) requires `Last validated:` and `Status:` markers on every file/doc. `grep "Last validated:\\|Status: Active\\|Status: Scaffolded" apps/web/src/core/auth apps/web/src/core/onboarding` finds **zero matches** — only seven `@scaffolded` annotations on the unwired auth siblings (no `Last validated:` date attached). Onboarding files describe their status in prose comments (e.g. `picksStorage.ts:13–19` describes "the one-screen rebuild") but never with the canonical marker shape.

**Why it matters.**
Without machine-readable lifecycle markers, `pnpm lint:lifecycle-markers` (if it covers TS/TSX) cannot tell active code from scaffolded carcasses (F3, F4) from deprecated demo paths. The audit itself relied on prose comments to disambiguate state.

**Recommendation.**
Add a 3-line block at the top of each in-scope file:

```ts
/**
 * Last validated: 2026-05-13 — owner: @Skords-01 (frontend).
 * Status: Active
 */
```

For the scaffolded auth siblings (F3): `Status: Scaffolded` with a TODO link to the re-decomposition tracking issue. For `PermissionsPrompt.tsx` (F4): `Status: Deprecated` or delete.

---

### F15 — AI markers under-used in high-risk auth code [severity: medium] [perspective: ai-marker]

> **Closure note (2026-05-31, audits-runner triage):** Resolved. AI markers додано на всі 5 рекомендованих точок: `AI-CONTEXT` на `AuthContext.translateAuthError`, `authClient.typedAuthClient` cast, `useOnboardingWizardState` variant assignment, `presetApply.applyFinykPreset` direct-LS write; `AI-DANGER` на `AuthContext` PostHog identify ref-effect (auth-state transition) і `cleanupDemoData.runDemoCleanupOnce` (one-shot guard).

**Page:** Auth tree, OnboardingWizard
**File:** `apps/web/src/core/auth/*`, `apps/web/src/core/onboarding/*`
**Lines:** Only one `AI-NOTE` in scope (`OnboardingWizard.ux.test.tsx:29`); zero `AI-CONTEXT` / `AI-DANGER` / `AI-LEGACY` markers anywhere in the auth tree or wizard.

**Description.**
`AuthContext.tsx:53–99` (`translateAuthError`) and `authClient.ts:75–135` (the Better Auth Proxy + manual type-extension) are precisely the sort of "high-risk zone" the `AI-DANGER` marker exists for — a typo in the error-code switch or in the `as ReturnType<...> & {...}` cast (F21) silently breaks login. Yet none of them carry markers. `presetApply.ts` likewise pokes `localStorage` directly with a long prose justification but no `AI-CONTEXT` tag.

**Recommendation.**
Add `AI-CONTEXT:` on `AuthContext.translateAuthError`, `authClient.typedAuthClient` cast, `useOnboardingWizardState` variant assignment, `presetApply.applyFinykPreset` direct-LS write. Add `AI-DANGER:` on the auth-state transitions (`login` / `logout` / PostHog identify ref) and on `cleanupDemoData.runDemoCleanupOnce` (one-shot per device — a bug here re-nukes user data on re-runs).

---

### F16 — `presetApply.ts` bypasses module storage public API [severity: medium] [perspective: code-quality]

**Page:** PresetSheet
**File:** `apps/web/src/core/onboarding/presetApply.ts`
**Lines:** L24–L30 (key constants), L150–L172 (`applyFinykPreset`), and similar `applyRoutinePreset` / `applyFizrukPreset` / `applyNutritionPreset` below.

**Description.**
The module deliberately writes the four modules' canonical storage keys (`finyk_manual_expenses_v1`, `hub_routine_v1`, `fizruk_workouts_v1`, `nutrition_log_v1`) directly through `@shared/storage`'s `safeReadLS` / `safeWriteLS`, skipping each module's own `createModuleStorage` debounced API. The JSDoc justifies it («those APIs are debounced … the FTUX celebration needs the entry to be visible on the very next render») and even mentions tombstone-ключі in the inline comments.

**Why it matters.**
The contract documented next to the storage allowlist (`pnpm lint:localstorage-allowlist`) is that all writes to module-owned keys go through `createModuleStorage`. The direct write here means:

- Future schema bumps (e.g. `v1` → `v2`) in any module must remember to also bump this file, or presets silently write into a stale shape.
- Cross-device sync via SQLite op-log v2 (referenced in `cleanupDemoData.ts:37–39`) might or might not pick up the preset entry depending on which path is the source of truth for that particular boot.
- Debounced API exists for a reason (rapid writes coalesce); bypassing it on FTUX means a double-tap on the same tile _can_ create two entries.

**Recommendation.**
Either:

1. Add a `createModuleStorage().flushSync()` API that lets FTUX bypass the debounce without bypassing the API; route `presetApply` through it.
2. Or accept the workaround and add a CI guard that fails if `presetApply.ts` writes a key that's been renamed in the module's storageKeys file.

At minimum, add `AI-CONTEXT:` markers (see F15) on each `apply*Preset` writer.

---

### F17 — `seedDemoData.ts` bypasses storage allowlist [severity: medium] [perspective: code-quality]

**Page:** Demo seeding (`?demo=1`)
**File:** `apps/web/src/core/onboarding/seedDemoData.ts`, `seedDemoData/utils.ts`
**Lines:** L46 (`import { removeKey, writeRaw } from "./seedDemoData/utils";`), L74–L94 (`seedDemoData()` / `resetDemoData()`)

**Description.**
The seeder calls `writeRaw(DEMO_FLAG_KEY, "1")` and `removeKey(...)` helpers that touch `window.localStorage` directly (see `seedDemoData/utils.ts`). `@shared/lib/storage/storage` exposes `safeWriteLS` / `safeRemoveLS` precisely so the allowlist linter (`pnpm lint:localstorage-allowlist`) can audit every write.

**Why it matters.**
Same root cause as F16 — bypassing the wrapper means the allowlist linter doesn't see these writes; if a key is renamed elsewhere, the seeder silently writes to a tombstone'd legacy key. Demo mode is widely used for screenshots and marketing — silent regressions don't show up until a customer complains the demo no longer renders charts.

**Recommendation.**
Replace `writeRaw` / `removeKey` with `safeWriteLS` / `safeRemoveLS`. If string-only payloads must round-trip without `JSON.stringify` (e.g. `"1"` flag), prefer a dedicated `safeWriteStringLS` helper rather than a raw localStorage call.

---

### F18 — CelebrationModal auto-dismiss timer races user input [severity: medium] [perspective: ux/race]

**Page:** Hub (first-entry celebration)
**File:** `apps/web/src/core/onboarding/CelebrationModal.tsx`
**Lines:** L113–L120

**Description.**

```ts
useEffect(() => {
  if (!visible) return;
  const timer = setTimeout(() => {
    handleClose();
  }, 10000);
  return () => clearTimeout(timer);
}, [visible, handleClose]);
```

10 s auto-dismiss. If the user is reading the copy (multi-line headline + subtitle + tip + primary CTA per the JSDoc at L150–L154) and reaches for the CTA at 9.5 s, the close fires while their finger is mid-tap — the modal disappears and the tap lands on whatever's under the backdrop. Combined with F5 (global Enter/Space handler), the user can also accidentally double-fire.

**Why it matters.**
This is the FTUX 30-second-promise payoff moment per the file JSDoc — the _one_ time the app says "you did it!". Cutting it short on slow readers (or screen-reader users) undermines the very moment it celebrates.

**Recommendation.**
Either (a) bump to 15 s and add a "Pause on focus / hover" rule (`useEffect` returns early if `document.activeElement` is inside the modal), or (b) drop the auto-dismiss and trust the user to dismiss explicitly (the primary CTA does that already).

---

### F19 — `ResetPasswordPage.tsx` mixes broken and correct error tokens in same file [severity: medium] [perspective: tailwind/code-quality]

**Page:** ResetPasswordPage
**File:** `apps/web/src/core/auth/ResetPasswordPage.tsx`
**Lines:** L114, L158, L189, L201

**Description.**
Per-field errors use `text-danger` (correct, registered token). Surface-level alerts use `text-error` / `bg-error/10` / `border-error/30` (F1 — non-existent token):

```tsx
// L114 — "Link expired" alert → invisible bg+border
className = "text-sm text-text bg-error/10 border border-error/30 …";

// L158 — per-field "password too short" → correct
className = "text-xs text-danger";

// L201 — server error after submit → invisible bg+text+border
className = "text-xs text-error bg-error/10 border border-error/20 …";
```

**Why it matters.**
The inconsistency itself is the strongest signal that the design system has no `error` and someone reflexively typed it. Surface errors are exactly the ones a user must see when their reset link is malformed — and those are the ones that render no colour.

**Recommendation.**
Same as F1 — globally rename `error` → `danger` / `danger-soft`. Add a regression test for the no-token branch (render `<ResetPasswordPage>` with no `?token=` in URL → assert the alert has a visible red background via `getComputedStyle`).

---

### F20 — Test coverage targets dead `LoginForm.tsx` / `RegisterForm.tsx` [severity: medium] [perspective: test]

**Page:** AuthPage
**File:** `apps/web/src/core/auth/LoginForm.tsx` + sibling `*.test.tsx` (if present), and the _inline_ `LoginForm` / `RegisterForm` in `AuthPage.tsx`
**Lines:** `AuthPage.tsx:130–253` (live `LoginForm`), `:260–453` (live `RegisterForm`); `LoginForm.tsx` (dead).

**Description.**
Combined with F3, any tests that import `./LoginForm` exercise a code path that ships to nobody. The "live" implementations inside `AuthPage.tsx` are the ones a user touches, and they may or may not be covered by `AuthPage.test.tsx` — divergent fixtures, divergent assertions. The bug in F6 (`formState.defaultValues?.email`) is exactly the sort of thing a sibling test of `LoginForm.tsx` would have caught if both files were the same — but they are not.

**Why it matters.**
Test signal is a lie. A green `LoginForm.test.tsx` does not mean the user-facing login works.

**Recommendation.**
After resolving F3 (wire siblings OR delete them), reconcile the tests. Until then, add an explicit `AuthPage.test.tsx` case for the F6 prefill bug.

---

### F21 — Better Auth client type-extension via `as ReturnType<...> & {...}` cast [severity: medium] [perspective: ts]

**Page:** authClient
**File:** `apps/web/src/core/auth/authClient.ts`
**Lines:** L75–L135 (`authClient = createAuthClient({…}) as …`, then `typedAuthClient = authClient as typeof authClient & {…}`)

**Description.**
Two stacked casts re-shape Better Auth's React client to surface `forgetPassword` / `resetPassword` / `updateUser` / `changeEmail` / etc. — methods the runtime Proxy exposes but the static TS type does not. JSDoc explains the rationale honestly, but the casts are still type-system lies: if Better Auth renames a Proxy endpoint in a minor bump, TS won't tell us — runtime will throw `undefined is not a function`.

**Why it matters.**
Better Auth is a load-bearing dependency. A silent runtime break on `forgetPassword` is unrecoverable from the user's side. Project guidance (`AGENTS.md` § Hard rules — code quality) prefers discriminated unions or explicit module augmentation over `as X & Y` casts.

**Recommendation.**
Replace the casts with TypeScript `declare module` augmentation against `better-auth/react`. That way:

1. The extension lives next to the import (no inline cast).
2. If the upstream type lands with these methods someday, our augmentation conflicts loudly instead of silently shadowing.

Track Better Auth upstream issue for proper typings; pin the version in `pnpm-lock` until then.

---

### F22 — `AuthContext.tsx` stacks `as Record<...>` cast with `eslint-disable react-hooks/exhaustive-deps` [severity: medium] [perspective: ts]

**Page:** AuthContext
**File:** `apps/web/src/core/auth/AuthContext.tsx`
**Lines:** L294–L310

**Description.**

```ts
identifyPostHogUser(
  currentId,
  buildIdentifyTraits(user) as Record<string, unknown>,
);
…
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id]);
```

The `as Record<string, unknown>` cast is documented (the comment explains `IdentifyTraits` is an open shape with optional fields). The `eslint-disable` is also documented (avoid re-identifying on the same user after a `/api/v1/me` refetch). Both individually are fine, but the pair lives in the **auth identify path** — the single function that reconciles the analytics identity with the auth identity. A silent typo in `buildIdentifyTraits` ships a wrong identity to PostHog forever.

**Why it matters.**
This is the single touchpoint where auth ↔ analytics agree on "who am I". Two opt-outs from the type-system / lint safety net stacked here means a regression slips through quietly. Hard Rule #21 (Pino redaction) doesn't apply (no Pino here) but the same hygiene principle applies to analytics traits.

**Recommendation.**
Either (a) fix `buildIdentifyTraits`' return type to extend `Record<string, unknown>` natively (e.g. an `index signature`), removing the cast; or (b) add an integration test that calls `identifyPostHogUser` with a mocked user and snapshot-asserts the trait shape. Add `AI-DANGER:` (per F15) on the effect itself.

---

### F23 — `presetApply.uid()` uses `Math.random()` for entry IDs [severity: low] [perspective: code-quality]

**Page:** PresetSheet
**File:** `apps/web/src/core/onboarding/presetApply.ts`
**Lines:** L137–L139

**Description.**

```ts
function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
```

Five characters of base-36 entropy ≈ 60M combinations. Across rapid double-tap → millisecond timestamp + 60M = effectively safe, but the `Math.random()` PRNG is non-cryptographic. Preset entries are not security-sensitive (no auth tokens, no money split keys), so this is **low** severity — but `crypto.randomUUID()` is universally available in Vite-targeted browsers and removes the doubt.

**Recommendation.**
Swap to `crypto.randomUUID()`:

```ts
function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
```

Same pattern as everywhere else in the codebase.

---

### F24 — DemoModeBanner / DailyNudge `aria-label` doesn't communicate dismiss-X separately [severity: low] [perspective: a11y]

**Page:** Hub (DemoModeBanner, DailyNudge)
**Files:** `apps/web/src/core/onboarding/DemoModeBanner.tsx:70–98`, `apps/web/src/core/onboarding/DailyNudge.tsx:65–115`

**Description.**
The outer `<div role="region" aria-label="Демо-режим">` (DemoModeBanner) / `<section aria-label="Щоденна порада">` (DailyNudge) wraps a dismiss-X button. Screen readers will announce the region/section, then the user has to TAB into it and discover that the first focusable is "Сховати" / "Закрити". This works, but the `aria-label` could be augmented with "натисніть Tab → Закрити, щоб приховати" for first-time SR users — or, more simply, the dismiss button could be re-ordered DOM-first so the close affordance is the first announced element.

**Recommendation.**
Lower-priority polish. Track in next a11y pass.

---

### F25 — `ResetPasswordPage` uses `autoFocus` on first input — hostile to SR users [severity: low] [perspective: a11y]

**Page:** ResetPasswordPage
**File:** `apps/web/src/core/auth/ResetPasswordPage.tsx`
**Lines:** L144–L145 (`// eslint-disable-next-line jsx-a11y/no-autofocus -- standalone reset page, first required input`)

**Description.**
`autoFocus` is opted-into with an eslint-disable. Justification ("standalone reset page, first required input") is reasonable but screen-reader users get yanked past the page heading, missing the context that explains where they are.

**Recommendation.**
Either (a) keep the `autoFocus` and add a hidden `aria-live="polite"` heading announcement; or (b) drop `autoFocus` and trust the heading focus contract (move focus to the `<h2>` with `tabIndex={-1}` ref, like `WelcomeOneScreen.tsx:96–100` does).

---

## Per-page coverage matrix

Legend: `X` = audited, no findings. Number = count of findings landed on this page from that perspective. `—` = perspective not applicable to this page surface.

| Page                          | sec | a11y | perf | ux  | bug | rule | ts  | tw  | i18n | test | ai  | lifecycle |
| ----------------------------- | --- | ---- | ---- | --- | --- | ---- | --- | --- | ---- | ---- | --- | --------- |
| **AuthPage**                  | X   | X    | X    | 1   | 1   | 2    | X   | 1   | X    | 1    | 1   | 1         |
| **AuthContext**               | X   | —    | X    | X   | X   | X    | 1   | —   | X    | X    | 1   | 1         |
| **authClient**                | X   | —    | X    | —   | X   | X    | 1   | —   | —    | —    | 1   | 1         |
| **authSchemas**               | X   | —    | —    | —   | —   | 1    | X   | —   | —    | —    | X   | 1         |
| **authFormPrimitives**        | X   | X    | —    | X   | X   | 1    | X   | 1   | —    | —    | X   | 1         |
| **LoginForm (scaffolded)**    | X   | X    | —    | X   | 1   | 1    | X   | 1   | —    | 1    | X   | 1         |
| **RegisterForm (scaffolded)** | X   | X    | —    | X   | X   | 1    | X   | 1   | —    | 1    | X   | 1         |
| **GoogleSignInButton**        | X   | X    | X    | X   | X   | 1    | X   | X   | X    | —    | X   | 1         |
| **ForgotPasswordPanel**       | X   | X    | —    | X   | X   | 1    | X   | 1   | X    | —    | X   | 1         |
| **useForgotPassword**         | X   | —    | X    | 1   | X   | 1    | X   | —   | —    | —    | X   | 1         |
| **ResetPasswordPage**         | X   | 1    | X    | X   | X   | X    | X   | 1   | X    | X    | X   | 1         |
| **OnboardingWizard**          | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | 1         |
| **WelcomeOneScreen**          | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | 1         |
| **useOnboardingWizardState**  | —   | —    | X    | X   | X   | X    | X   | —   | —    | X    | 1   | 1         |
| **ModuleRow**                 | —   | X    | X    | X   | X   | X    | X   | X   | X    | —    | X   | 1         |
| **ModuleChecklist**           | —   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | 1         |
| **PresetSheet**               | —   | X    | X    | X   | X   | X    | X   | X   | X    | —    | X   | 1         |
| **FirstActionSheet**          | —   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | 1         |
| **DemoModeBanner**            | —   | 2    | —    | X   | X   | X    | —   | X   | X    | X    | X   | 1         |
| **DailyNudge**                | —   | 2    | —    | X   | X   | X    | —   | X   | X    | X    | X   | 1         |
| **ReEngagementCard**          | —   | 1    | —    | X   | 1   | X    | —   | X   | 1    | X    | X   | 1         |
| **CelebrationModal**          | —   | 1    | X    | 1   | 1   | X    | —   | X   | X    | —    | X   | 1         |
| **SoftAuthPromptCard**        | —   | 1    | —    | X   | X   | X    | —   | X   | X    | —    | X   | 1         |
| **FirstRunHintBanner**        | —   | 1    | —    | X   | X   | X    | —   | X   | X    | —    | X   | 1         |
| **PermissionsPrompt**         | X   | X    | X    | X   | X   | 1    | X   | X   | X    | —    | X   | 1         |
| **useOnboardingState**        | —   | —    | X    | —   | X   | X    | X   | —   | —    | X    | X   | 1         |
| **onboardingGate**            | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **useFirstEntryCelebration**  | —   | —    | X    | X   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **useModuleFirstRun**         | —   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| **firstRealEntry**            | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **picksStorage**              | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **vibePicks**                 | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **presetApply**               | —   | —    | X    | X   | X   | 1    | X   | —   | —    | —    | 1   | 1         |
| **presetPrefill**             | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |
| **seedDemoData**              | —   | —    | X    | X   | X   | 1    | X   | —   | —    | X    | X   | 1         |
| **cleanupDemoData**           | —   | —    | X    | X   | X   | X    | X   | —   | —    | —    | 1   | 1         |
| **demoSeed**                  | —   | —    | X    | —   | X   | X    | X   | —   | —    | —    | X   | 1         |

Notes on the matrix:

- **F1 (`text-error` token)** lands on six different files; counted once per file in the `tw` column.
- **F14 (lifecycle markers)** lands on every in-scope file; counted as `1` per row in the `lifecycle` column.
- **F15 (AI markers)** is concentrated on `AuthContext`, `authClient`, `useOnboardingWizardState`, `presetApply`, `cleanupDemoData`; each gets a `1` in the `ai` column.
- A `—` does not mean the file is exempt from a perspective — it means the perspective is not meaningfully applicable to a pure-logic / pure-adapter file (e.g. `vibePicks.ts` is a thin re-export and has no UI surface, so a11y/tw/ux/i18n are `—`).

## Out-of-scope follow-ups

These are observations that fall outside the 12 mandatory perspectives but are worth a follow-up issue:

- **`apps/web/src/shared/components/ui/CelebrationModal.tsx`** (592 LOC) sits next to `apps/web/src/core/onboarding/CelebrationModal.tsx` (266 LOC). The shared one is only imported by its own `.stories.tsx`. Possible dead-code duplicate, but the file is outside this audit's scope (shared/ui, not core/auth or core/onboarding).
- The `useApiForm` shape exposes `formState.defaultValues` — the F6 footgun. A wrapper that re-exposes the live `watch()` value as `formValues` would eliminate the pattern.
- The 14 `text-error` occurrences hint that a project-wide grep would surface more outside this audit's scope. Recommend a one-shot follow-up PR: `grep -rn '\\b(text|bg|border|ring)-error\\b' apps/web/src` → rename to `danger`.

## Audit method

- Cloned `Skords-01/Sergeant` via PAT proxy (no `pnpm install`, no `pnpm dev:*`).
- Read every file listed in the scope spec.
- `grep` sweeps for: inline `queryKey: [...]` (Hard Rule #2), `focus:` without `-visible:` (Rule #14), `dangerouslySetInnerHTML` / `eval` / inline-hex-className (Rule #11), `: any` / `as any` / `getattr`, `console.log` debug residue, `AI-NOTE` / `AI-CONTEXT` / `AI-DANGER` markers, `Last validated:` / `Status:` lifecycle markers (Rule #10), `--c-error` / `error:` colour token (registered? — no), file LOC counts (Rule #18 `max-lines: 600`).
- Cross-checked findings against the canonical Hard Rules registry at `docs/governance/rules/*.md` and the touch-target contract at root `AGENTS.md § Touch targets`.
- No findings rely on running the app — every assertion is reproducible by `grep` + `read` against the commit at the head of `main`.
