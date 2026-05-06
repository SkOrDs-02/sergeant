# L2 — Permissions-Policy could disable more APIs

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Closed (2026-05-06)

| Field          | Value                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Low                                                                                                                                                                                                                                                                                                                                                  |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                                                                                                                                                                                                                                                                                            |
| **Owner**      | frontend                                                                                                                                                                                                                                                                                                                                             |
| **Effort**     | 0.1 person-day                                                                                                                                                                                                                                                                                                                                       |
| **Status**     | Closed (2026-05-06) — `apps/web/vercel.json` `Permissions-Policy` extended with `clipboard-read`, `clipboard-write`, `screen-wake-lock`, `xr-spatial-tracking`, `bluetooth`, `hid`, `serial`, `midi`, `encrypted-media`; regression test in `apps/web/src/test/permissionsPolicyHeader.test.ts` locks the directive set against silent re-enablement |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                                                                                                                                                      |

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

- `apps/web/vercel.json` (single SSOT after [H7](./H7-vercel-config-drift.md))
  — extend the directive list with the surfaces the SPA never touches.
- `apps/web/src/test/permissionsPolicyHeader.test.ts` (new) — regression
  test that fails if any required directive is dropped or widened to
  `*`; replaces the deployed-origin smoke test from the original
  recommendation because it catches the regression in CI before the
  drift reaches production.

## Closure (2026-05-06)

Directives added on top of the original C2 baseline
(`camera`, `microphone`, `geolocation`, `interest-cohort`,
`browsing-topics`, `payment`, `usb`, `magnetometer`, `accelerometer`,
`gyroscope`):

- `clipboard-read`, `clipboard-write` — explicitly mentioned in the card;
  the SPA never reads / writes the clipboard programmatically.
- `screen-wake-lock` — explicitly mentioned; no long-running screen-on
  flows.
- `xr-spatial-tracking` — explicitly mentioned; no WebXR surfaces.
- `bluetooth`, `hid`, `serial`, `midi` — Web\* device APIs; not used.
- `encrypted-media` — EME / DRM not in scope for the SPA.

Features intentionally **not** disabled because the SPA may legitimately
use them (or because the directive is browser-specific and absence is the
strictest posture):

- `fullscreen`, `picture-in-picture`, `autoplay`, `display-capture` —
  reserved for future media flows; revisit when those land.
- `gamepad` — same rationale.

If any of those move into use, drop the carve-out and update the test;
if any of the disabled directives are re-enabled, document the carve-out
in `docs/security/audit-exceptions.md` first.

## Verification

- **CI:** `apps/web/src/test/permissionsPolicyHeader.test.ts` enforces
  `name=()` for every directive in `REQUIRED_DISABLED_DIRECTIVES` and
  rejects `name=*` for any directive.
- **Browser:** load DevTools → Application → Headers on the deployed
  origin; confirm the new directives are present.
- **Functional:** every existing flow still works (no surprise feature
  disabled).

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`./L11-csp-monitoring-allowlist.md`](./L11-csp-monitoring-allowlist.md)
