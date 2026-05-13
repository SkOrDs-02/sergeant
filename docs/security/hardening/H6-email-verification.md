# H6 — Email verification disabled, sensitive actions not gated

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (partial — Mono connect gated, sign-in gate behind ops flip)

| Field          | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.4, AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)                |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                           |
| **Owner**      | backend                                                             |
| **Effort**     | 0.5 person-day                                                      |
| **Status**     | Closed (partial — Mono connect gated, sign-in gate behind ops flip) |
| **Discovered** | 2026-05-03 deep security review                                     |
| **Closed**     | 2026-05-04 (PR pending — see Implementation log)                    |

## Summary

Better Auth is configured with `emailAndPassword.enabled = true` but historically
`emailVerification.sendOnSignUp = false` and `requireEmailVerification = false`.
A user can sign up with anyone's email, and the legitimate owner is locked out
when they try to register the same address later. Sensitive actions (Mono
connect, password change, OpenClaw linking) were not gated on
`email_verified=true`.

## Affected files

- `apps/server/src/auth.ts:130–182` — Better Auth `emailAndPassword`,
  `emailVerification` blocks.
- `apps/server/src/env/env.ts` — new `REQUIRE_EMAIL_VERIFICATION` flag.
- `apps/server/src/http/requireVerifiedEmail.ts` — new gate middleware.
- `apps/server/src/routes/mono-webhook.ts` — `/api/mono/connect` now wraps the
  gate.

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

## Recommendation (as-shipped)

- `emailVerification.sendOnSignUp: true` — every new sign-up triggers a
  verification email through the existing Resend / `auth-mail` BullMQ queue.
- `emailAndPassword.requireEmailVerification = env.REQUIRE_EMAIL_VERIFICATION`
  (default `false`). Ops flips `true` after a soft-gate sweep of legacy
  unverified accounts.
- Pre-check `user.emailVerified` on the highest-impact sensitive flow today —
  `POST /api/mono/connect`. The gate is **unconditional** (does not depend on
  `REQUIRE_EMAIL_VERIFICATION`); a squatter cannot bypass it by waiting for
  ops to flip the global flag back off.

### Deferred (intentionally out of this PR)

- **Soft-gate for legacy users.** Background job that flips
  `REQUIRE_EMAIL_VERIFICATION=true` user-by-user after the user re-verifies,
  emitting a "verify within 7 days or your account will be deleted" banner.
  Tracked separately because the deletion task touches retention policy and
  needs product sign-off.
- **Password-change / reset gate.** `passwordReset` already requires the
  verification link possession, so it is implicitly gated. Password-change
  while signed-in is not yet a separate route — when introduced, drop
  `requireVerifiedEmail()` into the chain like `/api/mono/connect`.
- **OpenClaw / Telegram link gate.** No `link.ts` route exists in the repo
  today (verified via `grep`), so there is nothing to gate. When the route
  lands, the same one-line `requireVerifiedEmail()` middleware applies.
- **Push subscription gate.** Considered low-impact (push is per-device and
  per-user, no cross-account exposure), so left ungated.
- **Per-user verification-email rate-limit (1/min, 6/h, 24/24h).** The
  `auth-mail` BullMQ queue has its own producer-side dedup and the public
  resend endpoint is not exposed to logged-out users; we will revisit when
  the `VerifyEmailGate` UI lands and exposes a "Resend" button to the world.

## Correction points (delivered)

- **`apps/server/src/auth.ts`**:
  - `emailVerification.sendOnSignUp: true` (was `false`).
  - `emailAndPassword.requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION`
    (new — gated by env flag, default `false`).
- **`apps/server/src/env/env.ts`**:
  - new `REQUIRE_EMAIL_VERIFICATION` enum env.
- **`apps/server/src/http/requireVerifiedEmail.ts`** (new):
  - Returns 403 `EMAIL_VERIFICATION_REQUIRED` when
    `req.user.emailVerified !== true`. Strict-mode default — undefined treated
    as unverified.
- **`apps/server/src/routes/mono-webhook.ts`**:
  - `/api/mono/connect` now chains `requireSession() →
requireVerifiedEmail() → connectHandler`. `/api/mono/disconnect`,
    `/accounts`, `/transactions`, `/backfill*` deliberately stay
    session-only (no new permissions, just visibility / wind-down for users
    who connected before the gate landed).

## Verification (as-shipped)

- **Unit (`apps/server/src/http/requireVerifiedEmail.test.ts`):**
  - `emailVerified=true` → next() → 200.
  - `emailVerified=false` → 403 `EMAIL_VERIFICATION_REQUIRED`.
  - `emailVerified=undefined` → 403 (strict-mode default).
  - `req.user` missing → 401 `UNAUTHORIZED`.
- **Integration (`apps/server/src/routes/apiV1.test.ts → H6: ...`):**
  - `POST /api/mono/connect` with unverified session → 403, no DB writes,
    `Cross-Origin-Resource-Policy: same-origin` header (H8 invariant).
  - `POST /api/mono/connect` without session → 401 `UNAUTHORIZED` (gate
    does not downgrade 401 to 403).
- **Existing regression coverage** (`auth.test.ts`, `connection.test.ts`,
  `requireSession.test.ts`) — 33/33 still pass after the change.

## Implementation log

### 2026-05-04 — Initial close (partial scope)

Shipped three of the five recommendations from the original card:

1. `sendOnSignUp: true` — every new sign-up gets a verification mail.
2. `requireEmailVerification` wired through new `REQUIRE_EMAIL_VERIFICATION`
   env flag, default `false` to avoid locking out the existing unverified
   userbase.
3. `requireVerifiedEmail()` middleware on `POST /api/mono/connect` —
   unconditional gate independent of `REQUIRE_EMAIL_VERIFICATION`.

Deferred items (soft-gate for legacy users, OpenClaw/Telegram link gate,
per-user verification-email rate-limit, `VerifyEmailGate` UI banner) are
listed under **Deferred** above with explicit rationale. Card flips to
**Closed (partial)** because the most exploitable vector
(squat-email → bank-statement leak) is closed in this PR; the residual
work is enrichment, not severity-driving.

## Cross-references

- [`./H3-session-revoke-and-binding.md`](./H3-session-revoke-and-binding.md)
- [`./H8-corp-per-route.md`](./H8-corp-per-route.md) — every 403 from the
  H6 gate carries `CORP: same-origin` (regression-tested).
- [`../audit-exceptions.md`](../audit-exceptions.md) — no exceptions expected.
