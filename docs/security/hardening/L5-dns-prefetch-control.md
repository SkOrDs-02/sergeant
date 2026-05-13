# L5 — Confirm `X-DNS-Prefetch-Control: off`

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
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

The API does not render HTML, so DNS prefetch is irrelevant in practice —
but Helmet's default sets `X-DNS-Prefetch-Control: off`. Confirm the
project does not override the default to `on`.

## Recommendation

Add a regression test that asserts the header is `off` (or absent) on every
API response.

## Correction points

- `apps/server/src/http/security.test.ts` — assertion against
  `X-DNS-Prefetch-Control` value.

## Verification

- **Unit:** Supertest fetch on `/api/health` returns the expected header.

## Cross-references

- [`./L6-no-sniff-explicit.md`](./L6-no-sniff-explicit.md)

## Resolution log

### 2026-05-05 — closed

`apps/server/src/http/security.ts` keeps Helmet's `dnsPrefetchControl`
default (`{ allow: false }`) — verified by reading the middleware
configuration and noting the absence of any override. The audit asked for
an **explicit regression test** so a future Helmet upgrade or option flip
(`dnsPrefetchControl: { allow: true }`) trips CI rather than silently
relaxing the default.

`apps/server/src/http/security.test.ts` got a new `L5 + L6 — explicit
response-header defaults` describe-group. The added `captureHeaders()`
helper records every `res.setHeader` call by lower-cased name, so the
three new tests (`/api` API-only mode + Replit `servesFrontend` mode for
L5 and L6) lock both defaults without depending on Helmet's casing. All
16 server `security.test.ts` cases pass locally.

Batched with **L4 + L6 + M21** in the same hardening PR (Sprint 4 hygiene
sweep + M21 COEP doc).
