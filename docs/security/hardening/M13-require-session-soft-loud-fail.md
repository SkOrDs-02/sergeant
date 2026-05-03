# M13 — `requireSessionSoft` swallows DB errors as 401

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

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

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
