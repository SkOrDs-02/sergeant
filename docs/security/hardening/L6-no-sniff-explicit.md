# L6 — Confirm `X-Content-Type-Options: nosniff`

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
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
