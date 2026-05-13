# Access Policy

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Canonical policy for privileged access in Sergeant. This policy is optimized for a Founder+1 operating model: minimal ceremony, explicit ownership, and zero reliance on tribal memory.

## Goals

- keep privileged access narrow, named, and reviewable
- ensure every sensitive surface has one clear owner
- make grant/revoke/review workflows deterministic
- reduce blast radius when accounts or secrets are compromised

## Access tiers

| Tier     | Meaning                                                                                    | Typical examples                                                                   |
| -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `Tier 0` | Identity, billing, or root recovery access that can lock out or fully recover the business | GitHub owner/admin, domain registrar, app store owner, Stripe/Paddle billing admin |
| `Tier 1` | Production mutation access that can change runtime behavior, data, or release state        | Railway prod, Vercel prod, Postgres prod, Sentry admin, PostHog admin, n8n admin   |
| `Tier 2` | Read-only operational visibility                                                           | logs, dashboards, release views, metrics, Sentry read-only                         |

## Allowed holder types

| Holder type          | Default allowed tiers                              | Notes                                              |
| -------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Founder              | Tier 0, Tier 1, Tier 2                             | Default owner for recovery-critical surfaces       |
| Core engineer        | Tier 1, Tier 2                                     | Tier 0 only if explicitly required for continuity  |
| Temporary contractor | Tier 2 by default, Tier 1 only with expiry         | Never indefinite; must have owner and end date     |
| Machine account / CI | Narrowest possible tier for one documented purpose | Must map to one system function, never to a person |

## Rules

- Least privilege by default. Always choose the lower tier if it can complete the job.
- No shared personal accounts for privileged surfaces.
- Every Tier 0 or Tier 1 surface must have one documented owner in [access-matrix.md](./access-matrix.md).
- Every machine credential must have one documented system purpose in [secret-ownership-register.md](./secret-ownership-register.md).
- Temporary access must have:
  - a named surface
  - business reason
  - owner approving it
  - explicit expiry
- Offboarding or access reduction must revoke vendor access first and rotate secrets if account compromise is plausible.

## Required operating flows

- Access grant: [access-governance.md § Grant privileged access](../playbooks/access-governance.md#1-grant-privileged-access)
- Access revoke: [access-governance.md § Revoke privileged access](../playbooks/access-governance.md#2-revoke-privileged-access)
- Access review: [access-governance.md § Periodic access review](../playbooks/access-governance.md#3-periodic-access-review)
- Suspected compromise: [access-governance.md § Suspected account compromise](../playbooks/access-governance.md#4-suspected-account-compromise)

## Runtime security knobs

- **No runtime CSP kill switch.** As of 2026-05-04 ([M1](./hardening/M1-csp-disable-runtime-flag.md)),
  `CSP_DISABLE` env-var is removed from `apps/server/src/http/security.ts`.
  Disabling Content-Security-Policy in production now requires a code change +
  redeploy (PR + CI), which enforces a git audit trail and four-eyes review.
- The remaining `CSP_REPORT_ONLY=1` flag is the only runtime CSP knob — it
  switches the header to Report-Only mode for phased rollout. It does NOT
  disable CSP; reports are still emitted to the configured `report-uri`.

The general principle: **a single env-var must not silently weaken security
posture without a git-traceable change**. New runtime feature flags MUST go
through code review for both the flag and its callers; "kill switch" patterns
are forbidden unless paired with explicit alerting and documentation here.

## Out of scope

- This policy does not store credentials or secret values.
- This policy does not introduce external IAM in the current phase.
- This policy does not replace runtime incident handling, only privileged-access governance.
