# M13 — `requireSessionSoft` swallows DB errors as 401

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                     |
| **Owner**      | backend                                                                                                       |
| **Effort**     | 0.25 person-day                                                                                               |
| **Status**     | Closed (2026-05-04, batched with M4 + M5 — server-side scope; client-side push back-off tracked in follow-up) |
| **Discovered** | 2026-05-03 deep security review                                                                               |
| **Closed**     | 2026-05-04 — circuit-breaker (5 consecutive) + counter                                                        |

## Summary

`apps/server/src/http/requireSession.ts:43–60` catches every error inside
`requireSessionSoft` and returns 401. When Postgres is unavailable, callers
(notably push-subscribe) see "you are not signed in" and retry forever,
flooding logs and masking the real outage.

## Recommendation

- Differentiate between "no session" and "session lookup failed".
- On lookup failure: `logger.warn` with the underlying error and return 503
  (or a circuit-breaker after N failures in a row).

## Correction points

- `apps/server/src/http/requireSession.ts` — split the catch into
  `(err: AuthError)` vs `(err: Error)`; add a small in-process
  failure-counter to escalate to 503 after 5 consecutive errors.
- `apps/server/src/modules/push/subscribe.ts` — back off on 503 and surface
  a structured retry hint to clients.
- `apps/server/src/obs/metrics.ts` — register
  `auth.session_lookup_failure_total`.

## Verification

- **Unit:** mock the session store to throw `Error("ECONNREFUSED")`; expect
  503, structured log, and counter increment.
- **Operational:** kill staging Postgres; observe the new metric and 503
  responses; clients back off.

## Resolution (2026-05-04)

Delivered as part of the Sprint 3 M4 + M5 + M13 hardening batch. Server
side only; client-side push-subscribe back-off-with-retry-hint is tracked
as a follow-up so the behavioural change ships with `requireSessionSoft`
first (push clients keep treating 503 as retriable like any other 5xx).

- `apps/server/src/http/requireSession.ts` — `requireSessionSoft` now
  splits the lookup result into three branches:
  1. **`user`** present → reset failure counter, call `next()`.
  2. `user === null` (true "no session") → 401, **counter untouched**.
  3. `getSessionUser` threw → increment in-process counter, log
     `auth_session_lookup_failed` with the consecutive count, and:
     - return 401 below `SOFT_FAILURE_LOUD_THRESHOLD = 5`,
     - return 503 `SESSION_LOOKUP_UNAVAILABLE` once the breaker trips.
       Counter is per-replica on purpose (Railway runs ≥2 replicas, single-pod
       cold-pool blip absorbed; sustained outage trips both pods quickly).
       CORP `same-origin` is still set unconditionally so H8 is not relaxed by
       the new 503 branch.
- `requireSession()` (the loud variant) also emits the new
  `auth_session_lookup_failure_total{variant="require",mode="loud_503"}`
  metric before `next(err)` so dashboards see both surfaces.
- `apps/server/src/obs/metrics.ts` — added counter
  `auth_session_lookup_failure_total{variant,mode}`. Labels:
  `variant ∈ {require, require_soft}`,
  `mode ∈ {soft_swallowed, loud_503}`.
- `apps/server/src/http/requireSession.test.ts` — covers all four cases:
  under-threshold soft swallow, 5th-consecutive escalation to 503,
  successful lookup resets the counter, and `user === null` floods do
  **not** consume any breaker budget.

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
