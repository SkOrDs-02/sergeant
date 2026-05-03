# L9 — Sentry `release` not SHA-pinned

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | platform                                      |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

`SENTRY_RELEASE` is not consistently set to the deployed git SHA. Without it,
release-tracking and source-maps lookup are best-effort, hampering incident
attribution.

## Recommendation

- Set `SENTRY_RELEASE=$GIT_SHA` in CI / Railway / Vercel environments.
- Inject the value at build time so client and server share the same
  release tag.

## Correction points

- `.github/workflows/deploy-*.yml` — `echo "SENTRY_RELEASE=$GITHUB_SHA" >>
  $GITHUB_ENV`.
- `apps/server/src/obs/sentry.ts` — `release: process.env.SENTRY_RELEASE`.
- `apps/web/vite.config.ts` — `define: { __SENTRY_RELEASE__:
  JSON.stringify(process.env.SENTRY_RELEASE) }`.

## Verification

- **Manual:** Sentry dashboard shows distinct releases per deploy.
- **Smoke:** an intentional staging error is grouped under the expected
  release tag.

## Cross-references

- [`./L7-health-endpoint-info-leak.md`](./L7-health-endpoint-info-leak.md)
