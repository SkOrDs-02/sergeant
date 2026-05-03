# H6 — Email verification disabled, sensitive actions not gated

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | High (CVSS 7.4, AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                            |
| **Owner**      | backend                                              |
| **Effort**     | 0.5 person-day                                       |
| **Status**     | Open                                                 |
| **Discovered** | 2026-05-03 deep security review                      |

## Summary

Better Auth is configured with `emailAndPassword.enabled = true` but
`emailVerification.sendOnSignUp = false` and `requireEmailVerification = false`.
A user can sign up with anyone's email, and the legitimate owner is locked out
when they try to register the same address later. Sensitive actions (Mono
connect, password change, OpenClaw linking) are not gated on
`email_verified=true`.

## Affected files

- `apps/server/src/auth.ts:140–150` — Better Auth `emailAndPassword`,
  `emailVerification` blocks.
- `apps/server/src/modules/mono/connection.ts` — no email-verified pre-check.
- `apps/server/src/modules/openclaw/link.ts` (or equivalent) — no pre-check.

## Evidence

The audit observed `sendOnSignUp: false` and noticed a dormant Drizzle column
`user.email_verified` that is set to `true` only via the Better Auth verify
endpoint, which itself is never advertised because the email is never sent.

## Impact

1. **Account-squatting.** Adversary registers `victim@gmail.com`, sets a
   password, and uses the account to connect a Mono profile (after which the
   victim's bank statements, AI history, etc. are accessible to the squatter).
2. **Lock-out.** The legitimate user later attempts to sign up and receives
   "email already exists" — no obvious recovery path.
3. **Phishing pivot.** Squatters with control of an unverified email may be
   able to receive password-reset tokens if reset is later wired without an
   ownership step.
4. **Compliance.** GDPR Article 32 expects "appropriate technical measures" —
   ungated mailbox-based identity is a soft fail.

## Recommendation

- `emailVerification.sendOnSignUp: true`, `requireEmailVerification: true`.
- For existing unverified accounts older than 3 days, mark them in a soft-gate
  state ("verify or this account will be deleted in 7 days") rather than
  immediate lockout.
- Pre-check `user.email_verified` in **every** sensitive flow:
  - Mono connect
  - Password change / reset
  - OpenClaw / Telegram link
  - Push subscription registration
- Rate-limit verification email sending per-user (1/min, 6/h, 24/24h).

## Correction points

- `apps/server/src/auth.ts` — flip the two booleans, configure the email
  template (HTML + text fallback).
- `apps/server/src/modules/mono/connection.ts` — add:

```ts
if (!session.user.emailVerified) {
  return reply.code(403).send({ error: "email_verification_required" });
}
```

- `apps/server/src/modules/auth/passwordChange.ts` — same gate.
- `apps/server/src/modules/openclaw/link.ts` — same gate.
- `apps/server/src/modules/auth/sendVerification.ts` — rate-limit wrapper +
  Pino-redacted token.
- `apps/web/src/modules/auth/VerifyEmailGate.tsx` (new) — UI banner for
  unverified state.

## Verification

- **Unit:** signing up issues exactly one verification email through the mock
  transport.
- **Integration:** unverified user receives 403 on `POST /api/mono/connect`.
- **Manual:** verification email arrives within 30 s in staging; clicking the
  link sets `email_verified=true`.
- **Rate-limit:** repeated `POST /api/auth/send-verification-email` calls
  return 429 after the configured window.

## Cross-references

- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
- [`../audit-exceptions.md`](../audit-exceptions.md) — no exceptions expected.
