# L2 — Permissions-Policy could disable more APIs

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | frontend                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`vercel.json:18–20` disables `camera`, `microphone`, `geolocation`. Other
sensitive APIs (`accelerometer`, `gyroscope`, `magnetometer`, `payment`,
`usb`, `clipboard-write`, `clipboard-read`, `screen-wake-lock`,
`xr-spatial-tracking`) are left enabled. None of these are needed by the
SPA today.

## Recommendation

Extend `Permissions-Policy` to disable every API the app does not use; add
back only what the SPA actually requires.

## Correction points

- `vercel.json` — extend the directive list.
- `apps/web/vercel.json` (after [H7](./H7-vercel-config-drift.md)) — same.
- Add a smoke test that hits the deployed origin and asserts the response
  header contains the expected directives.

## Verification

- **Browser:** load DevTools → Application → Headers; confirm the new
  directives are present.
- **Functional:** every existing flow still works (no surprise feature
  disabled).

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
