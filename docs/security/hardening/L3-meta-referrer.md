# L3 — `index.html` missing `<meta name="referrer">`

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Closed (2026-05-05)

| Field          | Value                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Low                                                                                                                                                                     |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                                                                                                               |
| **Owner**      | frontend                                                                                                                                                                |
| **Effort**     | 0.1 person-day _(closed 2026-05-05 — batched L3 + L7 + L11 hardening PR)_                                                                                               |
| **Status**     | Closed (2026-05-05)                                                                                                                                                     |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                         |
| **Resolved**   | 2026-05-05 — `<meta name="referrer" content="strict-origin-when-cross-origin">` mirrors the Vercel `Referrer-Policy` header for file:// / Vite-preview / proxy contexts |

## Summary

Vercel sets `Referrer-Policy: strict-origin-when-cross-origin`. Adding a
duplicate `<meta name="referrer" content="no-referrer">` (or
`strict-origin-when-cross-origin`) provides defense-in-depth if Vercel
header settings are ever lost.

## Recommendation

Add the meta tag inside `apps/web/index.html`'s `<head>`.

## Correction points

- `apps/web/index.html` — `<meta name="referrer" content="strict-origin-when-cross-origin">`.

## Verification

- **Browser:** view source confirms the tag is present in the rendered HTML.
- **Smoke:** `curl -s https://<domain> | grep referrer` returns a match.

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
