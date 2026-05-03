# L5 — Confirm `X-DNS-Prefetch-Control: off`

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

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
