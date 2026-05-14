# M14 — Internal `/api/push/send` has no IP allowlist

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784).

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                   |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                |
| **Owner**      | backend                                                                                                  |
| **Effort**     | 0.25 person-day                                                                                          |
| **Status**     | Closed 2026-05-04 — PR [#1784](https://github.com/Skords-01/Sergeant/pull/1784) (batched with M10 + M19) |
| **Discovered** | 2026-05-03 deep security review                                                                          |

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

- `apps/server/src/http/requireInternalIp.ts` (new) — CIDR allowlist via
  `net.BlockList`, env-driven `INTERNAL_PUSH_ALLOWLIST` (IPv4 + IPv6 +
  CIDR). Returns structured 403 (`code: "FORBIDDEN_IP"`) on rejection.
  When the env var is unset the middleware short-circuits to `next()` so
  environments without configured Railway internal CIDRs keep working;
  production sets the var explicitly.
- `apps/server/src/routes/push.ts` — mounts
  `requireInternalIp → requireApiSecret → sendPush`.
- `apps/server/src/modules/push/push.ts::sendPush` — per-target user
  rate-limit (10/min) via `getPerTargetRateLimit`; on 429 the response
  carries `Retry-After`. Successful sends write a `push_send_audit` row
  before fan-out.
- `apps/server/src/modules/push/audit.ts` (new) — `hashPushPayload`
  (deterministic SHA-256 over normalised payload) +
  `recordPushSendAudit` (single INSERT into `push_send_audit`).
- `apps/server/src/migrations/041_push_send_audit.sql` /
  `041_push_send_audit.down.sql` — append-only forensic table.
- `apps/server/src/http/rateLimit.ts` — refactored to expose
  subject-keyed primitives so the per-target check no longer needs a
  synthesised `Request` (kills the `as unknown as Request` lint
  exemption). `rateLimit.test.ts` (49 tests) still passes.

## Verification

- **Unit:** `apps/server/src/http/requireInternalIp.test.ts` — IPv4 +
  IPv6 + CIDR matrix; valid API secret + non-allowlisted IP → 403
  (`FORBIDDEN_IP`); allowlisted IP + valid secret → `next()`.
- **Unit:** `apps/server/src/modules/push/audit.test.ts` —
  `hashPushPayload` is deterministic and order-insensitive;
  `recordPushSendAudit` issues a single parameterised INSERT.
- **Integration:** existing `push.test.ts` exercises the per-target
  rate-limit (11th call within 60 s → 429 + `Retry-After`).
- **Audit:** `push_send_audit` rows are written before fan-out so a
  failed web-push delivery still leaves a forensic trail.

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./M9-per-ip-secondary-rate-limit.md`](./M9-per-ip-secondary-rate-limit.md)
