# H8 — `Cross-Origin-Resource-Policy: cross-origin` without per-route guards

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04 — `requireSession*` overrides CORP to `same-origin` on every session-protected response, including 401s).

| Field          | Value                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.1, AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)                                                                                                        |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                                                                                                                   |
| **Owner**      | backend                                                                                                                                                     |
| **Effort**     | 0.5 person-day                                                                                                                                              |
| **Status**     | Closed (2026-05-04 — `requireSession` / `requireSessionSoft` override `Cross-Origin-Resource-Policy: same-origin` for the entire session-protected surface) |
| **Discovered** | 2026-05-03 deep security review                                                                                                                             |

## Summary

`apps/server/src/http/security.ts` configures `helmet` with
`crossOriginResourcePolicy: "cross-origin"` so the SPA hosted on Vercel can
fetch the API. The same header is returned for **every** API route, including
session-protected ones (`/api/me`, `/api/mono/*`, `/api/chat/*`). This widens
the API into a CORB-bypassed surface usable by attacker-controlled origins
(timing oracles, `<img>`-tag tricks, side-channel login probing).

## Affected files

- `apps/server/src/http/requireSession.ts` — the actual fix lives here.
  Both `requireSession()` and `requireSessionSoft()` call
  `setSameOriginCorp(res)` _before_ resolving the session, so the
  override applies to 200 / 401 / 500 responses uniformly.
- `apps/server/src/http/security.ts` — Helmet still configures
  `crossOriginResourcePolicy: { policy: "cross-origin" }` as the global
  default (so SPA on Vercel can fetch the API and public endpoints stay
  cross-origin); `requireSession*` overrides it for protected routes.
- `apps/server/src/http/cors.ts` — CORS allowlist (works correctly, but
  `CORP` is a separate header that CORS does not mediate).
- `apps/server/src/routes/apiV1.test.ts` — `H8: Cross-Origin-Resource-Policy
per-route` describe block exercises the real `createApp` against
  `/api/me` (200 + 401), `/healthz`, `/api/csp-report`,
  `/api/metrics/web-vitals`.
- `apps/server/src/http/requireSession.test.ts` — unit-level coverage
  for the middleware in isolation (5 cases).

## Evidence

```ts
// apps/server/src/http/security.ts
helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // …
});
```

A `<img src="https://api.sergeant.example/api/me">` tag in any third-party
origin loads the response (browser ignores pixel data but `onload` fires when
the user is authenticated, `onerror` fires otherwise). This is a login-state
oracle that bypasses CORS preflight because images are simple requests.

## Impact

1. **Login-state oracle.** Attacker pages can detect whether a visitor is
   logged in to Sergeant using only a 1×1 hidden `<img>`.
2. **Timing side channel.** Response size differences (logged-in `/api/me`
   vs. 401 stub) leak per-user signal.
3. **Future framing risk.** If a new public endpoint accidentally renders HTML
   with user-specific data, `cross-origin` makes a Spectre-style attack
   feasible from any origin.
4. **Defense in depth.** Returning `same-origin` for protected routes restores
   browser-side enforcement even if CORS is misconfigured.

## Recommendation

- For **session-protected** routes (`/api/me`, `/api/mono/*`, `/api/chat/*`,
  `/api/sync/*`, etc.) override `Cross-Origin-Resource-Policy` to
  `same-origin` _before_ the auth resolves, so 401s also get the
  override (otherwise the login-state oracle still leaks via 401 vs 200).
- For **truly cross-origin** endpoints (`/api/metrics/web-vitals`,
  `/api/csp-report`, `/healthz`, OAuth callbacks under `/api/auth/*`)
  keep `cross-origin`.
- Combine with [C2](./C2-frontend-csp.md) — CSP `frame-ancestors 'none'`
  blocks framing attacks; CORP `same-origin` blocks resource embedding.

## Correction points

- `apps/server/src/http/requireSession.ts` — the natural choke-point.
  All session-protected routes go through `requireSession()` /
  `requireSessionSoft()`, so adding the header there gives 100% coverage
  with one line. Set it _before_ the auth resolves so 401 responses get
  the override too:

```ts
function setSameOriginCorp(res: Response): void {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

export function requireSession(): RequestHandler {
  return async (req, res, next) => {
    setSameOriginCorp(res);
    // … existing body
  };
}
```

- Tests:
  - `apps/server/src/http/requireSession.test.ts` — 5 unit cases for the
    middleware in isolation (200, 401, 500, soft 200, soft 401).
  - `apps/server/src/routes/apiV1.test.ts` — `H8: ...` describe block
    against the real `createApp`: `/api/me` (200 + 401),
    `/healthz`, `/api/csp-report`, `/api/metrics/web-vitals`.
- This design replaces the `requireSameOriginCorp` per-route middleware
  originally proposed in this card. Reason: session-protection is
  already 100% gated through `requireSession*`, so doing the override
  there is structurally simpler than threading a second middleware
  through every router.

## Verification

- **Unit (locked in 2026-05-04):**
  - Supertest hit on `/api/me` (authenticated) returns
    `Cross-Origin-Resource-Policy: same-origin`.
  - Supertest hit on `/api/me` (unauthenticated, 401) **also** returns
    `same-origin` — closes the login-state oracle that survives a
    naive same-origin-only-on-200 implementation.
  - Supertest hit on `/healthz`, `/api/csp-report`,
    `/api/metrics/web-vitals` returns `cross-origin` (regression guard
    against accidentally tightening public endpoints).
- **Browser:** an attacker-style HTML page hosted on `evil.example`
  embedding `<img src="https://api/.../api/me">` no longer fires `onload`
  for a logged-in visitor _or_ for an anonymous visitor (browser blocks
  the resource on CORP mismatch regardless of body).

## Implementation log

| Date       | Event                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 | Drift detected during Sprint 2 prep; card opened.                                                                                                                                                                                                                                                                                                                            |
| 2026-05-04 | Closed: added `setSameOriginCorp` helper inside `apps/server/src/http/requireSession.ts`; both `requireSession` and `requireSessionSoft` set the header before resolving the session. 5 unit tests in `requireSession.test.ts` (200 / 401 / 500 / soft 200 / soft 401) plus 5 integration tests in `apiV1.test.ts` (real `createApp`, including public-endpoint regression). |

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
