# Theme 1 — Kyiv timezone discipline

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

## What the rule says

In `apps/web/**`, reading host-local date parts is forbidden:

- `Date.prototype.getFullYear()` / `getMonth()` / `getDate()` / `getDay()`
- `Date.prototype.getHours()` / `getMinutes()` / `getSeconds()`

ESLint rule: `sergeant-design/prefer-kyiv-time` (severity `warn` during
burn-down, will be promoted to `error` once the audit closes).

## Why

`docs/02-engineering/architecture/domain-invariants.md` declares **Europe/Kyiv** as the
single source of truth for time. A device set to Berlin / London / UTC
or a Playwright runner pinned to UTC will silently compute a wrong
`day-key`, streak count, drawer label, or reminder dispatch. The bug is
invisible during dev on a Kyiv-local laptop and reproducible only in
production / on travel — exactly the worst class.

## What to use instead

```ts
import {
  getKyivDateParts,
  getKyivDayKey,
  isSameKyivDay,
} from "@shared/lib/time/kyivTime";

// Need year/month/day/hour/minute parts (e.g. session-title formatting):
const { day, month, hour, minute } = getKyivDateParts(createdAt);

// Need a stable "YYYY-MM-DD" key (streak persistence, deep links):
const dayKey = getKyivDayKey(new Date());

// Need a "same calendar day" check:
const isToday = isSameKyivDay(timestamp);
```

For ISO-week / Monday-start logic, see `kyivMondayISO()` in
`apps/web/src/pages/strategy/StrategyPage.tsx` — that pattern (Intl
formatter with `timeZone: "Europe/Kyiv"`) is the canonical
implementation and the rule treats it as compliant.

## Allowlist

The rule skips:

- **The helper file itself** — `apps/web/src/shared/lib/time/kyivTime.ts`
  has the only legitimate host-getter reads (it builds the parts from
  `Intl.DateTimeFormat`, which returns strings, not getter calls — so
  this allowlist is defensive).
- **Server code** — `apps/server/**` deals in UTC at the boundary;
  Europe/Kyiv conversion happens at presentation time.
- **Tests** — `*.test.{ts,tsx,js}` may use `vi.setSystemTime` plus
  assertions on `Date` getters as part of the test harness.

For one-off legitimate uses outside the allowlist (rare — usually a UI
date-picker holding a Date as state), suppress with a targeted
`// eslint-disable-next-line sergeant-design/prefer-kyiv-time -- WHY`
comment.

## Migration plan

1. **This PR (PR-3 decisions).** Land the rule at `warn`. Existing
   violations surface in CI logs. Doc the migration path here.
2. **Burndown sprints.** Per-module sweeps replace each host-getter
   site with the helper. Audit closure notes track progress.
3. **Severity ramp.** When the warn count hits zero (or all remaining
   sites carry a targeted `eslint-disable` with a WHY), promote to
   `error`. Same flow we used for `prefer-text-style` and
   `no-rounded-lg`.

## Cross-refs

- [`apps/web/src/shared/lib/time/kyivTime.ts`](../../../apps/web/src/shared/lib/time/kyivTime.ts) — helper implementation
- [`docs/02-engineering/architecture/domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md) — Europe/Kyiv invariant
- [`docs/audits/2026-05-13-page-audit-03-hub-chat-search.md`](../../audits/2026-05-13-page-audit-03-hub-chat-search.md) F1/F2/F8 — first cluster of violations that motivated the rule
- [`docs/audits/2026-05-13-page-audit-09-routine-strategy.md`](../../audits/2026-05-13-page-audit-09-routine-strategy.md) F3 — Routine module's `setHours(12,…)` cluster
