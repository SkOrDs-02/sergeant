# M10 — No CSRF token check on state-changing routes

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

Better Auth uses session cookies. Express handlers (`/api/mono/connect`,
`/api/push/subscribe`, `/api/sync/push`, …) verify the session but do not
require a CSRF-defeating header. Cookies are `SameSite=None` (cross-site
needed for the SPA on Vercel), so a third-party origin can issue an
authenticated POST when the user is signed in.

## Recommendation

Pick one and enforce uniformly across state-changing methods:

1. **Double-submit cookie**: set a non-HttpOnly `csrf_token` cookie on
   login; clients must echo it in `X-CSRF-Token` for every POST/PUT/PATCH/
   DELETE.
2. **Custom header gate**: require `X-Requested-With: XMLHttpRequest` (or a
   bespoke header). Cross-site forms cannot set custom headers without CORS.
3. **`SameSite=Strict` migration**: combined with first-party redirect-flow
   login. Higher effort but eliminates the risk.

The recommended path is **(2)** — minimal code change, browsers without
CORS preflight cannot set the header.

## Correction points

- `apps/server/src/http/requireCsrfHeader.ts` (new) — middleware that 403s
  any state-changing request without `X-Requested-With: XMLHttpRequest`.
- `apps/server/src/app.ts` — apply on every `Router` mount that handles
  POST/PUT/PATCH/DELETE except OAuth callbacks.
- `apps/web/src/core/api/client.ts` — set the header in the global fetch
  wrapper.
- `apps/mobile-shell/src/auth-storage.ts` — same.

## Verification

- **Unit:** Supertest hit on `POST /api/mono/connect` without the header
  returns 403; with the header returns 200.
- **Browser test:** a third-party page posts to `/api/sync/push` while the
  user is signed in; request returns 403 without ever reaching the handler.

## Cross-references

- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
- [`./H8-corp-per-route.md`](./H8-corp-per-route.md)
