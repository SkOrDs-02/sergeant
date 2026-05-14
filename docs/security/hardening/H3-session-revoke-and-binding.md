# H3 — Session 30-day TTL with no revoke-on-password-change and no device binding

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04) — PR [#1669](https://github.com/Skords-01/Sergeant/pull/1669)

| Field          | Value                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.1, AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)                                                                                                            |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                                                                                                                       |
| **Owner**      | backend                                                                                                                                                         |
| **Effort**     | 1 person-day                                                                                                                                                    |
| **Status**     | Closed (2026-05-04) — PR [#1669](https://github.com/Skords-01/Sergeant/pull/1669)                                                                               |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                 |
| **Resolved**   | Server-side hooks land in `apps/server/src/auth.ts` + `apps/server/src/auth/sessionFingerprint.ts`; UI follow-up tracked separately as the SessionsList screen. |

## Summary

Better Auth is configured with a 30-day session TTL and a 1-day rolling
`updateAge`. There is no hook on `password.update` to invalidate other sessions,
no "log out everywhere" UI, and no binding of the session to the device that
created it (User-Agent + IP prefix). A stolen cookie or bearer therefore stays
valid for up to 30 days regardless of how the user reacts.

## Affected files

- `apps/server/src/auth.ts:104–115` — `session.expiresIn`, `updateAge`,
  `cookieCache`.
- `apps/server/src/http/requireSession.ts` — session resolver, no fingerprint
  check.
- `apps/server/src/modules/auth/changePassword.ts` (does not exist yet).

## Evidence

```ts
// apps/server/src/auth.ts:104
session: {
  expiresIn: 60 * 60 * 24 * 30,   // 30 days
  updateAge: 60 * 60 * 24,        // 1 day
  cookieCache: { enabled: true, maxAge: 5 * 60 },
},
```

`databaseHooks.session.create.before` records nothing about User-Agent or IP.
There is no project-side wrapper around `auth.api.changePassword` to invalidate
sibling sessions.

## Impact

1. **Password reset offers no immediate protection.** A user who resets a
   compromised password keeps every other session live; the attacker keeps
   access until the 30-day TTL expires.
2. **Bearer-token hijack persistence.** The mobile shell carries a 30-day
   bearer; if it is exfiltrated (see [H1](./H1-mobile-bearer-storage.md)), it
   can be replayed for the full TTL.
3. **No device list, no kill switch.** Founder-only support cannot tell a user
   "log out all my devices except this one" without manual SQL.
4. **Forensic blind spot.** No `userAgent` / `ipPrefix` columns means we cannot
   answer "which device created this session?" during an incident.

## Recommendation

- On `password.update` (and on any future `session.revokeAll` admin action),
  call `auth.api.revokeOtherSessions({ headers: req.headers })` (Better Auth
  helper) and bust the `cookieCache`.
- Add a "Active sessions" UI tile that lists sessions with `userAgent`,
  `ipPrefix`, `createdAt`, and a per-row "Revoke" button.
- Bind the session to the **first-seen User-Agent + IP-prefix** (24 bits for
  IPv4, 64 bits for IPv6). On drift → emit `auth.session.ua_drift` log + offer a
  re-auth challenge for high-risk routes (Mono connect, password change).
- Reduce mobile bearer TTL to 7 days with rolling refresh — pairs with
  [H1](./H1-mobile-bearer-storage.md).

## Correction points

- `apps/server/src/modules/auth/changePassword.ts` (new) — wrapper that calls
  `auth.api.changePassword` and `auth.api.revokeOtherSessions`.
- `apps/server/src/auth.ts` — in `databaseHooks.session.create.before`, persist
  `userAgent`, `ipPrefix` (truncate per family).
- `apps/server/src/http/requireSession.ts` — load session row, compare
  `userAgent`/`ipPrefix`; on mismatch emit a `session.ua_drift` warn log and
  optionally require step-up.
- `apps/server/src/migrations/03X_session_fingerprint.sql` — `ALTER TABLE
session ADD COLUMN user_agent TEXT, ip_prefix TEXT`.
- `apps/web/src/modules/account/sessions/SessionsList.tsx` (new) — list +
  revoke UI.

## Verification

- **Unit:** `changePassword` test case asserts that `revokeOtherSessions` is
  invoked exactly once with the same request headers.
- **Integration:** with two browsers signed in, change password in browser A;
  browser B's next request returns 401.
- **Drift smoke test:** mutate `User-Agent` mid-session; expect a structured
  `session.ua_drift` log entry.
- **Migration smoke test:** run forward and rollback against a staging clone
  with one historical session row to ensure the new columns default safely.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
- [`./H6-email-verification.md`](./H6-email-verification.md)
- [`../vulnerability-sla.md`](../vulnerability-sla.md)
