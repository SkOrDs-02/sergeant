# Page Audit — Finyk module — 5 pages (overview/transactions/budgets/analytics/assets)

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Pages in scope:** Огляд (Overview), Транзакції (Transactions), Бюджети (Budgets), Аналітика (Analytics), Активи (Assets) — `apps/web/src/modules/finyk/**`

## Scope

Static code review against `main @ 7f25ca16` (no runtime / build / test
execution). Examined entry points, page shells, and supporting hooks/lib
under `apps/web/src/modules/finyk/`:

- `FinykApp.tsx`, `route.tsx`, `index.ts`, `constants.ts`, `utils.ts`,
  `hubRoutineSync.ts`
- `pages/Overview.tsx`, `pages/overview/**`
- `pages/transactions/**`
- `pages/budgets/**`
- `pages/Analytics.tsx`
- `pages/Assets.tsx`, `pages/Assets*.tsx`, `pages/useAssetsState.ts`,
  `pages/AssetsForm.tsx`
- `components/**`, `hooks/**`, `lib/**` (sampled for cross-cutting issues)

Audit perspectives: security, accessibility (WCAG 2.1 AA), performance,
UX states, bug hunting, code-quality / hard-rules compliance, TypeScript
strictness, Tailwind / design tokens, i18n / copy, testing coverage,
AI markers, lifecycle markers.

## Summary

- Critical: 0
- High: 8
- Medium: 13
- Low: 4

Total: 25 findings.

### Headline themes

1. **Design-token compliance is uneven.** Two clusters of Hard Rule #8 /
   #9 / #12 / #13 violations exist: arbitrary decimal opacity
   (`/[.06]`, `/[.14]`) on `HeroCard`, and raw `emerald-*` palette
   colours behind `text-white` without the `-strong` companion across
   `FirstInsightBanner`, `ManualExpenseSheet`, `LimitBudgetCard`,
   `MonthlyPlanCard`. The ESLint plugin only catches the `/<int>` form
   of the opacity rule, so the decimal escape is a stealth bypass.

2. **Date handling is fragile in long-lived PWA sessions.** Several
   hooks (`useTransactionFilters`, `useOverviewData`, `Analytics`)
   capture `new Date()` at module-load or render time and never
   refresh; crossing midnight or month-end inside a kept-open tab
   leaves `isCurrentMonth`, `todayDayKey`, and "сьогодні"/"завтра"
   labels stale. `parseLocalDate` silently produces `Invalid Date` on
   empty input, propagating `NaN` into "через NaN дн" UI.

3. **Touch-target discipline is broken in two visible places.** Analytics
   month-nav buttons are `w-9 h-9` (36 px), Transactions filter pills
   `h-7` (28 px) opt-out via `data-compact`, "Усі →" link in
   `PlannedFlowsCard` uses arbitrary `min-h-[36px]`. WCAG 2.5.5 / Apple
   HIG ≥44 px is the documented contract; these surfaces violate it.

4. **Ukrainian pluralization is wrong.** `pluralizeOps` returns
   `"операції"` for n = 1 (should be `операцію`) and `"операцій"` for
   n = 2…4 (should be `операції`). `MonthPulseCard` works around the
   same problem by falling back to the abbreviation `"дн."` for n ≥ 5,
   which fails on 21 / 31 (should read `"21 день"`).

5. **Testing coverage is missing on the page-level glue.** Page shells
   (`Overview`, `Analytics`, `Budgets`, `Transactions`, `Assets`) and the
   filter / selection / overview-data hooks have no tests. Critical
   financial flows (filter, batch-undo, networth aggregation,
   plural-toast) are exercised only at the lower utility layer.

6. **Type safety drifts at one storage boundary.** `Budget` is not a
   discriminated union (`type: "limit" | "goal"` + branch-specific
   fields); goal-specific reads are forced through
   `(b as { targetAmount?: unknown }).targetAmount` casts. Hard Rule #19
   (`noUncheckedIndexedAccess`) is bypassed in
   `TransactionFilters.tsx` via implicit-string concat on
   `c.label.split(" ")[0]`.

## Findings

### F1 — Day-budget displays magnitude only; minus sign suppressed [severity: high] [perspective: ux]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/HeroCard.tsx`
**Lines:** L120–L128

**Description.**
HeroCard is documented as the single source of truth for the daily
expense allowance. When the user is overspent (`dayBudget < 0`), the
hero number is wrapped in `Math.abs(...)` before formatting:

```tsx
{Math.round(Math.abs(dayBudget)).toLocaleString("uk-UA", {
  maximumFractionDigits: 0,
})}
<span className="text-2xl font-semibold ml-1 opacity-70">₴/день</span>
```

The status text under it (`computePulseStyle.statusText`) is the only
signal of deficit; the headline number reads identically to a healthy
budget of the same magnitude.

**Why it matters.**
A user who is 200 ₴/day overspent sees the same `200 ₴/день` headline
as a user with 200 ₴/day to spend. This is a direct contradiction
between the visual hero (the largest number on the page) and the
underlying state — and it actively biases spending decisions toward
"I have money left".

**Recommendation.**
Render the explicit sign and adjust the colour token from the existing
`color` slot:

```tsx
<>{dayBudget < 0 ? "−" : ""}
{Math.round(Math.abs(dayBudget)).toLocaleString("uk-UA", {
  maximumFractionDigits: 0,
})}
…</>
```

Optionally swap the suffix to `"₴ перевитрата/день"` when negative.

---

### F2 — Arbitrary decimal opacity bypasses `valid-tailwind-opacity` [severity: high] [perspective: tailwind]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/HeroCard.tsx`
**Lines:** L57–L58

**Description.**
HeroCard uses JIT arbitrary opacity values:

```tsx
"rounded-3xl bg-finyk/[.06] dark:bg-finyk-surface-dark/10",
"border border-finyk/[.14] dark:border-finyk-border-dark/20",
```

The registered scale (per the ESLint rule `sergeant-design/valid-tailwind-opacity`)
is `0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
85, 90, 95, 100`. `.06` (= 6) and `.14` (= 14) are not on the scale.
Because the rule only matches the `/<integer>` syntax, the decimal form
`/[.NN]` evades enforcement entirely.

**Why it matters.**
Hard Rule #8 is meant to keep contrast and visual rhythm consistent
across the app. Stealth bypasses prevent the lint gate from doing its
job and accumulate "almost-but-not-quite" tokens. This is the only
remaining `/[.<decimal>]` usage in the Finyk module subtree, so it is
trivial to fix and tighten the lint at the same time.

**Recommendation.**
Replace with on-scale values:

```tsx
"rounded-3xl bg-finyk/5 dark:bg-finyk-surface-dark/10",
"border border-finyk/15 dark:border-finyk-border-dark/20",
```

Extend `sergeant-design/valid-tailwind-opacity` to also flag the
decimal-arbitrary form (track as a follow-up). PR is docs-only, so the
fix and the lint tightening land in a code PR.

---

### F3 — Raw `emerald` palette with `text-white` and no `-strong` companion [severity: high] [perspective: tailwind]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/FirstInsightBanner.tsx`
**Lines:** L20–L43

**Description.**
The first-insight banner stacks several token violations at once:

```tsx
<div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 …">
  <div className="… rounded-2xl bg-emerald-500/15 …" aria-hidden>💡</div>
  …
  <button className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white
    text-xs font-semibold hover:bg-emerald-700 transition">
    Поставити бюджет
  </button>
```

- Raw `emerald-500/25`, `emerald-500/10`, `emerald-500/15`,
  `emerald-600`, `emerald-700` instead of the semantic `bg-finyk` /
  `bg-success` / `bg-finyk-strong` tokens (Rule #12 module-accent
  containment expects semantic accent, not the underlying palette
  name).
- `bg-emerald-600 text-white hover:bg-emerald-700` — saturated brand
  fill behind `text-white` without the `-strong` companion. Direct
  Hard Rule #9 violation.
- `bg-emerald-500/15` doubles as the icon backplate — same containment
  concern.

Similar leaks exist in `useOverviewData.ts:350`
(`forecastBarClass: "bg-emerald-500"`),
`components/ManualExpenseSheet.tsx:404, 555`,
`components/budgets/LimitBudgetCard.tsx:120`,
`components/budgets/MonthlyPlanCard.tsx:243`,
`components/RecurringSuggestions.tsx:26`,
`components/SyncStatusBadge.tsx:44`.

**Why it matters.**
Bypassing the semantic-token contract means future palette tweaks
(dark-mode contrast pass, brand re-shade) won't propagate. The
`-strong` rule exists specifically so that the CTA stays AA-contrast
in dark mode — replacing it with raw `emerald-600` may regress contrast
without anyone noticing.

**Recommendation.**
Replace with the semantic tokens used elsewhere in Finyk:

```tsx
<div className="rounded-2xl border border-finyk/25 bg-finyk/10 …">
  <div className="… rounded-2xl bg-finyk/15 …" aria-hidden>💡</div>
  …
  <button className="… bg-finyk-strong text-white hover:bg-finyk
    dark:bg-finyk dark:hover:bg-finyk-strong …">
    Поставити бюджет
  </button>
```

For the bar classes returned by computed strings
(`useOverviewData.ts:350`, `MonthPulseCard` `forecastBarClass`,
`LimitBudgetCard`, `MonthlyPlanCard`): swap `"bg-emerald-500"` for
`"bg-success"` (or `"bg-finyk"` if accent containment is preferred).

---

### F4 — `pluralizeOps` returns wrong Ukrainian noun forms [severity: high] [perspective: i18n]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/useTransactionSelection.ts`
**Lines:** L14–L21

**Description.**

```ts
function pluralizeOps(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "операції";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return "операцій";
  return "операцій";
}
```

Used in toast templates:

- `Категорію змінено для ${n} ${pluralizeOps(n)}`
- `Приховано ${n} ${pluralizeOps(n)}`
- `Виключено зі статистики: ${n} ${pluralizeOps(n)}`

Ukrainian declensions for "операція":

| n              | nom.   | acc. (Приховано N _…_) | gen.pl (для N _…_) |
| -------------- | ------ | ---------------------- | ------------------ |
| 1, 21, 31…     | операція | операцію               | операції           |
| 2/3/4, 22…24…  | операції | операції               | операцій           |
| 5–20, 25–30…   | операцій | операцій               | операцій           |

The function returns `операції` for n = 1 ("Приховано 1 операції" —
should be `операцію`) and `операцій` for n = 2/3/4 ("Приховано 3
операцій" — should be `операції`). Branches 2 and 3 collapse into the
same value, hiding the bug.

**Why it matters.**
Toasts are user-facing copy in the most-used screen. Wrong noun forms
read as machine-translated and undermine trust in the rest of the
Ukrainian copy. Since the case differs by toast template (`для N` →
gen, `Приховано N` → acc), the function must accept context.

**Recommendation.**
Promote to `@shared/lib/pluralize` and accept a `case` argument:

```ts
type Case = "nom" | "acc" | "gen";
const forms: Record<Case, [string, string, string]> = {
  nom: ["операція", "операції", "операцій"],
  acc: ["операцію", "операції", "операцій"],
  gen: ["операції", "операцій", "операцій"],
};
function pluralizeOps(n: number, c: Case = "acc"): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const [one, few, many] = forms[c];
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 >= 14)) return few;
  return many;
}
```

Call sites:

- `Категорію змінено для ${n} ${pluralizeOps(n, "gen")}`
- `Приховано ${n} ${pluralizeOps(n, "acc")}`
- `Виключено зі статистики: ${n} ${pluralizeOps(n, "acc")}`

Cover with a unit test for n ∈ {0, 1, 2, 5, 11, 14, 21, 24, 25}.

---

### F5 — Analytics month-nav buttons below 44×44 touch target [severity: high] [perspective: a11y]

**Page:** `analytics`
**File:** `apps/web/src/modules/finyk/pages/Analytics.tsx`
**Lines:** L116–L137

**Description.**
Both prev/next month buttons use `w-9 h-9` (36 × 36 px) without a
`data-compact` opt-out marker:

```tsx
<button
  type="button"
  onClick={() => go(-1)}
  className="w-9 h-9 rounded-xl border border-line flex items-center
    justify-center text-muted hover:text-text hover:bg-panelHi
    transition-colors"
  aria-label="Попередній місяць"
>‹</button>
…
<button
  type="button"
  onClick={() => go(1)}
  disabled={isCurrentMonth}
  className="w-9 h-9 …"
  aria-label="Наступний місяць"
>›</button>
```

**Why it matters.**
Apple HIG and WCAG 2.5.5 mandate ≥44 × 44 px hit targets on coarse
pointers. Analytics is a touch-first surface (mobile users navigate
months by tapping). The repo contract (root `AGENTS.md § Touch
targets`) is the global safety-net is opt-out via `data-compact` for
heatmap cells — these are primary nav controls and should NOT opt
out.

**Recommendation.**
Either use the shared `Button` primitive (`size="iconOnly"` auto-applies
`min-h-[44px] min-w-[44px]`), or expand to `w-11 h-11`:

```tsx
<button
  className="w-11 h-11 rounded-xl border border-line …"
  aria-label="Попередній місяць"
>‹</button>
```

---

### F6 — `now = new Date()` at module-load freezes "current month" detection [severity: high] [perspective: bug]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/useTransactionFilters.ts`
**Lines:** L23, L91–L92, L138–L142

**Description.**

```ts
const now = new Date(); // module-level, evaluated once at import
…
const isCurrentMonth =
  selMonth.year === now.getFullYear() && selMonth.month === now.getMonth();
…
const monthLabel = new Date(selMonth.year, selMonth.month, 1)
  .toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
```

`now` is captured exactly once — when the module first loads. The same
pattern repeats in `Analytics.tsx:184` (page top-level `now`), and
`useOverviewData.ts:99` (a fresh `new Date()` per render but the day
boundary `todayStart` is rebuilt every render — see F16).

`todayDayKey` in `useTransactionFilters.ts:262–265` is wrapped in
`useMemo(() => dayKeyFromTx(Math.floor(Date.now() / 1000)), [])`, so the
"today key" used by day-group collapse is also frozen at first render.

**Why it matters.**
Sergeant is a PWA — users keep the tab open across days. After
midnight:

- `isCurrentMonth` returns `true` for the now-previous month (because
  `now.getMonth()` is the captured month). `goMonth` then refuses to
  `fetchMonth` for the actual current month because the gate
  `!(y === now.getFullYear() && m === now.getMonth())` evaluates false.
- `todayDayKey` keeps the previous day's key — the day-header row
  marked "Сьогодні" stays on yesterday.

The smaller `Analytics.tsx:184` capture has the same problem for the
"current month" comparison-row.

**Recommendation.**
Either compute `now` lazily inside the relevant `useMemo`/handler, or
broadcast a "day-changed" tick. Minimal fix:

```ts
const isCurrentMonth = (() => {
  const today = new Date();
  return (
    selMonth.year === today.getFullYear() &&
    selMonth.month === today.getMonth()
  );
})();
```

For `todayDayKey`, use a `useEffect` + `setInterval` to refresh at next
midnight, or recompute on every render (cheap — it's a string format).

---

### F7 — `Date.now().toString()` IDs collide on rapid double-tap [severity: high] [perspective: bug]

**Page:** `assets`
**File:** `apps/web/src/modules/finyk/pages/AssetsForm.tsx`
**Lines:** L68, L152, L248, L364

**Description.**
Four "create new" handlers use `Date.now().toString()` as primary key:

```ts
// Subscription
id: Date.now().toString(),
// Receivable
id: Date.now().toString(),
// Asset
id: Date.now().toString(),
// Debt
id: Date.now().toString(),
```

`Budgets.tsx:277` already uses `crypto.randomUUID()` for the same kind
of "create" path, so the API is available.

**Why it matters.**
`Date.now()` resolution is 1 ms. Two clicks within the same ms (rapid
double-tap on iOS, optimistic-create + sync-back, replay after
backgrounding) collide. Subscriptions, receivables, debts, and manual
assets all have downstream `id`-keyed state (`linkedTxIds`,
`hiddenAccounts`, undo-toasts, dual-write parity). A collision can
silently merge two records or drop the second.

**Recommendation.**

```ts
id: crypto.randomUUID(),
```

across all four call sites. Add a unit test that creates two records in
the same synchronous tick and asserts unique IDs.

---

### F8 — Networth chart silently never captures break-even state [severity: high] [perspective: bug]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/useOverviewData.ts`
**Lines:** L163–L174

**Description.**

```ts
useEffect(() => {
  if (loadingTx && realTx.length === 0) return;
  if (networth !== 0 && accounts.length > 0) {
    saveNetworthSnapshot(networth);
  }
}, [networth, loadingTx, realTx.length, accounts.length, saveNetworthSnapshot]);
```

The `networth !== 0` guard skips snapshot writing when assets exactly
equal liabilities. There is no UX reason to treat 0 as "unset" —
`accounts.length > 0` is the real "data available" gate.

**Why it matters.**
Users whose net worth lands on 0 (a real scenario after paying off a
loan exactly equal to current cash) silently never get a data point.
The `NetworthSection` graph then renders the prior day's curve as if
nothing moved. Also, if a user starts the app with `0` cash and `0`
debt (post-onboarding empty state) — same gap.

**Recommendation.**

```ts
if (accounts.length > 0) {
  saveNetworthSnapshot(networth);
}
```

The downstream chart already handles `[…, 0, …]` data points.

---

### F9 — `parseLocalDate` returns `Invalid Date` silently [severity: medium] [perspective: bug]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/useOverviewData.ts`
**Lines:** L32–L35

**Description.**

```ts
const parseLocalDate = (isoDate: string | null | undefined): Date => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y!, (m || 1) - 1, d || 1);
};
```

For `isoDate === ""` (or `null`/`undefined`), `[y, m, d] = [NaN]`
(`.split("-")` of `""` yields `[""]`, then `.map(Number)` → `[NaN]`).
`y!` asserts non-null but is `NaN`. `new Date(NaN, 0, 1)` returns an
Invalid Date. Downstream:

```ts
const daysLeft = Math.ceil(
  (parseLocalDate(d.dueDate).getTime() - todayStart.getTime()) / 86400000,
);
```

`Invalid Date.getTime()` returns `NaN`; `daysLeft` becomes `NaN`. The
flow-row hint renders `через NaN дн`. Filters
(`x.daysLeft >= 0 && x.daysLeft <= 10`) silently drop the row.

Also, `y!` is the lazy-access anti-pattern explicitly called out as
forbidden in the agent instructions.

**Why it matters.**
Manual debts and receivables can carry empty `dueDate` (no
`required` validation on the form — see F19). They then disappear from
"Найближчі платежі" without explanation; user assumes their data is
lost.

**Recommendation.**

```ts
const parseLocalDate = (isoDate: string | null | undefined): Date | null => {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
};
```

Update call sites to handle `null` (e.g., emit a "Без дати" hint instead
of `через NaN дн`).

---

### F10 — `MonthPulseCard` day-pluralizer falls back to abbreviation [severity: medium] [perspective: i18n]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/MonthPulseCard.tsx`
**Lines:** L153–L154

**Description.**

```tsx
За {daysPassed}{" "}
{daysPassed === 1 ? "день" : daysPassed < 5 ? "дні" : "дн."} · факт …
```

Renders:

- 21 → `21 дн.` (should be `21 день`)
- 22, 23, 24 → `22/23/24 дн.` (should be `22/23/24 дні`)
- 31 → `31 дн.` (should be `31 день`)

The abbreviation `дн.` is a workaround that reads as machine-shortened
copy alongside `день`/`дні` on the same surface.

**Why it matters.**
Same trust signal as F4 — the rest of the copy is in carefully tuned
Ukrainian; the abbreviation breaks the visual register.

**Recommendation.**
Use the proper plural rule (and ideally the same `@shared/lib/pluralize`
helper as F4):

```ts
function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 >= 14)) return "дні";
  return "днів";
}
```

---

### F11 — Filter-pill emoji split is fragile and bypasses `noUncheckedIndexedAccess` [severity: medium] [perspective: bug]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/TransactionFilters.tsx`
**Lines:** L28–L36

**Description.**

```ts
...catSpends.map((c) => ({
  id: c.id,
  label: c.label.split(" ")[0] + " " + c.label.slice(3),
})),
```

Assumptions:

1. Every label starts with a single-codepoint emoji followed by a
   space.
2. The emoji is exactly 2 chars long (so `slice(3)` skips emoji + space).

Both break for multi-codepoint emoji:

- 🇺🇦 (flag): `[…].length === 8`, `.split(" ")[0]` keeps the flag
  intact but `.slice(3)` chops mid-codepoint and returns a corrupted
  string with the flag's second regional-indicator + the rest.
- 👨‍👩‍👧 (ZWJ family): same — `slice(3)` mid-ZWJ-sequence.
- Labels without a leading emoji (e.g., `"Кафе"` from a custom
  category): `.split(" ")[0]` → `"Кафе"`, `.slice(3)` → `"е"`,
  rendered as `"Кафе е"`.

Hard Rule #19 (`noUncheckedIndexedAccess: true`): `c.label.split(" ")[0]`
should be typed `string | undefined`. The implicit `string` here only
works because string concatenation with `undefined` produces the
runtime string `"undefined"` — bug-hiding, not type-safe.

**Why it matters.**
The label renders directly in the user-facing filter chip strip.
Multi-codepoint emoji are common (country flags, family ZWJ
sequences). A custom category with no emoji renders junk.

**Recommendation.**
Drop the manual split and pass `emoji` + `name` as separate fields from
`catSpends`:

```ts
catSpends.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))
```

Then in the chip:

```tsx
<button …>{c.emoji} {c.name}</button>
```

If the emoji split must stay, use `[...c.label][0]` (Unicode iterator)
and `c.label.replace(/^\S+\s/, "")` instead.

---

### F12 — Filter pills opt out of 44×44 touch target via `data-compact` [severity: medium] [perspective: a11y]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/TransactionFilters.tsx`
**Lines:** L39–L58

**Description.**

```tsx
<button
  key={f.id}
  data-compact
  onClick={() => onChangeFilter(f.id)}
  aria-pressed={filter === f.id}
  className={cn(
    "shrink-0 inline-flex items-center h-7 px-3 …",
    …
  )}
>
```

`data-compact` opts the button out of the global `≥44 px` safety net.
The pill is `h-7` (28 px). Per `apps/web/AGENTS.md § Touch targets`,
`data-compact` is reserved for "intentionally small cells like
heatmaps". A filter chip is a primary navigation control — opting it
out is a misuse of the escape hatch.

**Why it matters.**
Mobile users tap these pills often; 28 px is below the documented
threshold and breaks WCAG 2.5.5. The opt-out also disables the
auto-padding that would have made the target effectively larger.

**Recommendation.**
Drop `data-compact` and bump to `h-9 sm:h-7` if the dense look on
larger viewports is required, OR keep `h-7` visual but wrap the click
area to ≥44 px (the global safety-net does this automatically without
`data-compact`).

---

### F13 — Filter pill list lacks tablist semantics [severity: medium] [perspective: a11y]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/TransactionFilters.tsx`
**Lines:** L40–L58

**Description.**
The pill strip uses `aria-pressed` to indicate the active filter, but
exposes neither `role="tablist"` on the container nor `role="tab"` on
the buttons. Screen-reader users hear "toggle pressed" without
understanding that these pills form a single-selection group.

**Why it matters.**
Keyboard navigation (`Tab` cycling) and SR semantics are key for a11y
WCAG 4.1.2. The current shape works but degrades meaning — users with
assistive tech don't get the "tabbed filter group" affordance.

**Recommendation.**
Either:

- Adopt `role="tablist"` + `role="tab"` + `aria-selected` on buttons +
  `tabindex` management (arrow keys cycle); OR
- Use `role="radiogroup"` + `role="radio"` + `aria-checked` (single
  selection) if Tab behaviour is preferred.

The repo's `Tabs` primitive (if any) is the right place to factor
this; if none exists, keep the change scoped to this file.

---

### F14 — `min-h-[36px]` arbitrary on "Усі →" link [severity: medium] [perspective: a11y]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/PlannedFlowsCard.tsx`
**Lines:** L28–L32

**Description.**

```tsx
<button
  onClick={() => onNavigate("budgets")}
  className="text-xs text-primary/80 hover:text-primary
    transition-colors py-2 px-1 min-h-[36px]"
>
  Усі →
</button>
```

Same class of touch-target violation as F5/F12 — `min-h-[36px]` is
explicitly below 44 px. The arbitrary value bypasses the `Button`
primitive that would have enforced the target. Also has no
`focus-visible:` indicator (only `hover:`), so keyboard focus is
invisible.

**Why it matters.**
Hub-to-budget navigation is a real call-to-action; mobile users tap
it. Keyboard users can't see focus. Hard Rule #14 (`focus-visible:`
not `focus:`) is technically satisfied vacuously (no `focus:` either),
but the visual focus indicator is missing.

**Recommendation.**

```tsx
<Button
  variant="ghost"
  size="xs"
  onClick={() => onNavigate("budgets")}
>
  Усі →
</Button>
```

`Button` auto-applies `min-h-[44px]` and `focus-visible:ring-…` for
`xs`/`sm`. Or, if a plain link is preferred, add `min-h-[44px]
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk/50`.

---

### F15 — `Budget` is not a discriminated union; goal fields read via `unknown` casts [severity: medium] [perspective: ts]

**Page:** `budgets`
**File:** `apps/web/src/modules/finyk/pages/budgets/BudgetsGoalsSection.tsx`
**Lines:** L110–L130

**Description.**

```tsx
const targetAmount = Number(
  (b as { targetAmount?: unknown }).targetAmount ?? 0,
);
const savedAmount = Number(
  (b as { savedAmount?: unknown }).savedAmount ?? 0,
);
const targetDate = (b as { targetDate?: unknown }).targetDate;
…
const cardBudget = {
  …
  emoji: (b as { emoji?: unknown }).emoji as string | undefined,
  name: (b as { name?: unknown }).name as string | undefined,
  …
};
```

The inline comment acknowledges: `// Goal-specific fields live on the
[extra: string]: unknown index of Budget`. The shape is a union by
runtime tag (`type: "limit" | "goal"`) but not by TypeScript — limits
and goals share one struct with optional fields surfacing on the index
signature.

**Why it matters.**
- Every read site duplicates the cast logic (here, in
  `BudgetsLimitsSection.tsx`, in `useProactiveAdvice`, in
  `MonthlyPlanCard`).
- The compiler can't catch a missing field on the `goal` branch — a
  rename to `targetAmt` would silently default to 0.
- TS strictness lands as "lazy access" (string-keyed `unknown`),
  exactly the anti-pattern flagged in the agent instructions.

**Recommendation.**
Promote `Budget` in `@sergeant/finyk-domain/domain/types` to a
discriminated union:

```ts
interface LimitBudget {
  id: string;
  type: "limit";
  categoryId: string;
  limit: number;
}

interface GoalBudget {
  id: string;
  type: "goal";
  name: string;
  emoji?: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string;
}

export type Budget = LimitBudget | GoalBudget;
```

Replace `(b as { … }).x` reads with `b.type === "goal" ? b.targetAmount : 0`.
This is a multi-file refactor — track as a separate code PR.

---

### F16 — Per-render `new Date()` + `todayStart` cause unnecessary cascading recomputes [severity: medium] [perspective: perf]

**Page:** `overview`
**File:** `apps/web/src/modules/finyk/pages/overview/useOverviewData.ts`
**Lines:** L99, L214–L267

**Description.**

```ts
const now = new Date();                                  // L99 — every render
…
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // L214
…
const subscriptionFlows = useMemo(/* … */, [..., todayStart.getTime()]); // L240
const debtOutFlows = useMemo(/* … */, [..., todayStart.getTime()]);
const debtInFlows = useMemo(/* … */, [..., todayStart.getTime()]);
```

`now` and `todayStart` are fresh instances on every render. The
`useMemo` deps depend on `todayStart.getTime()` — a primitive that is
stable within the same calendar day, but the eslint-disable comments
on those memos hint that the contributor knew about the structural
issue and worked around it.

**Why it matters.**
On every `useOverviewData()` call (which fires on any storage / mono
event), three fresh `Date` objects, four `Date.getTime()` calls, and a
day-stability dep recompute. Cheap individually but happens often —
and the structural smell will outlast the eslint-disable comments.

**Recommendation.**

```ts
const todayStart = useMemo(() => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}, []); // refresh at midnight via a separate "day-tick" hook
```

Pair with a `useDayTick` hook that returns a re-render trigger at the
next midnight if the PWA crosses day boundaries (also addresses F6's
stale-`now` problem from a different angle).

---

### F17 — Non-UAH manual assets silently dropped from networth [severity: medium] [perspective: bug]

**Page:** `overview`, `assets`
**File:** `apps/web/src/modules/finyk/pages/overview/useOverviewData.ts`
**Lines:** L152–L158

**Description.**

```ts
const manualAssetTotal = useMemo(
  () =>
    (manualAssets || [])
      .filter((a) => a.currency === "UAH")
      .reduce((s: number, a) => s + Number(a.amount), 0),
  [manualAssets],
);
```

`AssetsForm.tsx:226–237` lets users create assets in UAH/USD/EUR/BTC.
Non-UAH assets pass form validation but are filtered out here without
any UI signal.

A tooltip on `MonthPulseCard.tsx:74–86` mentions "Інші валюти рахунків
у загальному балансі не конвертуються автоматично" — but the
disclaimer is buried in a tooltip on a different card.

**Why it matters.**
A user with a USD/EUR/BTC holding sees the asset listed in the Active
table but its value never enters net worth, savings rate, or planning.
This is the kind of silent data-loss footgun that erodes trust.

**Recommendation.**
Either:

- Show an explicit "Не включено в баланс (USD/EUR/BTC)" badge on
  non-UAH asset rows.
- Or block creation of non-UAH assets until conversion exists.
- Or implement live-rate conversion (longer-horizon).

At minimum, lift the disclaimer out of the `MonthPulseCard` tooltip
onto the `AssetsForm` and the Active card itself.

---

### F18 — `useTransactionFilters` storage-event listener doesn't diff state [severity: medium] [perspective: bug]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/useTransactionFilters.ts`
**Lines:** L266–L290

**Description.**

```ts
useEffect(() => {
  function onStorage(e: StorageEvent) {
    if (e.key !== DAY_COLLAPSE_KEY) return;
    setDayOverrides(readDayCollapse());
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}, []);
```

Concerns:

- The handler always calls `setDayOverrides` — even if the new value
  is identical to the prior state. React bails out on `Object.is`
  equality, but the freshly-read object reference is always new, so
  the bail-out never kicks in.
- The listener only fires on cross-tab writes (the `storage` event by
  spec is not fired in the writing tab). Same-tab updates rely on the
  imperative `setDayOverrides` after `writeDayCollapse` in `toggleDay`.
  This contract is undocumented; a future refactor (e.g., MMKV, or a
  storage abstraction that doesn't dispatch `storage` events) silently
  breaks cross-tab sync.

**Why it matters.**
Extra re-renders on every cross-tab write (minor perf), plus a hidden
contract risk for the storage layer migration.

**Recommendation.**
Either:

- Use the existing `@shared/storage` wrapper's subscription API (if
  one exists) so the contract survives the abstraction.
- Or add a shallow-equality check before `setDayOverrides`:

```ts
setDayOverrides((prev) => {
  const next = readDayCollapse();
  return shallowEqual(prev, next) ? prev : next;
});
```

---

### F19 — Asset/Debt/Receivable forms have no required-field validation [severity: medium] [perspective: ux]

**Page:** `assets`
**File:** `apps/web/src/modules/finyk/pages/AssetsForm.tsx`
**Lines:** L60–L92 (Subscription), L142–L166 (Receivable), L238–L260 (Asset), L354–L378 (Debt)

**Description.**

Four create forms guard with `if (a.name && a.amount)` checks but:

- `placeholder` is used as the only label (e.g., `"Назва"`,
  `"Сума ₴"`). No `<label htmlFor>` or `aria-label`. WCAG 1.3.1 /
  3.3.2 — once the user focuses the field, the placeholder
  disappears; a screen reader announces the input as unlabelled.
- `dueDate` for Receivable/Debt is optional; empty `dueDate` is
  persisted as `""` and later feeds `parseLocalDate("")` (F9), which
  silently turns the row into "через NaN дн".
- The currency `<select>` (Asset) uses `<option>UAH</option>` without
  explicit `value` — if the visible text ever localizes
  (`"грн"`), the stored value silently becomes the localized
  string and breaks downstream filters (F17 already filters on
  `a.currency === "UAH"`).
- No `aria-invalid` / inline error copy when the guard fails — the
  user clicks "Додати", nothing happens, and there's no indication of
  what's wrong.

**Why it matters.**
For a finance app, "I clicked save and nothing happened" is the
worst UX outcome — users assume data is persisted and walk away.

**Recommendation.**

- Add `<label>` (or `aria-label` on the `Input`).
- Use `<option value="UAH">UAH (₴)</option>` form for the currency
  picker.
- On submit guard fail, set `aria-invalid` + render an inline error
  string ("Вкажи назву та суму").
- Promote to `useApiForm` + zod schema like `AddBudgetForm` already
  does in `Budgets.tsx:405`.

---

### F20 — Critical page-level paths have no tests [severity: medium] [perspective: test]

**Page:** `overview`, `transactions`, `budgets`, `analytics`, `assets`
**File:** Multiple
**Lines:** —

**Description.**
Per `find apps/web/src/modules/finyk -name "*.test.*"`: 28 test files
across 144 module files (~19 % by count). The following user-facing
shells and key hooks are uncovered:

- `pages/Overview.tsx`, `pages/Analytics.tsx`, `pages/Assets.tsx`,
  `pages/budgets/Budgets.tsx`, `pages/transactions/Transactions.tsx`
- `pages/overview/useOverviewData.ts` (networth aggregation, planned
  flows, first-insight gate)
- `pages/transactions/useTransactionFilters.ts` (filter
  matrix, day grouping, month-cache)
- `pages/transactions/useTransactionSelection.ts` (batch
  category/hide/exclude with undo, `pluralizeOps`)
- `pages/budgets/useProactiveAdvice.ts` (AI advice fetch + LS seed)
- `pages/AssetsForm.tsx` (4 create forms)

Existing tests focus on tabular logic (`transactionsLib.test.ts`,
`useAssetsState.test.ts`, `parity.test.ts`) and not on the wiring layer
where most of the bugs in this audit live.

**Why it matters.**
Findings F4 (plural), F6 (stale `now`), F7 (`Date.now` collisions),
F8 (networth guard), F9 (`parseLocalDate`), F11 (label split), F17
(non-UAH drop), F18 (storage listener) all would have been caught by
unit tests on the hook layer.

**Recommendation.**
Add tests for the highest-risk hook (`useTransactionFilters` —
month-nav, filter matrix, day-collapse) and the smallest pure
utilities (`pluralizeOps`, `parseLocalDate`, `getNextBillingDate`).
This is a separate code PR; the audit only lists the gap.

---

### F21 — Highlight-scroll effect chain is StrictMode-fragile [severity: medium] [perspective: bug]

**Page:** `budgets`
**File:** `apps/web/src/modules/finyk/pages/budgets/Budgets.tsx`
**Lines:** L225–L246

**Description.**
Three sequential effects orchestrate a deep-link highlight:

```tsx
// 1. Open the limits section when a focusLimitCategoryId arrives.
useEffect(() => {
  if (!focusLimitCategoryId) return;
  if (!limitsOpen) setLimitsOpen(true);
}, [focusLimitCategoryId, limitsOpen, setLimitsOpen]);

// 2. Scroll the card into view after the section opens.
useEffect(() => {
  if (!focusLimitCategoryId) return;
  if (!limitsOpen) return;
  const raf = requestAnimationFrame(() => {
    const node = limitCardRefs.current.get(focusLimitCategoryId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedCategoryId(focusLimitCategoryId);
    }
  });
  return () => cancelAnimationFrame(raf);
}, [focusLimitCategoryId, limitsOpen]);

// 3. Clear the highlight after 3 s.
useEffect(() => {
  if (!highlightedCategoryId) return;
  const t = setTimeout(() => setHighlightedCategoryId(null), 3000);
  return () => clearTimeout(t);
}, [highlightedCategoryId]);
```

Concerns:

- Under React StrictMode (dev), each effect runs twice on mount.
  Effect 2's `requestAnimationFrame` callback may queue twice and call
  `scrollIntoView` twice on rapid double-mount (visually fine, but
  smooth-scroll cancels and restarts).
- Effect 3's 3 s timeout depends on a single `highlightedCategoryId` —
  if the deep-link triggers a second highlight before the first
  cleared, the timeout cleanup races. The user may see the highlight
  vanish 3 s after the *first* highlight was set, not the most recent.
- No `aria-live` region announcing "scrolled to Кафе"; keyboard users
  get no audible indication of the navigation.
- `focusLimitCategoryId` is never reset by this component, so an
  external store keeps that prop alive — re-renders of `Budgets`
  (e.g., a state-store update) may re-trigger the entire chain.

**Why it matters.**
Deep-links from Hub-insight cards are advertised in `apps/web/AGENTS.md`
as a coordinated cross-module feature; the highlight is the user's
confirmation that the navigation succeeded. Edge cases here erode that
signal.

**Recommendation.**
Merge into one effect with a single ref-based "in-flight" guard:

```tsx
const inflightRef = useRef<string | null>(null);
useEffect(() => {
  if (!focusLimitCategoryId) return;
  if (inflightRef.current === focusLimitCategoryId) return;
  inflightRef.current = focusLimitCategoryId;
  setLimitsOpen(true);
  const raf = requestAnimationFrame(() => {
    limitCardRefs.current
      .get(focusLimitCategoryId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedCategoryId(focusLimitCategoryId);
  });
  const t = setTimeout(() => {
    setHighlightedCategoryId(null);
    inflightRef.current = null;
    onClearFocus?.();
  }, 3000);
  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(t);
  };
}, [focusLimitCategoryId, setLimitsOpen]);
```

Add an `aria-live="polite"` region: "Прокручено до категорії N".
Have the parent clear `focusLimitCategoryId` once consumed.

---

### F22 — `useTransactionSelection.handlersRef` rebuilt on every render [severity: low] [perspective: perf]

**Page:** `transactions`
**File:** `apps/web/src/modules/finyk/pages/transactions/useTransactionSelection.ts`
**Lines:** L90–L107

**Description.**

```ts
const handlersRef = useRef({
  hideTx, overrideCategory, setSplitTx,
  removeManualExpense, addManualExpense, onEditManualExpense, toast,
});
handlersRef.current = {
  hideTx, overrideCategory, setSplitTx,
  removeManualExpense, addManualExpense, onEditManualExpense, toast,
};
```

The ref `current` is reassigned to a new object on every render —
even when none of the handlers changed. The intent ("stable wrapper so
memoized `<TxRow>` doesn't re-render") is met for the stable callback
identity, but the allocated object is unconditional work.

**Why it matters.**
Tiny perf cost per render. Real-world: the parent re-renders often
(every storage write, every mono fetch) and this fires for every one.
On the transactions list (the most-rendered surface), it's measurable
in scrollback.

**Recommendation.**
Use `useEffect` to sync on changes (or just use the latest-ref pattern
from `@shared/hooks`):

```ts
const handlersRef = useRef(handlers);
useEffect(() => {
  handlersRef.current = handlers;
});
```

---

### F23 — `SubscriptionForm`/`AssetForm`/etc. use `Input` without `<label>` [severity: low] [perspective: a11y]

**Page:** `assets`
**File:** `apps/web/src/modules/finyk/pages/AssetsForm.tsx`
**Lines:** various — see F19

**Description.**
Already covered as part of F19; tracked separately because it's a
broad pattern (every create form on the Assets page uses
`placeholder`-as-label). Listed for low severity because the global
fix is the same as F19's recommendation.

**Why it matters.**
SR users hear "edit text" with no field name. Cognitive-load users
lose the label on focus.

**Recommendation.**
See F19.

---

### F24 — `Date.now().toString()` ID style is inconsistent with `crypto.randomUUID()` [severity: low] [perspective: rule]

**Page:** `assets`
**File:** `apps/web/src/modules/finyk/pages/AssetsForm.tsx`
**Lines:** L68, L152, L248, L364 (covered by F7)

**Description.**
Already a high-severity bug in F7. Listed here as a low-severity
"code quality / convention" note because the rest of the module
already standardized on `crypto.randomUUID()` (`Budgets.tsx:277`,
`useFinykStorageMutations.ts`). The mixed style adds review burden
each time a new "create" handler is written.

**Why it matters.**
Convention drift compounds. New contributors copy whichever pattern is
nearest.

**Recommendation.**
Same as F7. Optionally extract a `createId()` helper in
`@shared/lib/ids` to make the convention explicit at the type level.

---

### F25 — No lifecycle JSDoc on page-shell files [severity: low] [perspective: lifecycle]

**Page:** `overview`, `transactions`, `budgets`, `analytics`, `assets`
**File:** All page shells
**Lines:** L1

**Description.**
Hard Rule #10 (`docs/governance/rules/10-lifecycle-markers.md`) accepts
"no tag = Active" as the default for source files (JSDoc tags
`@scaffolded`/`@experimental`/`@deprecated` only when non-Active). The
five page-shell files have no JSDoc lifecycle tag, which per the rule
is fine.

However, **`apps/web/src/modules/finyk/index.ts:1–18`** has a
`@scaffolded` block with `@nextStep` pointing to "Have the App router
… import `FinykApp` from `@finyk`". As of this audit, `FinykApp` is
still imported from `./FinykApp` in `apps/web/src/core/app/`
(`ActiveModuleView.tsx`'s `lazyDefault(() =>
import("../../modules/finyk/FinykApp"))` and similar). The scaffolded
marker is overdue — once the router actually imports from `@finyk`
the marker should be dropped.

**Why it matters.**
Stale `@scaffolded` markers desensitize the team to the marker.
`pnpm dead-code:files` honours `@scaffolded` to suppress zero-importer
warnings; if the marker outlives its purpose, knip warnings get
suppressed for surface that *is* importable.

**Recommendation.**
Either:

- Land a small PR that migrates the router/registry to
  `import { FinykApp } from "@finyk"` and drops the `@scaffolded`
  marker in the same PR.
- Or update the `@nextStep` with a fresher integration plan if the
  consumer migration is deferred.

---

## Per-page coverage matrix

X = audited, no findings recorded (this scope). Numeric = number of
findings landing on this perspective for this page. The matrix counts
findings by the *page* listed in the finding header.

| Page         | sec | a11y | perf | ux | bug | rule | ts | tw | i18n | test | ai | lifecycle |
| ------------ | --- | ---- | ---- | -- | --- | ---- | -- | -- | ---- | ---- | -- | --------- |
| overview     |  X  |  1   |  1   | 1  |  3  |  X   | X  | 2  |  1   |  X   | X  |    X      |
| transactions |  X  |  2   |  1   | X  |  2  |  X   | X  | X  |  1   |  X   | X  |    X      |
| budgets      |  X  |  X   |  X   | X  |  1  |  X   | 1  | X  |  X   |  X   | X  |    X      |
| analytics    |  X  |  1   |  X   | X  |  X  |  X   | X  | X  |  X   |  X   | X  |    X      |
| assets       |  X  |  1   |  X   | 1  |  1  |  1   | X  | X  |  X   |  X   | X  |    X      |
| all (test)   |  -  |  -   |  -   | -  |  -  |  -   | -  | -  |  -   |  1   | -  |    1      |

Legend: `sec` = security, `a11y` = accessibility, `perf` = performance,
`ux` = UX states, `bug` = bug hunting, `rule` = code-quality / hard
rules, `ts` = TypeScript strictness, `tw` = Tailwind / design tokens,
`i18n` = internationalization, `test` = testing coverage, `ai` = AI
markers, `lifecycle` = lifecycle markers.

### Perspectives audited with no findings

- **Security:** No XSS sinks (`dangerouslySetInnerHTML`, `innerHTML`,
  `eval`) detected anywhere in scope. No `window.location` writes from
  user input. No `console.log` debug residue. Hard Rule #20 (OpenClaw
  PATs in prod) not applicable to client-only Finyk subtree. Hard
  Rule #21 (Pino redaction) not applicable to client code. `useAuth`
  is consumed from `App.tsx` provider tree before `<FinykApp />`
  mounts — no auth bypass.
- **AI markers:** Found one `@scaffolded` block in
  `apps/web/src/modules/finyk/index.ts` with `@nextStep`/`@owner` —
  syntax matches the rule (`AI markers § JSDoc lifecycle tags`).
  No `AI-LEGACY` without expiry, no `AI-GENERATED` without generator.
- **Code Quality / Hard Rules (#1 bigint→number, #2 RQ keys, #5
  conventional commits, #18 max-lines):** RQ keys are routed through
  `finykKeys` / `proactiveAdviceQueryKey` factories (see
  `pages/budgets/budgetsLib.ts:26`, `useMonoTransactions.ts`,
  `useMonobankWebhook.ts`). No inline `queryKey: [...]` in scope.
  `FinykApp.tsx` is 640 raw LOC but ~537 effective (skipBlankLines +
  skipComments) — under the 600 max-lines threshold (cross-referenced
  in `docs/initiatives/0013-module-decomposition-round-2.md:33`). No
  `as any` / `any:` / `getattr` outside test fixtures.
- **Focus styles:** Every `focus-` usage in the scope is
  `focus-visible:` (verified via grep) — Hard Rule #14 compliant.

## Methodology / Reproducibility

This audit was performed by static code review only — no
`pnpm install`, no dev server, no test execution. Verification trails:

```bash
# Allowlist of opacity-bypass occurrences in scope (F2):
rg -n "/\[\.[0-9]+\]" apps/web/src/modules/finyk/pages/ \
                     apps/web/src/modules/finyk/components/

# Raw emerald-palette uses (F3):
rg -nE 'bg-(emerald|sky|indigo|violet|fuchsia|pink|rose|orange|amber|lime|teal|cyan)-[0-9]' \
   apps/web/src/modules/finyk/pages/ apps/web/src/modules/finyk/components/

# Module size discipline (Rule #18) cross-check:
find apps/web/src/modules/finyk -type f \( -name "*.ts" -o -name "*.tsx" \) \
   -not -name "*.test.*" -exec wc -l {} + | awk '$1 > 600'

# Inline RQ-key audit (Rule #2):
rg -n "queryKey:\s*\[" apps/web/src/modules/finyk/

# focus: vs focus-visible: in scope (Rule #14):
rg -n '\bfocus:' apps/web/src/modules/finyk/ \
  --glob '*.tsx' --glob '*.ts' | rg -v 'focus-visible'

# Tests present in module:
find apps/web/src/modules/finyk -name "*.test.*"
```

## Suggested follow-up PR plan

Findings group into four independently-mergeable code PRs (this is a
docs-only PR; the code changes below are recommendations, not part of
this PR):

1. **Design-token cleanup** — F2, F3, parts of F1 (`Math.abs` sign in
   HeroCard belongs here too — it touches the same file). Single-file
   diffs across `HeroCard.tsx`, `FirstInsightBanner.tsx`,
   `useOverviewData.ts:350`, `MonthPulseCard.test.tsx:21`,
   `LimitBudgetCard.tsx:120`, `MonthlyPlanCard.tsx:243`,
   `RecurringSuggestions.tsx:26`, `SyncStatusBadge.tsx:44`,
   `ManualExpenseSheet.tsx:404, 555`. Pair with a lint tighten on
   `sergeant-design/valid-tailwind-opacity` to flag decimal arbitrary.

2. **i18n correctness** — F4, F10. Promote `pluralizeOps` to
   `@shared/lib/pluralize` with case-aware API. Tests for n ∈
   {0, 1, 2, 5, 11, 14, 21, 24, 25}. Single short PR.

3. **Date + ID correctness** — F6, F7, F8, F9, F17, F18, F21.
   Introduce a `useDayTick` hook, replace `Date.now().toString()` with
   `crypto.randomUUID()`, fix `parseLocalDate`, drop the `!== 0`
   guard, switch to `useApiForm`+zod in the assets-page forms (also
   addresses F19/F23). Bigger PR — split if needed.

4. **A11y touch-target fix-up** — F5, F12, F13, F14. Use the shared
   `Button` primitive in three spots; add tablist semantics to the
   filter chips. Small PR, easy to review.

Discriminated-union refactor for `Budget` (F15) and the test-coverage
plan (F20) deserve standalone initiative tickets — too broad for the
follow-up PR plan above.
