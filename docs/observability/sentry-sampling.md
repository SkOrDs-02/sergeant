# Sentry tracesSampler — per-route sampling policy

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-06.
> **Status:** Active
>
> Source of truth for **server** rules: `apps/server/src/sentry.ts`
> (`SENTRY_SAMPLING_RULES`). Source of truth for **web** rules:
> `apps/web/src/core/observability/sentry.ts` (`pickWebTracesSampleRate`).
>
> Refs: `docs/initiatives/stack-pulse-2026-05/pr-12-sentry-traces-sampler.md`
> (H6 — High severity).

## Why dynamic sampling

A static `tracesSampleRate` (the previous baseline `0.1`) creates two
opposing failure modes at the same time:

- **Quota burn on chatty routes.** `/api/health` (Railway/Vercel
  liveness probe, ~1 hit/sec/instance) and `/api/sync/poll` (op-log
  pull, fires per active client) generate the bulk of traces. A flat
  10% rate means tens of thousands of identical health-check traces
  per day per environment with zero actionable signal.
- **Under-sampled critical routes.** `/api/auth/sign-up`,
  `/api/account/recovery` and `/api/admin/*` are low-volume but
  every trace is gold for security incident triage. A 10% rate means
  ~1 trace per 10 sign-ups, so production incidents that touched the
  auth flow are usually invisible.

Dynamic per-route sampling — Sentry's `tracesSampler` callback —
addresses both at once. The rule table is **declarative, ordered
longest-prefix-first**, mirroring `apps/server/src/http/bodySizePolicy.ts`
to keep the audit pattern consistent.

## Server rules (`SENTRY_SAMPLING_RULES`)

| Match prefix                    | Rate    | Reason                                                                                                                                                              |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/internal/openclaw/write/` | `1.0`   | OpenClaw write-tool mutations (ADR-0036 §3). Every founder-approved side-effect captured for audit reconstruction. Low-volume, high blast radius.                   |
| `/api/account/recovery`         | `1.0`   | Security-critical, low volume — capture every trace.                                                                                                                |
| `/api/admin/`                   | `1.0`   | Admin tooling, low volume + high blast radius.                                                                                                                      |
| `/api/auth/`                    | `1.0`   | Login / signup / SSO — security-critical, low-volume.                                                                                                               |
| `/api/photo/analyze`            | `0.5`   | Expensive AI route; half-trace keeps perf signal without 1× cost.                                                                                                   |
| `/api/v2/sync/`                 | `0.01`  | v2 op-log sync (push / pull / stream) fires every ~10 s per active client (Initiative 0003 Phase 5 / ADR-0047). 1 % is enough for latency trend without quota burn. |
| `/api/sync/poll`                | `0.01`  | Chatty heartbeat poll — 1 % is enough for trend.                                                                                                                    |
| `/api/health`                   | `0.001` | Liveness probe — 0.1 % prevents quota burn.                                                                                                                         |
| _(no match — fallback)_         | `0.05`  | Resolved via `defaultSampleRate()`: explicit `SENTRY_TRACES_SAMPLE_RATE` > `SENTRY_SAMPLE_PROFILE` preset > `0.05`.                                                 |

### Order matters

The rule table is consulted top-to-bottom; first prefix match wins.
For example, `/api/account/recovery` is listed **before** any
broader `/api/account` rule could exist — adding such a rule later
in the list would not affect recovery (its earlier rule wins) but
would silently shadow any future `/api/account/...` rules unless
they are placed above the broader one.

The unit test in `apps/server/src/__tests__/sentry-sampler.test.ts`
asserts that no rule is shadowed by an earlier one (failing the
build if a future contributor reorders sloppily).

### Kill-switch

Set `SENTRY_TRACES_SAMPLE_RATE=0` in the deploy environment to
zero out the **fallback** rate. Routes with explicit non-zero rates
(e.g. `/api/auth/`) still emit traces — this is intentional, since
auth visibility is the point we cannot safely lose during a Sentry
quota emergency. To kill all traces, set the rate to `0` and
restart the deploy (the env var is read at SDK init).

### Profile preset (`SENTRY_SAMPLE_PROFILE`)

Fallback rate can also be selected via a named preset — shorthand for
common deploy postures (per-route rules above stay fixed across profiles
because they encode security/observability policy, not quota budget):

| Profile      | Fallback rate | When to use                                                                                           |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| `minimal`    | `0.01`        | Quota emergency / non-critical environments. Only routes with explicit rules emit a meaningful share. |
| `prod`       | `0.05`        | Default deploy baseline. Matches the historical static rate.                                          |
| `aggressive` | `0.2`         | Canary / pre-release deploys — trade quota for visibility while shaking out a new release.            |

Resolution order inside `defaultSampleRate()`:

1. `SENTRY_TRACES_SAMPLE_RATE` — explicit numeric override (kill-switch).
2. `SENTRY_SAMPLE_PROFILE` — one of `minimal` / `prod` / `aggressive`.
3. Default — `0.05`.

Unknown profile names collapse to `prod` so a typo in the env var never
results in surprise quota burn.

The parallel web env var is `VITE_SENTRY_SAMPLE_PROFILE` (must be
`VITE_`-prefixed so Vite inlines it into the client bundle) — same
three values, same resolution rules. Server and web profiles can be
set independently when only one surface needs the change.

## Web rules (`pickWebTracesSampleRate`)

The browser SDK doesn't see request URLs the same way; instead,
spans are tagged with `attributes["sentry.op"]` and, for `pageload` /
`navigation`, with a `name` (the SPA route path). We sample by op,
then — for `navigation` — narrow further by route:

### Per-op rates

| `sentry.op`              | Rate    | Reason                                                                                               |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `pageload`               | `1.0`   | First paint perf is most actionable; fires once per session.                                         |
| `navigation`             | _route_ | See per-route table below. Defaults to `0.1` when route name is missing.                             |
| `http.client`            | `0.01`  | Outbound XHR/fetch spans — noisiest by far.                                                          |
| _(other ops — fallback)_ | `0.05`  | Resolved via `defaultWebSampleRate()`: explicit `VITE_SENTRY_TRACES_SAMPLE_RATE` > profile > `0.05`. |

### Per-route rates (only applied for `op = "navigation"`)

| Route prefix     | Rate   | Reason                                                                                |
| ---------------- | ------ | ------------------------------------------------------------------------------------- |
| `/onboarding`    | `1.0`  | First-run UX is critical, low volume per user — every navigation is signal.           |
| `/fizruk`        | `0.5`  | Module flow we tune actively (Fizruk workouts / streaks).                             |
| `/finyk`         | `0.5`  | Module flow we tune actively (Finyk transactions / budgets).                          |
| `/` (exact)      | `0.05` | Hub overview — most-visited route; low marginal value in re-sampling each navigation. |
| _(other routes)_ | `0.1`  | Default `navigation` rate for un-listed paths (settings, profile, status, etc.).      |

The route table is consulted longest-prefix-first; the bare `/` is matched
exactly so it does not accidentally shadow every other path. The unit
tests in `apps/web/src/core/observability/sentry.test.ts` pin every entry
so future contributors cannot silently change a rate without updating
both this table and the test.

## Expected event budget (rough estimate)

Pre-PR baseline (static 10%):

```
~1 hit/sec/instance × 86400 sec × 0.1 ≈ 8 640 health-probe traces/day/instance
```

Post-PR with the new rules (single instance, illustrative):

| Route                   | Pre   | Post  | Δ           |
| ----------------------- | ----- | ----- | ----------- |
| `/api/health`           | 8 640 | 86    | −99 %       |
| `/api/sync/poll`        | 8 640 | 864   | −90 %       |
| `/api/auth/sign-up`     | 0–10  | 0–100 | +10× signal |
| `/api/account/recovery` | 0–1   | 0–10  | +10× signal |
| _(other)_               | 10 %  | 5 %   | −50 %       |

Net: total Sentry trace volume should drop **30–50 %** while
visibility into auth flows **increases**. Verify against the
Sentry quota-usage dashboard one week post-deploy and adjust
rates if either failure mode reappears (rollback = revert the
PR; tuning = edit the rule table + this doc in the same PR).

## Updating the rules

1. Edit `SENTRY_SAMPLING_RULES` in `apps/server/src/sentry.ts`
   (or `pickWebTracesSampleRate` in
   `apps/web/src/core/observability/sentry.ts`).
2. Update the table in this file (drift is checked by review,
   not lint — Sentry quota is the production check).
3. Add or adjust a unit-test case in
   `apps/server/src/__tests__/sentry-sampler.test.ts`.
4. Land in a single PR. The "table integrity" tests will catch
   shadowing / range / duplicate-match mistakes at CI time.

## Out of scope

- Migrating to OpenTelemetry collector standalone — separate ADR.
- Per-user / per-tenant sampling overrides — would require a
  tenant-aware sampler context which we do not yet expose.
- Replay sampling rates — see `replaysSessionSampleRate` in
  `apps/web/src/core/observability/sentry.ts`; orthogonal axis.
