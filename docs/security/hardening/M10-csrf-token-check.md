# M10 — No CSRF token check on state-changing routes

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784).

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                   |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                |
| **Owner**      | backend                                                                                                  |
| **Effort**     | 0.5 person-day                                                                                           |
| **Status**     | Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched with M14 + M19) |
| **Discovered** | 2026-05-03 deep security review                                                                          |

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
  any state-changing request without `X-Requested-With: XMLHttpRequest` or
  `X-Api-Secret` (S2S bypass).
- `apps/server/src/app.ts` — applied globally with an explicit allowlist
  for OAuth callbacks (`/api/auth/callback/*`) and the Better Auth
  handler mount, where browsers cannot set custom headers on a redirect.
- `apps/web/src/core/lib/chatActions/serverActions.ts` and
  `packages/api-client/src/httpClient.ts` — set
  `X-Requested-With: XMLHttpRequest` in the shared fetch wrapper so every
  outbound call carries it.
- `apps/web/src/core/observability/webVitals.ts` — same for the
  beacon-style ingest path.
- Updated supertest fixtures (`pushTest.test.ts`, `smoke.test.ts`,
  `coach.route.test.ts`, `ai-memory.route.test.ts`, `apiV1.test.ts`) to
  attach the header on every state-changing call.

## Verification

- **Unit:** `apps/server/src/http/requireCsrfHeader.test.ts` covers the
  full method matrix (GET/HEAD/OPTIONS skip, POST/PUT/PATCH/DELETE
  enforce), the `X-Requested-With` accept-path, the `X-Api-Secret`
  S2S-bypass, and the OAuth-callback allowlist.
- **Integration:** existing route tests (`pushTest.test.ts`,
  `smoke.test.ts`, `coach.route.test.ts`, …) exercise the global mount
  end-to-end.

## Cross-references

- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
- [`./H8-corp-per-route.md`](./H8-corp-per-route.md)
