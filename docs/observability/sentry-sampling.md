# Sentry tracesSampler — per-route sampling policy

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-06.
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

| Match prefix            | Rate    | Reason                                                            |
| ----------------------- | ------- | ----------------------------------------------------------------- |
| `/api/account/recovery` | `1.0`   | Security-critical, low volume — capture every trace.              |
| `/api/admin/`           | `1.0`   | Admin tooling, low volume + high blast radius.                    |
| `/api/auth/`            | `1.0`   | Login / signup / SSO — security-critical, low-volume.             |
| `/api/photo/analyze`    | `0.5`   | Expensive AI route; half-trace keeps perf signal without 1× cost. |
| `/api/sync/poll`        | `0.01`  | Chatty heartbeat poll — 1 % is enough for trend.                  |
| `/api/health`           | `0.001` | Liveness probe — 0.1 % prevents quota burn.                       |
| _(no match — fallback)_ | `0.05`  | Env-tunable via `SENTRY_TRACES_SAMPLE_RATE` (default `0.05`).     |

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

## Web rules (`pickWebTracesSampleRate`)

The browser SDK doesn't see request URLs the same way; instead,
spans are tagged with `attributes["sentry.op"]`. We sample by op:

| `sentry.op`              | Rate   | Reason                                                             |
| ------------------------ | ------ | ------------------------------------------------------------------ |
| `pageload`               | `1.0`  | First paint perf is most actionable; fires once per session.       |
| `navigation`             | `0.1`  | SPA route changes are frequent; 10 % is enough for trend.          |
| `http.client`            | `0.01` | Outbound XHR/fetch spans — noisiest by far.                        |
| _(other ops — fallback)_ | `0.05` | Env-tunable via `VITE_SENTRY_TRACES_SAMPLE_RATE` (default `0.05`). |

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
