# Page Audit — Fizruk module Part 1 (Dashboard, Atlas, Workouts, Exercise)

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40)
> **Pages in scope:** Dashboard, Atlas, Workouts (+ helpers + types), Exercise; shell (`FizrukApp`, `FizrukRouter`, `FizrukHeader`, `fizrukNav`, `fizrukRoute`); supporting `components/`, `hooks/`, `lib/`.

## Summary

Pure static review (`grep` / `read`) of the four Fizruk Part 1 pages plus their orchestrator, shell, and lib code. Three dominant themes: (1) systemic absence of Hard Rule #10 lifecycle headers across the entire module subtree, (2) accessibility gaps on the Atlas page (keyboard, semantics, contrast) and on toggle / catalog controls inside Workouts, (3) a rest-timer correctness bug where the countdown is destroyed on page navigation and never re-fires its end cue. No critical security or data-loss issues identified.

- Critical: 0
- High: 5
- Medium: 14
- Low: 8
- **Total: 27**

## Findings

### F1 — Lifecycle markers missing across the entire Fizruk Part 1 subtree [severity: high] [perspective: lifecycle]

**Page:** all (module-wide)
**File:** `apps/web/src/modules/fizruk/FizrukApp.tsx`, `route.tsx`, `index.ts`, `pages/Dashboard.tsx`, `pages/Atlas.tsx`, `pages/Workouts.tsx`, `pages/Workouts.helpers.ts`, `pages/Workouts.types.ts`, `pages/Exercise.tsx`, `shell/FizrukRouter.tsx`, `shell/FizrukHeader.tsx`, `shell/fizrukNav.tsx`, `shell/fizrukRoute.ts`
**Lines:** file headers (top of each)

**Description.**
Hard Rule #10 (`lint-enforced-convention`) requires every file/doc to declare `> **Last validated:** YYYY-MM-DD by …` and `> **Status:**` (Active / Scaffolded / Deprecated / Archived). None of the ~13 scope files in this audit carry that header — neither the four route-shell pages nor the shell/router/header modules. Other audited surfaces in the repo (e.g. `docs/audits/2026-05-07-app-audit.md`) do declare the header, so the omission is a discipline drift rather than a missing convention.

**Why it matters.**
The lifecycle marker is the fleet-wide "is this current?" signal. Without it, freshness lint (`pnpm lint:freshness` / `bump-last-validated`) can't differentiate "module under active maintenance" from "abandoned". Reviewers reading a Fizruk page have no way to know whether the assumptions (e.g. dual-write rollout, T4 lazy-by-default) are still in force.

**Recommendation.**
Add the marker as the first JSDoc-style block in each TS/TSX file, e.g.:

```ts
/**
 * @lastValidated 2026-05-13 by @Skords-01
 * @status Active
 *
 * Fizruk dashboard — entry hero, KPI strip, recent workouts.
 */
```

(Use the format the rest of the module ends up converging on — `apps/web/src/modules/finyk/` is the historical reference.)

---

### F2 — Atlas page: `BodyAtlas` muscle highlighter is keyboard-inaccessible [severity: high] [perspective: a11y]

**Page:** Atlas
**File:** `apps/web/src/modules/fizruk/components/BodyAtlas.tsx`
**Lines:** L113–L142 (body-highlighter render block) + `pages/Atlas.tsx` L112–L118 (host card)

**Description.**
The body-highlighter SVG accepts mouse / touch clicks on each muscle path but exposes neither a focusable region nor a keyboard alternative. The host `<Card>` and surrounding `<div className="flex-1 overflow-y-auto">` carry no `role`, no `tabIndex`, no `aria-label` for the muscle map, and no list/grid of muscles for AT users. The anterior/posterior toggle buttons (BodyAtlas L86–L107) also lack `aria-pressed`, `aria-label`, and a `focus-visible:` ring — they fall back to bare `border` colour changes.

**Why it matters.**
WCAG 2.1.1 (Keyboard) blocker: screen-reader and keyboard-only users cannot inspect or select any muscle, which is the entire point of the Atlas page. The anterior/posterior toggle gives no audible state change either.

**Recommendation.**
Either (a) render a parallel hidden list of muscles + status that AT users can tab through (`<ul role="list">` with `aria-live="polite"` linking to the same `useRecovery` state), or (b) wrap each muscle path in a focusable `<g tabIndex="0" role="button" aria-label="Грудні мʼязи — готовий">`. For the toggle, add `aria-pressed={view === "anterior"}` plus `focus-visible:ring-2 focus-visible:ring-fizruk/50` and `min-h-[44px]`.

---

### F3 — Rest-timer is destroyed on page navigation and never fires the end-cue [severity: high] [perspective: bug]

**Page:** Workouts
**File:** `apps/web/src/modules/fizruk/hooks/useWorkoutsLifecycle.ts` (L69–L100) + `Workouts.tsx` (renders `RestTimerOverlay` only while mounted)
**Lines:** `useRestTimerCountdown` L69–L100; orchestrator unmount path: `Workouts.tsx` L57–L213

**Description.**
`useRestTimerCountdown` lives inside the Workouts page tree. The `restTimer` state and its `setInterval` are owned by `useWorkoutsOrchestrator`, which is mounted only while the user is on `/fizruk/workouts`. When the user navigates away (e.g. taps "Огляд" / "Атлас" mid-rest), the orchestrator unmounts, the interval is cleared, and `restTimer` resets to `null`. The end-of-rest sound + haptic + overlay never fire.

Reproduction trace: start a set → tap "Старт відпочинку" → navigate to Dashboard → wait 60 s → no cue, no overlay.

**Why it matters.**
The whole purpose of the rest timer is to free the user to look at their phone / put it down — i.e. not to remain visually engaged with the Workouts tab. The current behaviour silently degrades the only state where the feature has value (rest > 30 s without staring at the screen).

**Recommendation.**
Hoist rest-timer state to a module-wide context (e.g. `FizrukApp`-level provider) or to persistent storage with a `Worker` / `setTimeout(performance.now())` scheduler so the cue fires regardless of route. Easiest patch: dispatch a single `CustomEvent("fizruk:rest-completed")` from a module-level scheduler and let `RestTimerOverlay` render unconditionally inside `FizrukApp` (gated by event state).

---

### F4 — Non-null assertions bypass Hard Rule #19 (`noUncheckedIndexedAccess`) [severity: high] [perspective: ts]

**Page:** Exercise + Workouts
**File:** `apps/web/src/modules/fizruk/pages/Exercise.tsx` (L75), `hooks/useWorkoutsOrchestrator.ts` (L264–L271), `components/workouts/WorkoutItemCard.tsx` (sets loop L259, L288, L299)
**Lines:** see above

**Description.**
Hard Rule #19 enables `noUncheckedIndexedAccess: true` so `arr[i]` returns `T | undefined`. Several call-sites silence the resulting type error with the non-null operator `!`:

```ts
// Exercise.tsx L75
if (history.length > 0) lastWorkoutId = history[0]!.workout?.id;
```

```ts
// useWorkoutsOrchestrator.ts L264–L271
const [y, mo, d] = retroDate.split("-").map(Number);
const [hh, mm] = retroTime.split(":").map(Number);
const dt = new Date(y!, mo! - 1, d, hh, mm, 0, 0);
```

```ts
// WorkoutItemCard.tsx L259, L288, L299 (representative)
next[idx] = { ...next[idx]!, weightKg: … };
```

**Why it matters.**
Rule #19 is the line of defence against `Cannot read property 'X' of undefined` in mutation paths. `next[idx]!` is a structural defeat — if `idx` is wrong (e.g. set was concurrently removed by another tab via storage event), the spread throws and the entire workout card unmounts. `y! mo! - 1` propagates `NaN` into `new Date()` and silently constructs an invalid date.

**Recommendation.**
Replace each `!` with a runtime guard:

```ts
const head = history[0];
if (head) lastWorkoutId = head.workout?.id;
```

```ts
const cur = next[idx];
if (!cur) return prev; // bail; index drifted
next[idx] = { ...cur, weightKg: … };
```

For retro-workout parsing: validate `y, mo, d, hh, mm` with `Number.isFinite` before constructing the Date.

---

### F5 — `useWorkoutsViewFromSession` silently disables exhaustive-deps + bare `catch {}` [severity: high] [perspective: bug] [perspective: rule]

**Page:** Workouts
**File:** `apps/web/src/modules/fizruk/hooks/useWorkoutsLifecycle.ts`
**Lines:** L48–L61

**Description.**

```ts
useEffect(() => {
  try {
    const m = sessionStorage.getItem(VIEW_FROM_SESSION_KEY);
    if (m === "templates") { setView("templates"); sessionStorage.removeItem(…); }
    else if (m === "log")  { setView("log");       sessionStorage.removeItem(…); }
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; setView identity is stable
}, []);
```

Three issues stacked: (1) bare `catch {}` silently swallows quota / private-mode errors with no telemetry; (2) `react-hooks/exhaustive-deps` is disabled with an English comment in an internal Ukrainian-language codebase (Hard Rule #15 spirit); (3) `setView` is treated as stable, but that's a `useState` setter that React does in fact keep stable — the disable is correct, but the _reason_ the comment claims it is wrong (setters are stable because `useState` says so, not because of "identity stability").

**Why it matters.**
Bare `catch {}` blocks make storage-quota regressions invisible (the broader storage roadmap explicitly built `safeReadLS` / `safeWriteLS` to surface them via `dispatchEvent`). Disabling lint without a load-bearing reason invites the next mount-only effect to be copy-pasted with truly missing deps.

**Recommendation.**
Move the read to `safeReadStringLS`-style wrapper for `sessionStorage` (add one if missing — see F10), let it return `null` on failure, drop the bare `try/catch`, and remove the `eslint-disable-next-line` (an empty deps array on a setState-only effect is already correct without it).

---

### F6 — Missing test coverage for all four in-scope pages [severity: medium] [perspective: test]

**Page:** all four
**File:** none — checked for `pages/Dashboard.test.tsx`, `pages/Atlas.test.tsx`, `pages/Workouts.test.tsx`, `pages/Exercise.test.tsx`, `FizrukApp.test.tsx`, `shell/FizrukRouter.test.tsx`
**Lines:** n/a

**Description.**
None of the four page entrypoints, nor the `FizrukApp` shell or `FizrukRouter`, has a co-located test file. Sub-components do (`HeroCard.test.tsx`, `RecentWorkoutsSection.test.tsx`, `WorkoutItemCard.test.tsx`, etc.), as does the domain library (`fizruk-domain`). The composition layer — exactly where the orchestrator + rest-timer + deep-link bugs live (F3, F7) — is untested.

**Why it matters.**
The MSW + Vitest harness already exists; the marginal cost of one test per page is small. Without these tests, critical paths (workout-create → addItem → rest-timer → endWorkout → recent-workouts strip) regress silently.

**Recommendation.**
Add at minimum:

- `pages/Workouts.test.tsx` — render Workouts with seeded orchestrator state; assert tab transitions home → catalog → log → templates.
- `pages/Exercise.test.tsx` — render with `exerciseId="bogus"` → expects "not found" card (see F7); with valid id + seeded history → expects PR banner + 1RM card.
- `pages/Dashboard.test.tsx` — `heroState` resolution matrix (active / today / upcoming / empty) → expected CTA copy.
- `FizrukApp.test.tsx` — deep-link `/fizruk/exercise/abc-123` round-trip through `useFizrukRoute`.

---

### F7 — Exercise deep-link silently renders empty card on unknown `exerciseId` [severity: medium] [perspective: ux] [perspective: bug]

**Page:** Exercise
**File:** `apps/web/src/modules/fizruk/pages/Exercise.tsx`
**Lines:** L44–L155

**Description.**
`Exercise.tsx` guards only against the empty case: `if (!exerciseId) return <Card>Невірний ID вправи</Card>` (L146–L156). When `exerciseId` is non-empty but unmatched in the catalog (typo, deleted exercise, deep-link from a stale share-card), `ex` is `null`, `history` is `[]`, and the page renders silently with placeholder `h1 = "Вправа"`, no muscle tags, no charts, no LoadCalculator, and an `EmptyState` reading "Поки немає записів". There is no "Вправу не знайдено" / "Можливо, її видалили" affordance and the «Перейти до журналу» button does work, but the user has no idea why the page is empty.

**Why it matters.**
Stale share-cards and push notifications routinely encode `exerciseId`s. A broken deep-link rendering "blank but not crashed" looks like a bug in the user's data rather than a routing problem.

**Recommendation.**
Add a second guard:

```ts
if (exerciseId && !ex && history.length === 0) {
  return (
    <Card padding="lg">
      <EmptyState title="Вправу не знайдено" description="Можливо, її видалили з каталогу. Поверніться до журналу і виберіть зі списку." />
      <button onClick={() => onNavigate("workouts")}>До журналу</button>
    </Card>
  );
}
```

---

### F8 — Atlas page recomputes muscle-status mapping on every render (no `useMemo`) [severity: medium] [perspective: perf]

**Page:** Atlas
**File:** `apps/web/src/modules/fizruk/pages/Atlas.tsx`
**Lines:** L30–L75

**Description.**
The `statusByMuscle` map is built inside an IIFE `(() => { … })()` that runs on every render. The body iterates `Object.values(rec.by || {})` (~18 muscles) plus a 20-branch `if/else` mapper per entry. This isn't catastrophic, but the surrounding `<BodyAtlas>` is the only consumer and it expects identity-stable inputs to skip its internal SVG re-render.

**Why it matters.**
Even small render-time work compounds: Atlas re-renders whenever `useRecovery()` re-emits (storage events, BroadcastChannel ticks). With the cost burned in on every cycle, the body-highlighter SVG path re-paints needlessly.

**Recommendation.**

```ts
const statusByMuscle = useMemo(() => {
  const map = (id) => { … };
  const worst = (a, b) => { … };
  const out: Partial<Record<HighlighterMuscle, MuscleStatus>> = {};
  for (const m of Object.values(rec.by || {})) { … }
  return out;
}, [rec.by]);
```

---

### F9 — Exercise charts use raw RGB literals instead of design tokens [severity: medium] [perspective: tailwind] [perspective: rule]

**Page:** Exercise
**File:** `apps/web/src/modules/fizruk/pages/Exercise.tsx`
**Lines:** L256, L270, L284, L301

**Description.**

```tsx
<ExerciseProgressChart … color="rgb(22 163 74)" />   // 1RM — green
<ExerciseProgressChart … color="rgb(99 102 241)" /> // Volume — indigo
<ExerciseProgressChart … color="rgb(234 88 12)" /> // Pace — orange
<ExerciseProgressChart … color="rgb(6 182 212)" /> // Distance — cyan
```

These bypass the design-token registry (`text-success`, `text-fizruk`, `--c-warning`, `--c-info`) and hard-code Tailwind raw palette values. Hard Rule #11 forbids arbitrary hex in `className`, and Rule #12 (module-accent containment) is meant to prevent foreign accents inside a module subtree. The orange / indigo / cyan triplet here is precisely the cross-module palette leak the rule targets — even though these are inline JS strings rather than `className` (so the ESLint rule technically doesn't catch them).

**Why it matters.**
When the theme migrates (light-mode contrast bump, dark-mode shift, brand refresh), these literals will not track. The chart legend will drift out of sync with the rest of the module.

**Recommendation.**
Expose CSS custom properties on `:root` (e.g. `--chart-strength`, `--chart-volume`, `--chart-pace`, `--chart-distance`) and consume them from JS via `getComputedStyle(document.documentElement).getPropertyValue("--chart-pace").trim()` (memoised at chart-mount), or accept `color` as a token name and let the chart component resolve it.

---

### F10 — Direct `sessionStorage` access without a shared safe-wrapper [severity: medium] [perspective: rule] [perspective: bug]

**Page:** Dashboard + Workouts
**File:** `pages/Dashboard.tsx` L311, L319; `hooks/useFizrukProgramStart.ts` L86; `hooks/useWorkoutsLifecycle.ts` L51, L54, L57
**Lines:** see above

**Description.**
The `sergeant-design/no-raw-local-storage` ESLint rule (`packages/eslint-plugin-sergeant-design/index.js` L370+) blocks raw `localStorage.*` but explicitly does NOT cover `sessionStorage`. Three call-sites in scope use `sessionStorage.setItem("fizruk_workouts_mode", "log" | "templates")` to hand off view state across navigations. Failure handling is inconsistent: Dashboard L312–L314 has a brief comment, useFizrukProgramStart L87–L90 has an explanatory comment, useWorkoutsLifecycle L59 has a bare `catch {}`.

```ts
// Dashboard.tsx L310–L316
try {
  sessionStorage.setItem("fizruk_workouts_mode", "log");
} catch {
  /* non-fatal: default view is still reachable */
}
onNavigate("workouts");
```

**Why it matters.**
Same hazards as raw `localStorage` (quota, private-mode Safari, disabled storage), no central observability, and no place to mock in tests. Without a wrapper, dual-write integration testing for view-handoff has to monkey-patch `sessionStorage` directly.

**Recommendation.**
Add `safeWriteSS` / `safeReadStringSS` companions to `@shared/lib/storage/storage.ts` (mirror the LS API), refactor the three call-sites, and extend `sergeant-design/no-raw-local-storage` to a sibling `no-raw-session-storage` rule.

---

### F11 — `todayLocalDateString()` ignores the Europe/Kyiv domain invariant [severity: medium] [perspective: bug] [perspective: rule]

**Page:** Workouts (retro)
**File:** `apps/web/src/modules/fizruk/pages/Workouts.helpers.ts`
**Lines:** L121–L127

**Description.**

```ts
export function todayLocalDateString(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
```

Uses the device's local time-zone. Domain invariant (`docs/architecture/domain-invariants.md`, AGENTS.md § Domain invariants) is **Europe/Kyiv** for day-key derivation. A user retro-logging at 23:30 local while travelling in Lisbon would create a record for 2026-05-13 (local) when in Kyiv it is already 2026-05-14 — and aggregation queries that group by Kyiv day will land the row in the wrong bucket.

**Why it matters.**
Cross-region travel + retro-log + daily-streak / weekly KPI = silent off-by-one. The same pattern was the source of past `kopiykas`-as-string bugs flagged in the domain-invariants doc.

**Recommendation.**
Use a Kyiv-locked formatter:

```ts
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function todayLocalDateString() {
  return fmt.format(new Date()); // "YYYY-MM-DD" by virtue of en-CA
}
```

---

### F12 — `pendingPicks` typed as `unknown[]` then cast inside the handler [severity: medium] [perspective: ts]

**Page:** Dashboard
**File:** `apps/web/src/modules/fizruk/pages/Dashboard.tsx`
**Lines:** L81, L111–L116, L453

**Description.**

```ts
const [pendingPicks, setPendingPicks] = useState<unknown[] | null>(null);
…
for (const ex of picks as Array<{
  id: string;
  primaryGroup?: string;
  name?: { uk?: string; en?: string };
  muscles?: { primary?: string[]; secondary?: string[] };
}>) { … }
```

The `unknown[]` state is then re-asserted with a structural cast at the call-site. The codebase has the canonical `RawExerciseDef` type (`@sergeant/fizruk-domain/data`); using it here would let TypeScript catch any mismatch when the exercise schema evolves.

**Why it matters.**
`unknown[]` defeats the strict-mode story: any future change to the exercise picker that drops `primaryGroup` won't show up in the type system until users hit the path at runtime. The cast pattern is also exactly the "as cast" anti-pattern the AGENTS playbook calls out.

**Recommendation.**

```ts
const [pendingPicks, setPendingPicks] = useState<RawExerciseDef[] | null>(null);
```

…and drop the cast inside `startWorkoutFromPlan`.

---

### F13 — HeroCard "active" tick can freeze for tens of seconds when tab is backgrounded [severity: medium] [perspective: bug]

**Page:** Dashboard
**File:** `apps/web/src/modules/fizruk/components/dashboard/HeroCard.tsx`
**Lines:** elapsed-seconds tick (search for `setInterval` / `Date.now`)

**Description.**
The "active workout" state shows `mm:ss` since `startedAtIso`. The interval-based tick (1 Hz) is throttled or paused by iOS Safari when the tab is hidden or the device is locked. On resume, the displayed time jumps forward by the full pause amount in one frame, which is jarring on long rests (the user sees the timer skip from `04:22` to `09:48`).

**Why it matters.**
The visual hop reads as a render bug rather than the platform-level intentional behaviour it is. Trustworthy "live duration" UI is core to a workout-tracking surface.

**Recommendation.**
Subscribe to `document.visibilitychange` and force-recompute `elapsedSec = (Date.now() - new Date(startedAtIso).getTime()) / 1000` on `visible`, ideally with a brief `Math.min(prevElapsed + 1, computed)` smoothing so the displayed value catches up over ~1 s rather than jumping in one frame.

---

### F14 — `<select>` in WorkoutItemCard has no accessible name [severity: medium] [perspective: a11y]

**Page:** Workouts → log
**File:** `apps/web/src/modules/fizruk/components/workouts/WorkoutItemCard.tsx`
**Lines:** L207–L239

**Description.**
The exercise-type `<select>` is preceded by a section header but has no `aria-label`, no `<label htmlFor>` association, and no `aria-labelledby`. Screen readers announce it as "combobox, силова" with no name. The select is interactive (changes set / distance / time mode), so missing the name is a WCAG 1.3.1 (Info & Relationships) miss.

**Why it matters.**
A keyboard / SR user landing on the select hears only the current value — they have to context-switch to figure out what the combobox controls.

**Recommendation.**

```tsx
<label className="sr-only" htmlFor={`type-${it.id}`}>Тип вправи</label>
<select id={`type-${it.id}`} … />
```

---

### F15 — Workout catalog group accordion lacks `aria-expanded` / `aria-controls` [severity: medium] [perspective: a11y]

**Page:** Workouts → catalog
**File:** `apps/web/src/modules/fizruk/components/workouts/WorkoutCatalogSection.tsx`
**Lines:** L139–L150 (group toggle), L153–L180 (panel)

**Description.**
The muscle-group header is rendered as a `<button>` toggling the panel below it, but the toggle has no `aria-expanded`, no `aria-controls` linking to the panel id, and the panel has no matching `id` / `role="region"`. Screen readers announce "Грудні (8) button" with no hint that activation expands a list.

**Why it matters.**
The catalog is the primary discovery surface; if AT users can't tell which groups are expanded they have to memorise state by trial-and-error.

**Recommendation.**

```tsx
<button aria-expanded={isOpen} aria-controls={panelId} …>{label}</button>
{isOpen && <div id={panelId} role="region" aria-labelledby={headerId}>…</div>}
```

---

### F16 — Atlas legend uses raw `bg-yellow-400` instead of the `warning` semantic token [severity: medium] [perspective: tailwind] [perspective: rule]

**Page:** Atlas
**File:** `apps/web/src/modules/fizruk/pages/Atlas.tsx`
**Lines:** L98

**Description.**
The "Відновлюється" legend dot uses `bg-yellow-400` — a raw Tailwind palette colour with no `dark:` variant. The other two dots use semantic tokens (`bg-success`, `bg-danger`). Inside `BodyAtlas` itself the warning-status path uses `THEME_HEX.warning` (the registered token). The legend and the actual rendering can drift if the warning token changes.

**Why it matters.**
Hard Rule #13 (`no raw-palette light/dark className pairs`) targets exactly this mismatch — the visual contract that "yellow dot = warning state" breaks when one side is the token and the other is raw palette.

**Recommendation.**
Replace `bg-yellow-400` with `bg-warning` (and adjust the SVG fill in BodyAtlas if needed so both sides reference the same CSS custom property).

---

### F17 — Voice input commits a parsed set + starts rest timer before user confirmation [severity: medium] [perspective: ux] [perspective: bug]

**Page:** Workouts → log
**File:** `apps/web/src/modules/fizruk/components/workouts/WorkoutItemCard.tsx`
**Lines:** voice-input handler (search for `parseWorkoutSetSpeech` / `setRestTimer`)

**Description.**
When Whisper parses a set ("80 kg × 8 reps"), the handler immediately appends the set to `it.sets` and starts the rest timer. If Whisper mis-transcribes (common with Ukrainian numbers + background gym noise), the user sees an incorrect set silently logged and a rest overlay covering the screen. Reverting the set requires manually editing the row.

**Why it matters.**
Workout logging is the highest-frequency mutation surface in the module. Optimistic-commit + auto-advance is OK for trusted inputs (manual taps) but not for ASR.

**Recommendation.**
Two-step UX: voice-parse populates a draft chip ("80 кг × 8 — Підтвердити / Виправити"); on Confirm → commit + start rest timer; on Edit → focus the weight input.

---

### F18 — Hero-card "today" CTA uses `bg-fizruk-strong text-white` without runtime contrast assertion [severity: medium] [perspective: a11y]

**Page:** Dashboard
**File:** `apps/web/src/modules/fizruk/components/dashboard/HeroCard.tsx` (L405 + several CTA buttons), `pages/Exercise.tsx` L383
**Lines:** see above

**Description.**
Hard Rule #9 requires the `-strong` companion when a saturated brand fill carries `text-white`. The Fizruk surfaces in scope do use `bg-fizruk-strong text-white` (compliant). But the contrast assertion is only enforced via the token registry's static colour values — there is no `axe-core` / `Playwright a11y` test that verifies the CTA contrast in either theme after a token shift. The Fizruk team has migrated `--c-fizruk-strong` at least once already (round-12 design).

**Why it matters.**
A future theme tweak that nudges `--c-fizruk-strong` toward teal-500 (instead of teal-600) would silently drop contrast under WCAG AA's 4.5:1 floor for normal text. No CI gate catches it.

**Recommendation.**
Add a `@critical` Playwright test (axe rule `color-contrast`) that boots `/fizruk` and `/fizruk/exercise/:id`, asserts the CTA buttons pass `color-contrast` in both light and dark mode. Run it inside the existing `apps/web/tests/smoke/` lane.

---

### F19 — `useWorkouts.uid()` uses `Math.random()` for client-generated workout / item IDs [severity: medium] [perspective: bug]

**Page:** all (data layer)
**File:** `apps/web/src/modules/fizruk/hooks/useWorkouts.ts` (search for `uid()`), plus `ActiveWorkoutPanel.tsx` (L15)
**Lines:** see above

**Description.**
Workout and workout-item IDs are minted locally as `${Date.now()}_${Math.random().toString(36).slice(2)}`. These IDs are written to localStorage and then propagated through the dual-write pipeline to the SQLite `fizruk_workouts` / `fizruk_workout_items` tables, with the server eventually treating them as canonical primary keys. `Math.random()` is not cryptographically unique, and the `Date.now()` prefix gives only millisecond granularity — two rapid mutations (auto-restart after crash, multi-tab) can collide.

**Why it matters.**
Collisions are extremely unlikely (1 in ~10⁹ per ms) but the failure mode — silently overwriting a workout — is high-impact. The server has no opportunity to reject the duplicate ID because the dual-write pipeline trusts the client.

**Recommendation.**
Use `crypto.randomUUID()` (available on every supported browser per the existing `@sergeant/shared` baseline) or the `nanoid` already used elsewhere in the repo. Mass migrate via a one-shot helper that re-keys legacy IDs in LS at boot.

---

### F20 — `eager`-imported `useExerciseCatalog` payload runs at FizrukApp mount even on Dashboard [severity: medium] [perspective: perf]

**Page:** Dashboard (entry)
**File:** `apps/web/src/modules/fizruk/FizrukApp.tsx` L7, `hooks/useExerciseCatalog.ts`
**Lines:** L7 import

**Description.**
`useExerciseCatalog` loads the full exercise list (definitions + Ukrainian translation maps) on every Fizruk mount because `FizrukApp` imports it at the top of the module. The Dashboard only needs the catalog when the user starts a workout from a template; Atlas, Workouts (home view), Exercise need it lazily. The full module (`apps/web/AGENTS.md § Bundle budget`) is already lazy via `lazyDefault`, but the exercise-catalog payload is eagerly executed once the chunk is parsed.

**Why it matters.**
Module-entry TTI is bound by this eager evaluation. The Lighthouse CI gate (LCP ≤ 2000 ms, FCP ≤ 1500 ms, see `apps/web/AGENTS.md § Lighthouse CI`) covers `/fizruk` — but a slow exercise-catalog hydration plays directly into that budget.

**Recommendation.**
Either (a) defer the catalog to first use (`React.use(catalogPromise)` from a context) or (b) split the Ukrainian translation map into a JSON chunk fetched at first start-workout interaction. Validate against `pnpm --filter @sergeant/web lighthouse`.

---

### F21 — ContextualBackButton min-height of 40 px violates the 44 px touch-target floor [severity: low] [perspective: a11y]

**Page:** shell (Atlas, Workouts, Exercise, Measurements)
**File:** `apps/web/src/modules/fizruk/shell/FizrukHeader.tsx`
**Lines:** L80

**Description.**

```tsx
className={cn(
  "-ml-1 flex items-center gap-1 rounded-xl px-2 py-2 min-h-[40px]",
  …
)}
```

WCAG 2.5.5 and `apps/web/AGENTS.md § Touch targets` mandate ≥44×44 on coarse pointers (the shared `Button` auto-applies this via `min-h-[44px] min-w-[44px]` for `xs`/`sm`/`iconOnly`). The contextual back button bypasses the `Button` primitive and hand-rolls `min-h-[40px]`.

**Why it matters.**
Four pixels under the floor compounds with thumb travel on mobile; missed taps are the most common source of "back button is broken" reports.

**Recommendation.**
Bump to `min-h-[44px]` (and `min-w-[44px]` if the SVG-only collapsed state at < 640 px applies).

---

### F22 — Atlas page may render two `<h1>` elements [severity: low] [perspective: a11y]

**Page:** Atlas
**File:** `apps/web/src/modules/fizruk/pages/Atlas.tsx` L87, `shell/FizrukHeader.tsx`
**Lines:** Atlas L87

**Description.**
Atlas declares its own `<h1>Стан відновлення</h1>` at L87. `FizrukHeader` is rendered above it inside `ModuleShell` and the header surface typically contains a page-title element. If that surface uses `<h1>` (need to verify in `ModuleShell` + `FizrukHeader`), the page emits two `h1`s, which is a WCAG 1.3.1 outline anomaly.

**Why it matters.**
Multiple `h1`s confuse SR navigation by heading hierarchy.

**Recommendation.**
Demote the page-level title to `<h2>` (and keep the visual size via `text-hero font-black`), or audit `ModuleShell` to confirm the header doesn't emit an `h1`.

---

### F23 — `text-2xs` used for prose sub-heading outside its sanctioned use case [severity: low] [perspective: tailwind] [perspective: rule]

**Page:** Dashboard
**File:** `apps/web/src/modules/fizruk/pages/Dashboard.tsx`
**Lines:** L365

**Description.**

```tsx
<span className="text-2xs text-muted">
  {recentlyUsed.length > 0 ? "Нещодавно використані" : "Останні шаблони"}
</span>
```

`packages/design-tokens/tailwind-preset.js` (L437–L445, L737–L740) is explicit: `text-2xs` (10 px) "is reserved for chart ticks and decorative metadata badges and is NOT a `text-style-*` slot." Hard Rule #16 sets a 12 px floor for prose. This sub-heading reads as prose copy.

**Why it matters.**
Drift from the semantic-typography registry; surfaces accumulate ad-hoc small text that's hard to keep readable.

**Recommendation.**
Use `text-style-overline` or `text-style-caption` (12 px floor) for the sub-heading slot.

---

### F24 — `bg-yellow-400/40` / `bg-yellow-400/10` in PR celebration banner bypasses semantic tokens [severity: low] [perspective: tailwind]

**Page:** Exercise
**File:** `apps/web/src/modules/fizruk/pages/Exercise.tsx`
**Lines:** L186

**Description.**

```tsx
<div className="flex items-center gap-2.5 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3">
```

Raw Tailwind palette + opacity, no `dark:` variant, no link to the `warning` token already used elsewhere in the page (`text-warning-strong/80`).

**Why it matters.**
Same as F16 — visual contract drifts from the semantic registry; future theme migration leaves the celebration banner orphaned.

**Recommendation.**
`border-warning/40 bg-warning/10` (both opacity steps are registered).

---

### F25 — No AI markers across the four pages or the shell [severity: low] [perspective: ai-marker]

**Page:** all
**File:** entire scope subtree
**Lines:** n/a

**Description.**
Searched for `AI-NOTE`, `AI-CONTEXT`, `AI-DANGER`, `AI-GENERATED`, `AI-LEGACY` across the audit scope — zero matches. Other modules in the repo (e.g. `finyk`, `nutrition`) do carry these markers for high-risk zones. The Fizruk module's most sensitive zones — rest-timer side effects (F3), retro-workout timezone handling (F11), uid generation (F19), Whisper voice commit (F17) — would all benefit from `AI-DANGER` annotations so future AI edits flag the risk before committing.

**Why it matters.**
The marker convention exists precisely so AI-assisted refactors halt at high-risk points. Module without markers ≈ module that won't trigger that pause.

**Recommendation.**
Add `// AI-DANGER: rest-timer state lives in component tree; navigating away cancels the cue (#F3)` above `useRestTimerCountdown`, and similar annotations on the other three zones.

---

### F26 — Single `<Suspense>` fallback skeleton flashes on every Fizruk page change [severity: low] [perspective: ux] [perspective: perf]

**Page:** all (shell)
**File:** `apps/web/src/modules/fizruk/shell/FizrukRouter.tsx`
**Lines:** L36–L47 lazy imports + the shared Suspense boundary

**Description.**
Each page is `lazyDefault`-imported (good — supports the lazy-by-default bundle policy). But they all share a single `<Suspense fallback={skeleton}>`, so navigating between any two pages briefly unmounts the previous page and shows the skeleton. With `<Suspense>` + `React.startTransition()`, the previous page could stay rendered during the load.

**Why it matters.**
Visible jank on tab transitions inside a route shell.

**Recommendation.**

```tsx
const [, startTransition] = useTransition();
const navigate = (next) => startTransition(() => actualNavigate(next));
```

…and split each lazy page into its own Suspense boundary so the orchestrator can keep the previous view mounted.

---

### F27 — `useWorkoutsOrchestrator.executeTemplateStart` defines a `TemplateGroup` interface inside the callback body [severity: low] [perspective: rule] [perspective: ts]

**Page:** Workouts
**File:** `apps/web/src/modules/fizruk/hooks/useWorkoutsOrchestrator.ts`
**Lines:** L188–L240 (the `executeTemplateStart` body)

**Description.**
The function declares a local `interface TemplateGroup` inside its body — recreated on every render of the hook's host. While TypeScript hoists interfaces and there's no runtime allocation, the pattern obscures the type's reach (other helpers in the same orchestrator could legitimately reuse it) and trips up grep-based navigation.

**Why it matters.**
Code-quality nit, not a bug. Maintenance cost.

**Recommendation.**
Lift to module scope alongside the other types in `Workouts.types.ts`.

---

## Per-perspective audit log

For perspectives where no findings were raised, this column records that the check ran (one-liner per perspective per page). Findings reference the F-numbers above.

### Dashboard.tsx

- Security: checked — no `dangerouslySetInnerHTML`, no user-input `href`, no `eval`, no untrusted `window.location` writes. OK.
- A11y: F18 (CTA contrast assertion), F21 (back button), F22 (h1 outline) potentially affect this page; primary CTAs use `min-h-[52px]` / `min-h-[44px]` (good).
- Perf: F20 (eager catalog); no inline objects in props observed; useMemo coverage is conservative-but-correct.
- UX: empty-state (HeroCard `kind:"empty"` branch) covered; loading via `<DataState>` covered.
- Bug: F13 (HeroCard visibility tick).
- Rule: F1 (lifecycle), F10 (raw sessionStorage), F12 (unknown[] cast); RQ keys n/a (no React Query usage).
- TS: F4 (no `!` assertion seen in Dashboard itself; the unknown[] cast L111 covered by F12).
- Tailwind: F23 (`text-2xs` for prose); opacity steps used (`/10`, `/20`, `/80`) all registered.
- i18n: all strings Ukrainian; dates via `toLocaleDateString("uk-UA", …)` — OK.
- Test: F6.
- AI marker: F25.
- Lifecycle: F1.

### Atlas.tsx

- Security: checked — recovery data is internal (`useRecovery` reads from SQLite/LS). No XSS surface. OK.
- A11y: F2 (BodyAtlas keyboard + toggle), F22 (h1 outline).
- Perf: F8 (missing useMemo).
- UX: legend is present; no loading skeleton because `useRecovery` is sync from cache.
- Bug: none specific to Atlas.
- Rule: F1 (lifecycle), F16 (yellow-400 legend).
- TS: OK.
- Tailwind: F16.
- i18n: all strings Ukrainian. OK.
- Test: F6.
- AI marker: F25.
- Lifecycle: F1.

### Workouts.tsx (+ helpers + types)

- Security: checked — `PullToRefresh` callback handler is safe; no XSS surface. OK.
- A11y: F14 (`<select>` name), F15 (catalog accordion), F2-spirit (toggle buttons elsewhere), F21 (back button).
- Perf: `<DataState>` loading wrapper provides skeleton; no obvious re-render storms.
- UX: F17 (voice commit), F3 (rest-timer navigation).
- Bug: F3 (rest timer), F11 (timezone), F19 (uid).
- Rule: F1 (lifecycle), F5 (eslint-disable + bare catch), F10 (raw sessionStorage), F4 (`!` in WorkoutItemCard).
- TS: F4.
- Tailwind: opacity steps OK; `bg-fizruk-strong` companion OK (Rule #9).
- i18n: all strings Ukrainian (`messages.loadingActions.loadingWorkouts`, etc.). OK.
- Test: F6.
- AI marker: F25.
- Lifecycle: F1.

### Exercise.tsx

- Security: checked — `onNavigate("workouts")` is internal; deep-link `exerciseId` not echoed as raw HTML. OK.
- A11y: F18 (CTA contrast assertion), `<button>` at L381 lacks `min-h-[44px]` explicitly but `py-4` gives ~56 px → OK.
- Perf: useMemo coverage solid; F20 (eager catalog).
- UX: F7 (silent empty card on unknown id); empty state for "no history" present (L313).
- Bug: F4 (`!` on L75), F19 (uid via WorkoutItem ids).
- Rule: F1 (lifecycle), F9 (RGB literals).
- TS: F4.
- Tailwind: F9 (RGB literals), F24 (yellow-400 banner); opacity steps OK.
- i18n: all strings Ukrainian; dates `toLocaleDateString("uk-UA", …)`. OK.
- Test: F6.
- AI marker: F25.
- Lifecycle: F1.

## Per-page coverage matrix

X = audited, no findings. Number = count of findings. — = not applicable.

| Page                | sec | a11y | perf | ux  | bug | rule | ts  | tw  | i18n | test | ai  | lifecycle |
| ------------------- | --- | ---- | ---- | --- | --- | ---- | --- | --- | ---- | ---- | --- | --------- |
| Dashboard.tsx       | X   | 3    | 1    | X   | 1   | 3    | 1   | 1   | X    | 1    | 1   | 1         |
| Atlas.tsx           | X   | 2    | 1    | X   | X   | 2    | X   | 1   | X    | 1    | 1   | 1         |
| Workouts.tsx (+h/t) | X   | 4    | X    | 2   | 3   | 4    | 1   | X   | X    | 1    | 1   | 1         |
| Exercise.tsx        | X   | 1    | 1    | 1   | 2   | 3    | 1   | 2   | X    | 1    | 1   | 1         |

## Summary of recommendations

**Highest priority (high severity, broad impact):**

1. F3 — hoist rest-timer state so the cue fires regardless of route.
2. F1 — add lifecycle markers across the module.
3. F2 — make `BodyAtlas` keyboard-accessible (toggle + muscle list).
4. F4 — replace non-null assertions with runtime guards.
5. F5 — fix bare `catch {}` and the questionable `eslint-disable-next-line`.

**Tooling debt (extend lint / test coverage):**

6. F6 — add page-level tests for the four scope pages.
7. F10 — add `safeWriteSS` / `safeReadStringSS` to `@shared/lib/storage` and a sibling ESLint rule `no-raw-session-storage`.
8. F18 — add an axe-core CI check for CTA contrast on `/fizruk` and `/fizruk/exercise/:id`.

**Domain invariant / data integrity:**

9. F11 — use Europe/Kyiv-locked formatter for retro-workout day key.
10. F19 — migrate `Math.random()`-based ids to `crypto.randomUUID()`.

The rest (F7, F8, F9, F12–F17, F20–F27) are medium-to-low and can be batched into a follow-up cleanup PR.

## Out of scope (flagged for the next audit)

- Programs / Plan / Body / Progress / Measurements pages and their orchestrators — Part 2.
- Server-side `fizruk_*` table schema and the dual-write pipeline (`apps/server`).
- `lazyDefault` chunk graph and the Vercel build artefact tree — covered by the bundle-budget audit cadence.
- Lighthouse run for `/fizruk` and `/fizruk/exercise/:id` — recommended to re-run after F20 is addressed.
