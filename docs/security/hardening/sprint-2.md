# Sprint 2 — Session, surface and quota hardening

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active (H7 closed early — single-source-of-truth deliverable shipped 2026-05-04 alongside Sprint 1 H2 closure).

Sprint 2 closes the **High-severity backlog** that Sprint 1 left open and removes
two Medium-severity issues that share blast radius with Sprint 1 (`CSP_DISABLE`
runtime flag and Pino redaction gaps for the same secret families).

After Sprint 2 the only High-severity item still open is **H4 (encryption-key
rotation)** — it is intentionally deferred because it requires a DB migration
and a maintenance window; it lands in Sprint 3 alongside the medium batch.

## Scope

| ID                                       | Title                                            | Severity | Owner    | Effort                       |
| ---------------------------------------- | ------------------------------------------------ | -------- | -------- | ---------------------------- |
| [H3](./H3-session-revoke-and-binding.md) | Session 30 d, no revoke-on-password-change       | High     | backend  | 1 d                          |
| [H5](./H5-trusted-origins-exp-scheme.md) | `exp://` trusted origin in production            | High     | backend  | 0.25 d                       |
| [H6](./H6-email-verification.md)         | Email verification disabled, password reset weak | High     | backend  | 0.5 d                        |
| [H7](./H7-vercel-config-drift.md)        | `vercel.json` duplicated between root and apps   | High     | devops   | 0.25 d _(closed 2026-05-04)_ |
| [H8](./H8-corp-per-route.md)             | `CORP: cross-origin` without per-route guard     | High     | backend  | 0.5 d                        |
| [H9](./H9-transcribe-usd-cap.md)         | `transcribe` 10 MB upload, no per-user USD cap   | High     | backend  | 0.5 d                        |
| [M1](./M1-csp-disable-runtime-flag.md)   | `CSP_DISABLE=1` env-fault-injection              | Medium   | backend  | 0.25 d                       |
| [M3](./M3-pino-redact-paths.md)          | Pino `redactPaths` is incomplete                 | Medium   | platform | 0.25 d                       |

**Total effort:** ≈ 3.5 person-days (one engineer, one calendar week).

## Rationale

- **H3, H6, H8** harden the **session and authentication surface** that Sprint 1
  did not touch. After Sprint 1 the SPA has CSP and the bearer is locked to the
  device — Sprint 2 ensures that an active session cannot survive a password
  change, an unverified email cannot connect Mono, and a phished
  `<img src="https://api/me">` cannot leak login state cross-origin.
- **H5, H7** are **paper-cut hardening** (config drift and a stale dev scheme)
  that take less than half a day each and remove latent regression risk.
- **H9** caps the only outbound-cost endpoint that can be triggered by a quota
  bypass; it pairs well with Sprint 1 because the quota plumbing it touches
  also receives the per-user-USD column.
- **M1, M3** are the Medium items that share blast radius with Sprint 1 — they
  ride along to keep the security log-redaction story complete in one PR
  rather than dragging into a Sprint 3 cleanup.

## Dependencies and risks

- **Better Auth helper compatibility** — H3 relies on
  `auth.api.revokeOtherSessions` from Better Auth. Confirm version in
  `apps/server/package.json` before starting; if the helper is not exposed, fall
  back to a custom DB delete with a Drizzle query.
- **`exp://` impact on Expo dev** — H5 must remain enabled for non-production
  environments. Use `process.env.NODE_ENV === "production"` to gate.
- **Vercel single-source-of-truth** — H7 needs a Vercel project setting
  inspection (Project → Settings → Root Directory) before deleting either file.
- **Email-verification UX** — H6 changes signup flow; coordinate with web/mobile
  to render the "verify your email" state.

## Success metrics

- **H3:** changing password invalidates all other sessions within 30 s in
  staging integration test.
- **H5:** in production `getTrustedOrigins()` returns no `exp://` entry.
- **H6:** new sign-ups receive a verification email; `connectMonoAccount` rejects
  with 403 if `email_verified=false`.
- **H7:** only one `vercel.json` exists in repo; CI fails if a duplicate is
  added.
- **H8:** `/api/me` and `/api/mono/*` respond with `Cross-Origin-Resource-Policy:
same-origin`; `/api/health`, `/api/web-vitals`, `/api/csp-report` keep
  `cross-origin`.
- **H9:** Synthetic load test of 200 × 10 MB requests stops at the per-user USD
  cap with `429`s, not at the rate-limiter alone.
- **M1:** `CSP_DISABLE` no longer exists in `apps/server/src/http/security.ts`;
  CSP can only be relaxed by code change + redeploy.
- **M3:** Pino access-log of a forged `X-Mono-Webhook-Secret` header shows
  `[Redacted]` for both header and `req.url`.

## Cross-references

- [`./README.md`](./README.md) — full backlog index.
- [`./sprint-1.md`](./sprint-1.md) — preceding sprint (C1, C2, H1, H2).
- [`../vulnerability-sla.md`](../vulnerability-sla.md) — High SLA = 14 days.
