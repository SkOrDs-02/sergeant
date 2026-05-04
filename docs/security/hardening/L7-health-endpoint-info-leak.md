# L7 — Health endpoint info-leak audit

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`Dockerfile.api` HEALTHCHECK hits `/health`. Confirm the endpoint:

1. Does not expose version / commit hash / build date in the response
   body (potential CVE-attribution helper).
2. Is rate-limit-free and not counted toward Sentry traces or quota.
3. Returns `200 OK` with a minimal payload (`{"ok":true}` or empty).

## Recommendation

Restrict the response to `{"ok":true}`. Move version metadata to an
internal-only `/__/version` route gated by `requireApiSecret`.

## Correction points

- `apps/server/src/modules/health/router.ts` — strip extra fields.
- `apps/server/src/modules/health/router.test.ts` — assert the body is
  exactly `{"ok":true}` and rate-limit middleware is not applied.
- Sentry traces sampler — exclude `/health` (already done by tracking
  rule [PR #12](../planning/stack-pulse-2026-05/pr-12-sentry-traces-sampler.md);
  cross-check after that PR lands).

## Verification

- **Unit:** Supertest fetch returns the minimal payload.
- **Smoke:** in production the response body length is < 32 bytes.

## Cross-references

- [`./L9-sentry-release-sha.md`](./L9-sentry-release-sha.md)
