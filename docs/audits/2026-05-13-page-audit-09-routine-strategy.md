# Page Audit — Routine module + Strategy page

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Scope slug:** `09-routine-strategy`
> **Pages in scope:**
>
> - Routine module — `apps/web/src/modules/routine/**`
>   (composition root + `RoutineApp.helpers.ts`, `RoutineActions`,
>   `RoutineHeader`, `RoutineTimeline`, `useRoutineAppState`,
>   `useRoutineDerivedData`, `useRoutineTimeState`, `route.tsx`,
>   `index.ts`, the whole `components/`, `context/`, `hooks/` and
>   `lib/` subtrees including `routineRouter`).
> - Strategy page — `apps/web/src/pages/strategy/StrategyPage.tsx`.

## Summary

- Pure-static audit of ~60 TS/TSX files in the Routine module (`apps/web/src/modules/routine/**`) plus the Strategy page skeleton (`apps/web/src/pages/strategy/StrategyPage.tsx`). No code changes; this PR adds only the audit document.
- Strategy page is the biggest concentration of cross-cutting blockers — the comment claims the request goes through `internalFetch` + `INTERNAL_API_KEY` bearer, but the actual `fetch` call is **unauthenticated** and renders raw server error messages to the user. The page is also entirely English (i18n), uses raw Tailwind palette (`bg-blue-600`, `text-red-600`, `text-gray-200`), and has no test, no skeleton state, and no retry CTA.
- The Routine module is internally healthy (well-decomposed via initiative 0001, isolated reducer for time-state, derived data isolated to `useRoutineDerivedData`), but it has systemic timezone drift (`new Date()` + `setHours(12,0,0,0)` is **local-device** time, not Europe/Kyiv — a Domain invariant violation), foreign module accents (`sky`/`emerald`) leaking into the routine subtree, one file at exactly **607 LOC** breaching Hard Rule #18, swallowed errors in the reminders scheduler, and large test-coverage gaps for every UI shell file (`RoutineApp.tsx`, `RoutineTimeline.tsx`, `RoutineHeader.tsx`, `RoutineActions.tsx`, `RoutineCalendarPanel.tsx`, `RoutineStatsPanel.tsx`, hooks `useRoutineAppState`/`useRoutineDerivedData`/`useRoutineReminders`/`useRoutinePushups`).
- Findings count: **0 critical · 8 high · 11 medium · 4 low** (23 total).

## Findings

### F1 — Strategy page calls `/api/internal/strategic/*` without `internalFetch` / bearer auth [severity: high] [perspective: security]

> ✅ **Closed 2026-05-31** — `internalFetch` wrapper не існує. Misleading JSDoc у `apps/web/src/pages/strategy/StrategyPage.tsx` замінено на явний `TODO(PR-35)` блок: зафіксовано, що `fetchGoals` / `createGoalApi` ходять raw `fetch`-ом без `Authorization`, сторінка свідомо не змонтована в `core/app/router.tsx` (user-facing impact = 0), і що PR-35 має переключити на `/api/strategic/*` session-auth proxy перед wire-up у роутер. Hard Rule #20 (PAT не в production) явно додано в TODO.

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L21–L24, L96–L123

**Description.**
The file header explicitly documents that the fetch path is `/api/internal/strategic/goals/list` "через `internalFetch`-wrapper (тобто bearer-token у dev — лежить у `INTERNAL_API_KEY`)". The actual implementation uses raw `fetch(...)` with `Content-Type: application/json` and **no `Authorization` header**. Both `fetchGoals` and `createGoalApi` are unauthenticated. If the server endpoint enforces the bearer (matching the n8n design described in the comment), every call fails with `401`; if it does not enforce auth, the internal-only route is reachable from any browser session (or anonymous user) and goals can be created/listed for an arbitrary `founderUserId`.

**Why it matters.**
Either the page is permanently broken in production (CI doesn't catch it because it's not in the router yet) **or** the internal route is silently a public IDOR endpoint. The mismatch between the file's documented contract and the implementation also makes future maintenance hazardous — a reviewer reading just the JSDoc cannot tell that the wrapper is missing.

**Recommendation.**
Decide one of:

1. If the internal route is meant for n8n only — move the page to `/api/strategic/*` (session-auth proxy) **before** wiring it into the router (PR-35), and remove the misleading "internalFetch" comment.
2. If a bearer is still required from the browser — import and use the actual `internalFetch` helper (`apps/web/src/shared/lib/api/internalFetch.ts` if it exists) and inject `INTERNAL_API_KEY` only via `import.meta.env.VITE_*` for dev. Production must not ship the PAT (Hard Rule #20).

---

### F2 — Strategy page leaks raw server `error.message` to the user [severity: high] [perspective: security]

> ✅ **Closed 2026-05-31** — введено `StrategyApiError` зі статусом HTTP-відповіді; обидва `fetch`-каллери (`fetchGoals`, `createGoalApi`) кидають типізовану помилку. `useMutation.onError` рендерить лише канонічну UA-копію через `strategyErrorMessage(status)`: 401/403 → «Сесія завершилась», 5xx → «Сервер тимчасово недоступний», інакше → «Не вдалося зберегти ціль».

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L102–L104, L155–L158, L228–L232

**Description.**
`fetchGoals` and `createGoalApi` both throw `new Error(\`list goals failed: ${res.status}\`)`and`new Error(data.error ?? "list goals not-ok")`. The `useMutation.onError`then stores`err.message`into`submitError`, which is rendered verbatim inside `<p role="alert" className="text-sm text-red-600">{submitError}</p>`. There is no sanitization layer, no friendly Ukrainian copy, and `data.error` may include server-side detail (DB constraint names, validation IDs, stack hints).

**Why it matters.**
A leaked server-internal error string is a low-grade information disclosure (Hard Rule #21 spirit — Pino redaction is about logs, but the same posture applies to user-visible diagnostics). Worse, it teaches users that an error string is normal English-language text, undermining the rest of the UI's Ukrainian copy.

**Recommendation.**
Wrap both `fetch` callers in a small adapter that maps `res.status` → friendly Ukrainian message (e.g. 401/403 → "Сесія завершилась, увійди ще раз"; 5xx → "Сервер тимчасово недоступний. Спробуй ще раз"). Log the raw error to PostHog/Sentry but show only the canonical mapped message in the alert.

---

### F3 — Routine module `setHours(12, 0, 0, 0)` derives day keys in **local device time**, not Europe/Kyiv [severity: high] [perspective: bug]

**Page:** Routine module (multiple files)
**Files:**

- `apps/web/src/modules/routine/RoutineApp.helpers.ts` (L38–L42 — `todayDate()`)
- `apps/web/src/modules/routine/components/HabitDetailSheet.tsx` (L20–L24, L46–L49)
- `apps/web/src/modules/routine/components/HabitHeatmap.tsx` (L76, L102)
- `apps/web/src/modules/routine/components/RoutineStatsPanel.tsx` (L17)
- `apps/web/src/modules/routine/hooks/useRoutineReminders.ts` (L18–L20 cleanup cutoff, L29–L35 `todayKey`/`currentHm`)

**Description.**
The repo's Domain Invariants spec (`docs/architecture/domain-invariants.md`) and Hard Rule context state that the day key is `YYYY-MM-DD` in **Europe/Kyiv local** and week start is **Monday (ISO 8601)**. The Routine module uniformly relies on `new Date()` + `d.setHours(12, 0, 0, 0)` to "anchor" times around noon and avoid DST flips. This is correct for someone whose system clock is on Europe/Kyiv but **wrong for any user outside that timezone**: a user on Europe/Lisbon (UTC-1 vs Kyiv +2) at 23:30 local time will compute today as "2026-05-13" while the canonical Kyiv day key has already rolled to "2026-05-14". A user on Asia/Tashkent (UTC+5) at 02:00 local will see the previous day. No file in the module calls into `Intl.DateTimeFormat(..., { timeZone: "Europe/Kyiv" })` — `grep -r "Europe/Kyiv" apps/web/src/modules/routine` returns zero matches.

**Why it matters.**
This is the single highest-impact behavioural bug in the scope. Symptoms include: streak counts off by ±1; bulk-mark-day applying completion to the wrong calendar day; reminder cleanup keeping stale keys an extra day; deep-link `?routineDay=YYYY-MM-DD` landing on a different day than the URL claims. The Strategy page's `kyivMondayISO()` (L66–L87) shows the correct pattern (`Intl.DateTimeFormat` with `timeZone: "Europe/Kyiv"`) — the Routine module should share it.

**Recommendation.**
Introduce a single `kyivToday()` (and `kyivDateKey(date)`) helper in `apps/web/src/modules/routine/lib/` that mirrors `kyivMondayISO`'s pattern, and replace every `new Date(); d.setHours(12,…)` call site with it. The 12-noon anchor stops mattering once the timezone is explicit. Backfill a unit test that fakes `vi.setSystemTime` for a non-Kyiv offset and asserts the day key still matches the Kyiv civil date.

---

### F4 — `RoutineCalendarPanel.tsx` is 607 LOC — over Hard Rule #18's 600-line ceiling [severity: high] [perspective: rule]

**Page:** Routine module / Calendar panel
**File:** `apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx`
**Lines:** the file as a whole (1–607)

**Description.**
Hard Rule #18 ("Module-size discipline — `max-lines: 600` for web TS/TSX") is an **active-initiative**: new code must not cross 600 LOC. `wc -l` reports 607 lines. The panel mixes: time-mode segmented control, search input + debounce, tag-chip rendering, month grid rendering branch, virtualized grouped list, completion-note draft scheduler with debounced flush on unmount, plus two sheet portals (HabitDetailSheet, FizrukDayPlanSheet). All of those are eligible for extraction.

**Why it matters.**
Beyond the lint guard, the file's cyclomatic surface makes regressions easy to introduce — see also F12 (foreign accents) and F19 (no test).

**Recommendation.**
Extract two cohesive subcomponents in a follow-up:

1. `RoutineCalendarFilters` — segmented control + search input + tag chips (the L150–L348 block).
2. `RoutineGroupedList` — the Virtuoso list including the note-draft debounce machinery (L400–L592). Both are pure-view; they can take `RoutineCalendarData` + `RoutineCalendarActions` from the existing context. Target ≤ 350 LOC for `RoutineCalendarPanel.tsx` after the split.

---

### F5 — Foreign module accents (`sky-*`, `emerald-*`) inside the routine subtree [severity: high] [perspective: rule]

**Page:** Routine module
**Files:**

- `apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx` (L313, L329, L520, L531)
- `apps/web/src/modules/routine/components/RoutineCalendarMonthGrid.tsx` (L160, L198, L205, L207)
- `apps/web/src/modules/routine/components/FizrukDayPlanSheet.tsx` (L122, L170)

**Description.**
Hard Rule #12 (Module-accent containment) bans non-routine accent colours inside `apps/web/src/modules/routine/**`. The routine module standardizes on **coral / `routine-*` tokens** (see `lib/routineConstants.ts`). Today the calendar panel paints the "Фізрук" filter chip with `border-sky-400/50 bg-sky-500/10` and the Finyk subscriptions chip with `border-emerald-500/40 bg-emerald-500/10`; the month grid uses `bg-sky-500` as the today-marker dot and `bg-emerald-500` as the completion dot; the Fizruk day-plan sheet uses `bg-sky-500` for exercise bullets and `border-sky-400 bg-sky-500/10` for selected templates.

**Why it matters.**
This is the exact pattern the eslint plugin (`sergeant-design/module-accent-containment`) is meant to fail, and it pollutes the visual identity of the routine module. New contributors copying these chips into a follow-up will spread fizruk's sky and finyk's emerald deeper.

**Recommendation.**
Use the `-strong` companions of `routine-*` (already in `routineConstants.ts`) or expose new neutral tokens (`bg-info-soft`, `bg-success-soft`) that don't borrow another module's accent. For cross-module callouts (Fizruk planner, Finyk subscriptions), wrap the chip/dot in a tiny module-icon badge instead of borrowing the foreign hue.

---

### F6 — Routine deep-link `?routineDay=…` validates format only, not the calendar date [severity: high] [perspective: bug]

**Page:** Routine module / Calendar deep link
**File:** `apps/web/src/modules/routine/useRoutineAppState.ts`
**Lines:** L251–L268

**Description.**
The PWA / external-link deep-link path reads `routineDay` from `URLSearchParams`, applies a `^\d{4}-\d{2}-\d{2}$` regex, and feeds the result into `time.deepLinkDay(q)`. The regex matches structurally invalid dates like `9999-99-99`, `2026-02-31`, `0000-13-01`. `time.deepLinkDay` blindly stores the value as `selectedDay`, which then flows through `parseDateKey` and `toLocaleDateString` — those produce surprising labels ("Invalid Date") and downstream `range` calculations that span empty months.

**Why it matters.**
A crafted deep link from a malicious actor (e.g. a habit-sharing flow) can crash labels or freeze the calendar on a nonsense day. Even without an attacker, copy-pasted URLs from older app versions risk this.

**Recommendation.**
Replace the regex with `parseDateKey(q)` round-trip validation: if `dateKeyFromDate(parseDateKey(q)) !== q`, drop the parameter and `replaceState` without applying. Already a one-liner.

---

### F7 — `useRoutineReminders` swallows every error via empty `catch {}` [severity: high] [perspective: bug]

> ✅ **Closed 2026-05-31** — чотири порожні `catch {}` замінено на `logger.warn` з префіксами `[routine.reminders] *-failed` (SW `showNotification`, нативний `Notification` fallback, `ROUTINE_STATE_UPDATE`/`ROUTINE_NOTIFICATION_SENT` postMessage, `Notification.requestPermission`). У production шлях іде через Sentry breadcrumbs (`logger.warn` з `@shared/lib`); у DEV — `console.warn`.

**Page:** Routine module / Reminders hook
**File:** `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`
**Lines:** L43–L59 (showNotification), L62–L74 (sendRoutineStateToSW), L123–L130 (SW postMessage), L155–L160 (requestRoutineNotificationPermission)

**Description.**
The hook has four `try { … } catch {}` blocks with empty bodies (`}catch{}`). Every failure — `navigator.serviceWorker.ready` rejecting, `Notification` constructor throwing on Safari, `postMessage` throwing on a detached SW — is silently dropped. There is no `console.warn`, no PostHog event, no Sentry capture, and no toast back to the user.

**Why it matters.**
Reminder failures are the canonical class of "user thinks the app is broken" complaints; without telemetry the team cannot see them. Combined with F8 (permission state drift) this means a user can sit on a "Reminders ON" toggle that quietly does nothing.

**Recommendation.**
Each catch should at minimum call `logError("routine.reminders.notify-failed", err)` (or whatever the repo's observability helper is). Optionally surface a one-time toast when the SW path fails the first time per session.

---

### F8 — `useRoutineReminders` scheduler is bound only to `enabled` flag; runtime permission flips are ignored [severity: medium] [perspective: bug]

> ✅ **Closed 2026-05-31** — додано `useNotificationPermission` хук: підписка на `navigator.permissions.query({ name: "notifications" })` change-event + fallback `visibilitychange`/`focus`. Стан permission тепер у deps scheduler-ефекту — revoke зупиняє цикл, re-grant автоматично рестартує без перезавантаження SPA.

**Page:** Routine module / Reminders hook
**File:** `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`
**Lines:** L77, L85–L150

**Description.**
The `useEffect` driving `fireAndSchedule` depends on `[enabled]` (the prefs flag), not on `Notification.permission`. Inside the tick `if (Notification.permission !== "granted") return;` short-circuits but never schedules the next tick or surfaces the state to UI. If the user revokes permission via browser settings while the SPA is open, the loop terminates silently with no recovery on permission re-grant.

**Why it matters.**
Quiet permission loss is a UX/observability dead zone. The user toggles "Нагадування увімкнено" inside the app, the browser silently denies, and nothing happens.

**Recommendation.**

1. Subscribe to `navigator.permissions.query({ name: "notifications" })` and re-render `enabled` whenever the state flips.
2. When `enabled && permission !== "granted"`, render a banner inside the Stats panel offering a "Дозволити нагадування" CTA that re-requests permission.

---

### F9 — Notification title contains habit name in plain text — no privacy opt-in [severity: medium] [perspective: security]

**Page:** Routine module / Reminders hook
**File:** `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`
**Lines:** L116–L117

**Description.**
`const title = \`${h.emoji || "✓"} ${h.name}\``is passed straight to`reg.showNotification(title, …)`. The habit name is rendered to the OS lock screen and any connected smartwatch. Users with sensitive habits ("Therapy", "AA meeting", "Antidepressant") have no way to opt out of broadcasting their habit name to a shoulder-surfer.

**Why it matters.**
This is the same class as iOS Health/Apple Watch's "Show on Lock Screen" — even non-PII text can be sensitive in context. Discoverable via a hostile bystander.

**Recommendation.**
Add a `prefs.routineReminderPrivacy: "full" | "minimal"` toggle. In `minimal` mode the title becomes "Нагадування" and the body becomes "Час для запланованої звички" — the user opens the app to see which one. Default the toggle to `full` (current behaviour) but advertise it in settings.

---

### F10 — `noUncheckedIndexedAccess` bypassed via `row!` non-null assertion in drag-reorder [severity: medium] [perspective: ts]

**Page:** Routine settings / Active habits drag
**File:** `apps/web/src/modules/routine/components/settings/ActiveHabitsSection.tsx`
**Lines:** L122–L139 (drop handler)

**Description.**
The drop handler runs `const [row] = next.splice(fi, 1);` then `next.splice(ti, 0, row!);`. With Hard Rule #19 (`noUncheckedIndexedAccess: true`) active, `row` is typed `string | undefined` and the bang silences the checker. If `fi` was previously validated `>= 0` and `next` had a real entry it is safe, but the pattern is the canonical anti-pattern Rule #19 was added to discourage.

**Why it matters.**
Hard Rule #19 is an active initiative; bangs erode its value. Future maintenance that adds a code path where `fi` is `-1` despite the earlier guard would silently miscompile.

**Recommendation.**
Replace with a narrowed branch:

```ts
const removed = next.splice(fi, 1);
const row = removed[0];
if (!row) return s; // nothing to move
next.splice(ti, 0, row);
```

---

### F11 — Strategy page UI strings are in English; product is Ukrainian-first [severity: medium] [perspective: i18n]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L189–L194 ("Strategic Goals", "Week starting", "placeholder UI (PR-34 skeleton)"), L197–L198 ("Add goal"), L202 ("Persona"), L218 ("Goal text"), L225 (placeholder "e.g. Cut 'Coffee' category spend by 60% before Sunday"), L238 ("Saving…", "Add goal"), L245 ("This week's goals"), L248 ("Loading…"), L250–L252 (English copy), L90–L93 (PERSONA_LABELS: "finyk (finance)", "fizruk (fitness)").

**Description.**
All user-facing text is English ASCII. The rest of the app (Routine, Finyk, Fizruk, Nutrition) is Ukrainian-only.

**Why it matters.**
When PR-35+ wires the page to `/strategy`, every shipped string will need a follow-up translation pass; meanwhile any preview/staging tester loses the localisation contract advertised by the rest of the product. AGENTS.md Hard Rule #15 mandates internal-doc Ukrainian; the same posture is the de-facto product copy convention.

**Recommendation.**
Translate the strings now (it's a 10-line diff) and rename `PERSONA_LABELS` to Ukrainian: `"Фінік (фінанси)"`, `"Фізрук (фітнес)"`, `"Харчування"`, `"Рутина"`. Keep the persona id strings English (they are an API contract with the server).

---

### F12 — Strategy page uses raw Tailwind palette pairs (`bg-blue-600`, `text-red-600`, `text-gray-200`) [severity: medium] [perspective: tailwind]

> ✅ **Closed 2026-05-31** — у `apps/web/src/pages/strategy/StrategyPage.tsx`: `text-red-600` → `text-danger-strong`, `bg-blue-600` + `outline-blue-500` → `bg-info-strong` + `outline-info`, `border-gray-200` → `border-line`. Без `dark:`-пар (Hard Rule #13), без arbitrary hex (Hard Rule #11).

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L229 (`text-red-600`), L236 (`bg-blue-600 text-white focus-visible:outline-blue-500`), L266 (`border-gray-200`).

**Description.**
Hard Rule #11 forbids arbitrary hex in `className` and Hard Rule #13 forbids raw-palette light/dark pairs. The submit button paints itself `bg-blue-600 text-white` with no `-strong` companion (Hard Rule #9 also applies because the saturated fill is behind white text). Error text uses `text-red-600` instead of the design-system `text-danger`/`text-danger-strong`. The goal-list border uses `border-gray-200` instead of `border-line`.

**Why it matters.**
Skips the design-token layer entirely; breaks dark mode (`text-red-600` reads identically in dark, no light-vs-dark token); ships a default-blue button that doesn't match any module accent.

**Recommendation.**
Submit button → `bg-info-strong text-white` (or `bg-routine-strong` if Strategy is conceptually a Routine sub-page). Error text → `text-danger-strong dark:text-danger`. List borders → `border-line bg-panel`. Focus ring → `focus-visible:ring-2 focus-visible:ring-info/50` (or matching module).

---

### F13 — Strategy page submit button has no minimum 44×44 touch target [severity: medium] [perspective: a11y]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L233–L239

**Description.**
The submit button is `className="rounded-md bg-blue-600 px-4 py-2 text-white …"`. `py-2` resolves to 8 px top + 8 px bottom + `text-base` ~24 px ≈ 40 px height. Below the WCAG 2.5.5 / Apple HIG 44 px floor that `apps/web/AGENTS.md` documents (and that the design system's `Button` component auto-applies).

**Why it matters.**
The page is meant to be touched on mobile (Capacitor shell + PWA both list it). 4 px miss = the standard repeat-tap and accidental-link complaint cluster.

**Recommendation.**
Replace the bare `<button>` with the design-system `<Button variant="primary">` from `@shared/components/ui/Button` — it auto-applies `min-h-[44px]` and the correct focus ring.

---

### F14 — Strategy page has no skeleton / retry CTA / empty-state polish [severity: medium] [perspective: ux]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L247–L279

**Description.**
Three states are handled inline with a single ternary chain: `isLoading ? "Loading…" : goals.length === 0 ? <empty copy> : <list>`. There is **no error state**: if `useQuery` rejects (no internet, 401), the page silently shows the empty state with no retry CTA, no error banner, no error icon, no toast. The "loading" state is plain text, not a `SkeletonHabitRow`-style shimmer like the rest of the app uses (see `RoutineTimeline.tsx` L59–L70 for the canonical pattern).

**Why it matters.**
"Loading…" never moves; users assume the app is frozen. Errors are invisible. New onboarding-friendliness post-mortem (see `docs/audits/2026-04-28-ux-improvement-plan.md`) flagged this exact pattern across the app.

**Recommendation.**
Adopt `DataState` from `@shared/components/ui/DataState` (already used in `RoutineTimeline.tsx`) with a skeleton + an error retry CTA (`query.refetch`). Add an explicit empty-illustration like the Routine module's `<RoutineEmptyIllustration />`.

---

### F15 — Strategy page `useQuery` has no `staleTime` — refetches on every focus [severity: medium] [perspective: perf]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L141–L144

**Description.**
`useQuery({ queryKey: strategicKeys.goalsForWeek(weekStart), queryFn: () => fetchGoals(weekStart) })` defaults `staleTime: 0`. The page will refetch the entire week's goals every time the window regains focus (tab switch, Capacitor app resume). Strategic goals change at most once per week (Mon 09:00 Kyiv via WF-26 cron) — refetching every focus is wasteful.

**Why it matters.**
Mobile users on Capacitor get a small data hit and a brief flicker every time they open the app; on cellular it adds up. Pattern is also inconsistent with the rest of the repo (Finyk/Routine queries typically set `staleTime`).

**Recommendation.**
Add `staleTime: 5 * 60 * 1000` (5 min) and `refetchOnWindowFocus: false` to the `useQuery` options; invalidate after mutations (already done) — that is enough.

---

### F16 — Strategy page `goalsByPersona` uses optional chaining on a fully-initialized map [severity: low] [perspective: ts]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L160–L169

**Description.**
The map is constructed with all four persona keys before the loop runs, so `map[g.persona]` is provably defined for every `g.persona ∈ STRATEGIC_GOAL_PERSONAS`. The `?.push(g)` is dead defence; the real risk is that an unknown persona arrives from the server and is silently dropped (no warning, no error). This intersects with Hard Rule #3 (API contract).

**Why it matters.**
The optional chaining suggests defensiveness but actually masks an unmodeled state.

**Recommendation.**
Validate the response with a small Zod / hand-rolled guard that filters or warns on unknown persona ids, and drop the `?.`:

```ts
const arr = map[g.persona];
if (!arr) {
  console.warn("strategic.goal.unknownPersona", g.persona);
  continue;
}
arr.push(g);
```

---

### F17 — Strategy page `@scaffolded` marker missing `@owner` and `@addedIn` per Rule #10 [severity: low] [perspective: ai-marker]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L12–L15

**Description.**
Rule #10 (`docs/governance/rules/10-lifecycle-markers.md`) prescribes that every `@scaffolded` marker carries `@owner`, `@addedIn <short-sha>`, `@nextStep`. The file provides `@scaffolded` and `@nextStep` but omits `@owner` and `@addedIn`.

**Why it matters.**
Knip honours `@scaffolded` to suppress dead-code warnings — the lint contract relies on the surrounding metadata to make ownership reviewable. Without `@owner` the bus-factor + cleanup audit (`pnpm dead-code:files`) cannot route follow-ups.

**Recommendation.**
Add the two missing lines:

```
 * @scaffolded
 * @owner @Skords-01
 * @addedIn <sha-of-PR-34-merge>
 * @nextStep PR-35+ — wire `StrategyPage` into router …
```

---

### F18 — `<button>` close button inside the storage-error banner is below the 44 px touch floor [severity: medium] [perspective: a11y]

**Page:** Routine module / Timeline body
**File:** `apps/web/src/modules/routine/RoutineTimeline.tsx`
**Lines:** L95–L102

**Description.**
The "Закрити" button uses bare HTML `<button>` with `className="shrink-0 text-xs font-semibold text-danger/80 hover:text-danger"`. `text-xs` resolves to ~12 px text, no padding tokens, no `min-h`. The clickable area is < 30 px tall — well below the 44 px floor that the design system's `Button` (or `IconButton`) auto-applies.

**Why it matters.**
The banner appears precisely when something is wrong (quota exhausted / storage write failed). Asking a frustrated user to tap a 28 px target with no haptic acknowledgement is a UX failure on top of the original error.

**Recommendation.**
Switch to `<IconButton size="sm" variant="ghost" aria-label="Закрити повідомлення" />` (auto-44 floor) or wrap the `<span>` in the existing `<Banner>`'s `dismissable` API if one exists.

---

### F19 — Routine UI shell files have **no co-located tests** [severity: medium] [perspective: test]

**Page:** Routine module — most files
**Files:** Missing `*.test.tsx`/`*.test.ts` for:

- `RoutineApp.tsx`, `RoutineActions.tsx`, `RoutineHeader.tsx`, `RoutineTimeline.tsx`
- `useRoutineAppState.ts`, `useRoutineDerivedData.ts`
- `components/RoutineCalendarPanel.tsx`, `components/RoutineStatsPanel.tsx`, `components/RoutineCalendarMonthGrid.tsx`, `components/RoutineCalendarHero.tsx`, `components/HabitDetailSheet.tsx`, `components/HabitHeatmap.tsx`, `components/HabitLeadersBlock.tsx`, `components/HabitQuickCreateDialog.tsx`, `components/PushupsWidget.tsx`, `components/WeekDayStrip.tsx`, `components/FizrukDayPlanSheet.tsx`, `components/DayProgressRing.tsx`, `components/DayReportSheet.tsx`
- `components/settings/{ActiveHabitsSection,ArchivedHabitsSection,CategoriesSection,HabitForm,HabitListItem,ReminderPresets,WeekdayPicker}.tsx`
- `hooks/{useRoutineDualWriteBoot,useRoutinePushups,useRoutineReminders,useRoutineRoute,useRoutineState,useSqliteReadBoot}.ts`
- `lib/{clientMigrate,completionNoteKey,finykSubscriptionCalendar,habitOrder,residualImport,routineDraftUtils,routineStorageInstance,sqliteReadBoot,sqliteReader,streaks}.ts`

**Description.**
Co-located test files exist only for `useRoutineTimeState`, `RoutineBottomNav`, the dual-write internals, parts of `routineStorage`, `hubCalendarAggregate`, `routinePushupsRead`, and a `HabitForm.focus.test.tsx`. The entire orchestrator hook + derived layer + every panel + every settings section has no unit/integration coverage. The Strategy page has no test at all.

**Why it matters.**
Routine carries Domain-invariant logic (timezone, week math, streaks, completion rate) and the only safety net today is the dual-write parity tests — those cover storage shape, not UI behaviour. A regression in `useRoutineDerivedData.range` would not be caught.

**Recommendation.**
Prioritise:

1. `useRoutineDerivedData.test.ts` — assert `range`, `rangeLabel`, `headlineDate`, `canBulkMark` across all 5 `timeMode` values, including a Kyiv-offset fake clock.
2. `useRoutineReminders.test.ts` — fake `Notification.permission`, fake SW, assert one-shot per `${habitId}_${hm}_${dk}` key, assert cleanup cutoff math.
3. `StrategyPage.test.tsx` — render with MSW handler for `/api/internal/strategic/goals/list`, assert empty / error / loaded states. This is the test that would have caught F1 (unauthenticated fetch — the test would also catch the missing bearer if the MSW handler asserts the header).

---

### F20 — Routine module Banner "Закрити" + chip filters lack `aria-pressed` / `aria-expanded` [severity: medium] [perspective: a11y]

**Page:** Routine module / Calendar panel
**File:** `apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx`
**Lines:** L290–L348 (filter chips loop)

**Description.**
The tag/persona filter chips are pure `<button>` elements that toggle between `chipOn` (selected styling) and `chipOff` (unselected). Selection state is encoded only visually — no `aria-pressed="true|false"`, no `role="switch"`, no `<output>` companion. Screen readers cannot tell that "Фізрук" is currently active.

**Why it matters.**
WCAG 2.1 AA requires programmatic exposure of state changes (4.1.2 Name, Role, Value). For a calendar filter — exactly the kind of toggle a sighted user mentally maps to a checkbox — this is a real comprehension failure.

**Recommendation.**
Add `aria-pressed={tagFilter === <id>}` to each chip button. The CSS toggle classes can stay as-is.

---

### F21 — Notification storage cleanup uses `cutoff.toISOString().slice(0, 10)` — UTC, not Kyiv [severity: medium] [perspective: bug]

**Page:** Routine module / Reminders hook
**File:** `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`
**Lines:** L17–L27

**Description.**
`cleanupStaleRoutineNotifyKeys` computes `cutoffKey` via `cutoff.toISOString().slice(0, 10)`. `toISOString` is always UTC. The comparison `d < cutoffKey` then string-compares Kyiv-formatted day keys (`YYYY-MM-DD` from `dateKeyFromDate`) against a UTC day key. For users with a `now()` near midnight, the cutoff is off by one calendar day, and one extra day of stale `routine_notify_*` keys lingers.

**Why it matters.**
Minor storage pressure leak; pairs poorly with the `routine.storage-error` banner (F3 family). On low-quota devices (iOS PWA) the extra day's worth of keys could push past the quota.

**Recommendation.**
Replace with the Kyiv-aware helper from the F3 fix: `cutoffKey = kyivDateKey(addDays(now, -maxAgeDays))`.

---

### F22 — Strategy page form lacks `<fieldset>` + first-input autofocus [severity: low] [perspective: a11y]

**Page:** Strategy page
**File:** `apps/web/src/pages/strategy/StrategyPage.tsx`
**Lines:** L196–L241

**Description.**
The persona select + goal textarea + submit are siblings, not grouped under a `<fieldset><legend>`. Keyboard users who jump to the form via the `add-goal-heading` link have to Tab through every preceding element. The textarea also has no `aria-describedby` pointing at the placeholder hint and no autofocus on the first invalid submit.

**Why it matters.**
Minor a11y polish; matters most when assistive tech is sweeping the page.

**Recommendation.**
Wrap the controls in `<fieldset className="space-y-3"><legend className="sr-only">Add strategic goal</legend>…</fieldset>`. On `submitError`, call `.focus()` on the offending input.

---

### F23 — `RoutineApp.helpers.ts:95` uses `a[0].localeCompare(b[0], "uk")` with tuple-typed `a`/`b` — works today but masks Rule #19 [severity: low] [perspective: ts]

**Page:** Routine module / Helpers
**File:** `apps/web/src/modules/routine/RoutineApp.helpers.ts`
**Lines:** L92–L99

**Description.**
The sort comparator destructures `Map.entries()` tuples (`[string, HubCalendarEvent[]]`). Because they are tuple types, `a[0]` is `string` (not `string | undefined`), so this passes `noUncheckedIndexedAccess`. Today the call is sound, but if anybody refactors `groupEventsForList` to return `Array<{head, events}>` and forgets to update the comparator (now indexing a regular array), the bang assertion appears here too. Hard Rule #19's value is in keeping the call-site explicit.

**Why it matters.**
Pre-emptive guardrail; readability.

**Recommendation.**
Refactor to destructured names:

```ts
return [...map.entries()].sort(([ah], [bh]) => {
  const ai = GROUP_ORDER.indexOf(ah);
  const bi = GROUP_ORDER.indexOf(bh);
  …
  return ai === -1 && bi === -1 ? ah.localeCompare(bh, "uk") : ai - bi;
});
```

> **Closure note (2026-06-01, PR-A9 of 15-pack):** Resolved. `apps/web/src/modules/routine/RoutineApp.helpers.ts:97-104` now destructures: `.sort(([aKey], [bKey]) => …)`. No tuple indexing; locals read directly so a future refactor that changes the entries shape forces a compile-time fix instead of silently shifting a bang.

---

## Per-page coverage matrix

`X` = audited, no findings · number = findings count · `—` = not applicable.

| Page                                                                         | sec | a11y | perf | ux  | bug | rule | ts  | tw  | i18n | test | ai  | lifecycle |
| ---------------------------------------------------------------------------- | --- | ---- | ---- | --- | --- | ---- | --- | --- | ---- | ---- | --- | --------- |
| `apps/web/src/pages/strategy/StrategyPage.tsx`                               | 2   | 1    | 1    | 1   | X   | X    | 1   | 1   | 1    | 1    | 1   | X         |
| Routine module — `RoutineApp.tsx`                                            | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `RoutineApp.helpers.ts`                                     | X   | X    | X    | X   | 1   | X    | 1   | X   | X    | X    | X   | X         |
| Routine module — `RoutineActions.tsx`                                        | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `RoutineHeader.tsx`                                         | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `RoutineTimeline.tsx`                                       | X   | 1    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `useRoutineAppState.ts`                                     | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `useRoutineDerivedData.ts`                                  | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `useRoutineTimeState.ts`                                    | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | X         |
| Routine module — `components/RoutineCalendarPanel.tsx`                       | X   | 1    | X    | X   | X   | 2    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/RoutineCalendarMonthGrid.tsx`                   | X   | X    | X    | X   | X   | 1    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/FizrukDayPlanSheet.tsx`                         | X   | X    | X    | X   | X   | 1    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/HabitDetailSheet.tsx`                           | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/HabitHeatmap.tsx`                               | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/RoutineStatsPanel.tsx`                          | X   | X    | X    | X   | 1   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/RoutineCalendarHero.tsx`                        | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/HabitQuickCreateDialog.tsx`                     | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/PushupsWidget.tsx`                              | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/WeekDayStrip.tsx`                               | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `components/settings/ActiveHabitsSection.tsx`               | X   | X    | X    | X   | X   | X    | 1   | X   | X    | 1    | X   | X         |
| Routine module — `components/settings/{Categories,Archived,HabitForm,…}.tsx` | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `context/RoutineCalendarContext.tsx`                        | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | X         |
| Routine module — `hooks/useRoutineReminders.ts`                              | 1   | X    | X    | X   | 2   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `hooks/useRoutineRoute.ts`                                  | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `hooks/useRoutinePushups.ts`, `useSqliteReadBoot.ts`, etc.  | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| Routine module — `lib/routineConstants.ts`                                   | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | X         |
| Routine module — `lib/{routineRouter,hubCalendarAggregate,…}.ts`             | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | X         |

> Notes on the matrix:
>
> - "Rule" combines Hard Rule violations + lint-enforced design conventions (#11/#12/#18 etc).
> - `tw` (Tailwind / design tokens) is folded into "Rule" where the finding is a Hard Rule (#11/#13) and is shown standalone otherwise.
> - Several Routine files share a single finding (e.g. F3 timezone bug spans 5 files); the count is recorded once at the canonical site to avoid double-counting in the summary.

## Recommendations roll-up (priority order for follow-up PRs)

1. **PR-α (high, security)** — F1 (Strategy fetch path), F2 (error sanitization).
2. **PR-β (high, bug)** — F3 (Kyiv-time helper across the module), F6 (deep-link validation), F21 (cleanup cutoff).
3. **PR-γ (high, rule)** — F4 (split `RoutineCalendarPanel`), F5 (purge foreign accents).
4. **PR-δ (medium, a11y + ux)** — F11 (i18n Ukrainian), F12 (design tokens), F13 (44 px target), F14 (DataState + skeleton), F18 (banner close), F20 (`aria-pressed`).
5. **PR-ε (medium, reliability)** — F7 (drop empty `catch`), F8 (permission flips), F9 (privacy mode).
6. **PR-ζ (test)** — F19 (cover orchestrator hook + derived + reminders + Strategy page).
7. **PR-η (cleanup)** — F10 (drop `!` in drag-reorder), F15 (`staleTime`), F16, F17, F22, F23.
