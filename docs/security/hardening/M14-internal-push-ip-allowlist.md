# M14 — Internal `/api/push/send` has no IP allowlist

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`/api/push/send` is gated by `requireApiSecret` only. If `INTERNAL_API_KEY`
ever leaks, the attacker can spam push notifications to any user with no
secondary check.

## Recommendation

- Restrict the route to Railway internal CIDR + an explicit IPv4/IPv6
  allowlist for known internal callers.
- Per-target-user rate-limit on send (10/minute even for internal calls).
- Audit log every send: caller, target user, notification type, payload
  hash.

## Correction points

- `apps/server/src/modules/push/push.ts` — IP allowlist middleware before
  the body parser; structured 403 responses on rejection.
- `apps/server/src/http/rateLimit.ts` — secondary `(target_user_id, "push")`
  bucket.
- `apps/server/src/modules/push/audit.ts` (new) — append-only audit log
  table.
- `docs/security/access-matrix.md` — list the allowlisted CIDRs.

## Verification

- **Unit:** request from 1.2.3.4 returns 403 even with valid API secret.
- **Unit:** 11 sends per minute to the same user from the same internal
  caller return 429.
- **Audit:** the new table contains exactly one row per successful send.

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./M9-per-ip-secondary-rate-limit.md`](./M9-per-ip-secondary-rate-limit.md)
