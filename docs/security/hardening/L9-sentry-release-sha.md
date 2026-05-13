# L9 — Sentry `release` not SHA-pinned

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed 2026-05-04 — PR [#1786](https://github.com/Skords-01/Sergeant/pull/1786)

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Closed 2026-05-04 — PR #1786    |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`SENTRY_RELEASE` was not consistently set to the deployed git SHA. Without
it, release-tracking and source-maps lookup are best-effort, hampering
incident attribution.

## Recommendation

- Set `SENTRY_RELEASE=$GIT_SHA` in CI / Railway / Vercel environments.
- Inject the value at build time so client and server share the same
  release tag.

## Resolution (2026-05-04)

PR [#1786](https://github.com/Skords-01/Sergeant/pull/1786) introduced a
single resolution helper that the server, the web bundle and the Sentry
source-map upload all share. The helper picks the first non-empty value
from a deterministic cascade so every supported deploy host produces a
matching release tag.

### Cascade (highest precedence first)

| Source                   | Where it comes from                                 |
| ------------------------ | --------------------------------------------------- |
| `SENTRY_RELEASE`         | Explicit override (release-please, custom CI)       |
| `RAILWAY_GIT_COMMIT_SHA` | Auto-injected by Railway per deploy                 |
| `VERCEL_GIT_COMMIT_SHA`  | Auto-injected by Vercel per deploy                  |
| `GITHUB_SHA`             | Fallback for GH Actions (mobile-shell, scans, etc.) |

When none of the variables are set, the helper returns `undefined` so
Sentry's own "no release" bucket surfaces the misconfiguration in its UI
instead of being masked by a placeholder string.

### Correction points

- [`apps/server/src/sentry.ts`](../../../apps/server/src/sentry.ts) —
  `resolveSentryRelease()` exported helper, used as
  `release: resolveSentryRelease()` in `Sentry.init`.
- [`apps/server/src/sentry.test.ts`](../../../apps/server/src/sentry.test.ts) —
  unit tests cover override / Railway / Vercel / GitHub fallbacks plus
  empty-string and trim semantics.
- [`apps/web/vite.config.js`](../../../apps/web/vite.config.js) — populates
  `process.env.VITE_SENTRY_RELEASE` at build time from the same cascade
  before Vite reads `import.meta.env`, and reuses the same value as the
  Sentry vite plugin's `release.name` so the runtime tag and the
  source-map upload tag never drift.
- [`apps/web/src/core/observability/sentry.ts`](../../../apps/web/src/core/observability/sentry.ts) —
  reads `import.meta.env.VITE_SENTRY_RELEASE` (unchanged; now reliably
  populated by the build).

No changes were required in deploy workflows: every supported host
already exports its own `*_GIT_COMMIT_SHA` (or `GITHUB_SHA` inside Actions
runners), and the cascade picks them up automatically.

## Verification

- **Unit:** `pnpm --filter @sergeant/server test src/sentry.test.ts` — 27
  tests pass, 7 of them new and dedicated to `resolveSentryRelease`.
- **Manual:** Sentry dashboard will show distinct releases per deploy
  starting with the next Railway / Vercel rollout (each deploy injects a
  fresh `*_GIT_COMMIT_SHA`).
- **Smoke:** an intentional staging error is grouped under the expected
  release tag (matches the `*_GIT_COMMIT_SHA` value in the deploy logs).

## Cross-references

- [`./L7-health-endpoint-info-leak.md`](./L7-health-endpoint-info-leak.md)
