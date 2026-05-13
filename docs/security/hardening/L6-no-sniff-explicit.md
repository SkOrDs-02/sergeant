# L6 — Confirm `X-Content-Type-Options: nosniff`

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-05) — see Resolution log.

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.1 person-day                  |
| **Status**     | **Closed** (2026-05-05)         |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/server/src/http/security.ts` should leave Helmet's `noSniff: true`
default in place. Add a regression test that the header is set on every
API response.

## Recommendation

Test, do not change. The audit only flagged this for "explicit assertion"
to prevent a future regression.

## Correction points

- `apps/server/src/http/security.test.ts` — assert
  `X-Content-Type-Options: nosniff` on `/api/health` and `/api/me`.

## Verification

- **Unit:** Supertest assertion passes after the fix and fails when Helmet
  is misconfigured.

## Cross-references

- [`./L5-dns-prefetch-control.md`](./L5-dns-prefetch-control.md)

## Resolution log

### 2026-05-05 — closed

Helmet's `noSniff: true` default is preserved in
`apps/server/src/http/security.ts`. The audit asked only for **explicit
regression coverage** — closed by extending
`apps/server/src/http/security.test.ts` with a new `L5 + L6 — explicit
response-header defaults` describe-group:

- API-only mode (`apiHelmetMiddleware()`) → asserts
  `X-Content-Type-Options: nosniff`.
- Replit `servesFrontend: true` mode → same assertion (CSP is disabled in
  this mode, but the sniff header must keep firing because text/\* responses
  like `/api/health` rely on it for MIME-confusion protection regardless of
  CSP state).

The new `captureHeaders()` helper case-folds header names so the test does
not depend on Helmet's casing convention. All 16 cases in the file pass.

Batched with **L4 + L5 + M21** in the same hardening PR.
