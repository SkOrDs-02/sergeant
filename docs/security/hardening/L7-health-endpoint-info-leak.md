# L7 — Health endpoint info-leak audit

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-05)

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | Low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Owner**      | backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Effort**     | 0.25 person-day _(closed 2026-05-05 — batched L3 + L7 + L11 hardening PR)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Status**     | Closed (2026-05-05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Resolved**   | 2026-05-05 — audit finding: probe handlers (`livez`/`readyz`/`startupz`/`/health`/`/health/*`) already return short `text/plain` `ok`/`starting`/`unhealthy` (≤ 32 bytes); `/healthz` JSON has no `commit`/`sha`/`version`/`build`/`buildDate`/`buildSha`/`gitSha`/`release` keys at any depth. New regression test `apps/server/src/routes/health.infoleak.test.ts` locks the body shape so future enrichment ("let's add a `version` field") has to land on the L7 audit thread. Sentry-traces sampler exclusion still tracked separately by [stack-pulse PR #12](../../initiatives/stack-pulse-2026-05/pr-12-sentry-traces-sampler.md). |

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
  rule [PR #12](../../initiatives/stack-pulse-2026-05/pr-12-sentry-traces-sampler.md);
  cross-check after that PR lands).

## Verification

- **Unit:** Supertest fetch returns the minimal payload.
- **Smoke:** in production the response body length is < 32 bytes.

## Cross-references

- [`./L9-sentry-release-sha.md`](./L9-sentry-release-sha.md)
