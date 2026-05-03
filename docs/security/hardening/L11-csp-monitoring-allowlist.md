# L11 — CSP must allowlist Sentry / PostHog `connect-src`

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | frontend                                      |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

[C2](./C2-frontend-csp.md) ships a Content-Security-Policy. If
`connect-src` does not allow `https://*.sentry.io`,
`https://*.posthog.com`, and any other monitoring host, monitoring breaks
silently in production and we lose the very telemetry that detects an
attack.

## Recommendation

Explicitly enumerate every monitoring host in `connect-src` (and
`script-src` if scripts are loaded from those hosts). Treat the list as a
strict allowlist — no wildcards beyond the documented vendor subdomains.

## Correction points

- `vercel.json` (or per-app analogue) — extend the CSP `connect-src`
  directive with the monitoring hosts.
- `apps/web/index.html` — fallback meta CSP mirrors the same hosts.
- `docs/security/audit-exceptions.md` — record any vendor host that
  required a wildcard.

## Verification

- **Browser:** in production, no CSP violations are reported for Sentry /
  PostHog requests during normal use.
- **Synthetic:** a deliberate failed PostHog request returns no
  CSP-blocked errors in the browser console.

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`./M21-coep-stripe-compatibility.md`](./M21-coep-stripe-compatibility.md)
