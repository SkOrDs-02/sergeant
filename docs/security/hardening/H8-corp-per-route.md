# H8 — `Cross-Origin-Resource-Policy: cross-origin` without per-route guards

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | High (CVSS 7.1, AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                            |
| **Owner**      | backend                                              |
| **Effort**     | 0.5 person-day                                       |
| **Status**     | Open                                                 |
| **Discovered** | 2026-05-03 deep security review                      |

## Summary

`apps/server/src/http/security.ts` configures `helmet` with
`crossOriginResourcePolicy: "cross-origin"` so the SPA hosted on Vercel can
fetch the API. The same header is returned for **every** API route, including
session-protected ones (`/api/me`, `/api/mono/*`, `/api/chat/*`). This widens
the API into a CORB-bypassed surface usable by attacker-controlled origins
(timing oracles, `<img>`-tag tricks, side-channel login probing).

## Affected files

- `apps/server/src/http/security.ts` — Helmet defaults.
- `apps/server/src/http/cors.ts` — CORS allowlist (works correctly, but `CORP`
  is a separate header that CORS does not mediate).
- `apps/server/src/modules/me/router.ts`,
  `apps/server/src/modules/mono/router.ts`,
  `apps/server/src/modules/chat/router.ts` — sensitive endpoints.

## Evidence

```ts
// apps/server/src/http/security.ts
helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // …
})
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
  `same-origin` per route or via a middleware that detects `req.user`.
- For **truly cross-origin** endpoints (`/api/web-vitals`, `/api/csp-report`,
  `/api/health`, OAuth callbacks) keep `cross-origin`.
- Combine with [C2](./C2-frontend-csp.md) — CSP `frame-ancestors 'none'`
  blocks framing attacks; CORP `same-origin` blocks resource embedding.

## Correction points

- `apps/server/src/http/security.ts` — keep Helmet default as
  `cross-origin` (compatibility), but extract a `requireSameOriginCorp`
  middleware:

```ts
export function requireSameOriginCorp(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
}
```

- Apply it on:
  - `apps/server/src/modules/me/router.ts`
  - `apps/server/src/modules/mono/router.ts`
  - `apps/server/src/modules/chat/router.ts`
  - `apps/server/src/modules/sync/router.ts`
  - All routes that call `requireSession`.
- Add a unit test that walks the router tree and asserts the header is set.
- Update `apps/server/README.md` with the per-route guidance.

## Verification

- **Unit:** Supertest hit on `/api/me` (authenticated) returns
  `Cross-Origin-Resource-Policy: same-origin`.
- **Unit:** Supertest hit on `/api/health` returns `cross-origin`.
- **Browser:** an attacker-style HTML page hosted on `evil.example` embedding
  `<img src="https://api/.../api/me">` no longer fires `onload` for a logged-in
  visitor.

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
