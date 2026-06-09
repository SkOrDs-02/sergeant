# M9 — Mass-account abuse can scale per-user rate-limits linearly

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Closed (2026-06-01)

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Closed (2026-06-01)             |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/server/src/http/rateLimit.ts` keys per-user when a session is
present and per-IP otherwise. An attacker with N free accounts gets N
separate buckets from the same machine, multiplying their effective rate by
N. The per-IP fallback alone fails to clamp this because it only fires
without a session.

## Recommendation

- Add a **secondary per-IP bucket** that always applies on top of the
  per-user bucket (whichever exhausts first wins).
- For anonymous public routes, key on `(IP, ASN)` instead of bare IP so a
  small CGNAT pool does not get DDoS'ed by one bad actor.

## Implementation

Resolved in PR `fix(server): add secondary per-IP rate-limit bucket (M9)` on branch `claude/sec-m9-per-ip-rate-limit`.

### What was done

- Extended `RateLimitOptions` with `ipLimit?: number` — optional secondary per-IP cap.
- Added `checkSecondaryIpBucket` (Redis→Postgres→in-memory fallback, same chain as primary).
- `rateLimitExpress` now enforces the secondary IP bucket after the primary per-user bucket: **whichever exhausts first returns 429**. The secondary only activates for authenticated (`u:`) subjects; anonymous requests already key by IP on the primary bucket.
- Added `blockedBy: "user" | "ip"` field to `RateLimitResult`. The 429 response payload now carries a distinguishable `code`:
  - `RATE_LIMIT_IP` — secondary per-IP bucket exhausted (multi-account abuse path)
  - `RATE_LIMIT_USER` — primary per-user bucket exhausted (normal per-account cap)
- Added `RATE_LIMIT_IP_MAX` env var (default **200 r/min**) — conservative for NAT/CGNAT environments (~3.3 r/s per IP), sufficient to clamp scripted multi-account abuse.

### Default limits chosen

| Bucket                 | Default                           | Env var             | Rationale                                                                                                         |
| ---------------------- | --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Per-user (primary)     | per-route (e.g. 100 r/min global) | `RATE_LIMIT_MAX`    | unchanged                                                                                                         |
| Per-IP (secondary, M9) | **200 r/min**                     | `RATE_LIMIT_IP_MAX` | 5 accounts × 40 r/min each comfortably fits; office/household NAT users unlikely to exceed 200 r/min collectively |

### Migration

No SQL migration needed. The secondary IP bucket reuses the existing `rate_limit_buckets` table via the composite key `(rl_key, subject)` — `${key}:ip` as `rl_key` and `ip:<addr>` as subject. No schema change.

### Deferred scope

- **(IP, ASN) keying for CGNAT fairness** — requires an ASN datasource that this repo does not have. Left as `// TODO(M9): (IP,ASN) keying for CGNAT fairness — needs ASN datasource, deferred` in `rateLimit.ts`. The per-IP secondary bucket already closes the core finding (clamps the linear multiplication).

## Correction points (resolved)

- `apps/server/src/http/rateLimit.ts` — `ipLimit` option, `checkSecondaryIpBucket`, M9 block in `rateLimitExpress`, `blockedBy` field on `RateLimitResult`.
- `apps/server/src/env/env.ts` — `RATE_LIMIT_IP_MAX` env var (default 200).
- `apps/server/src/http/rateLimit.test.ts` — "secondary IP bucket (M9)" suite including M9 regression test (5 users × IP bucket exhausted first) and `RATE_LIMIT_IP` vs `RATE_LIMIT_USER` code differentiation.
- No SQL migration required (buckets are keyed in Redis/Postgres via existing composite key).

## Verification

- **Unit (passed):** 5 authed users × 2 req/each = 10 requests fill `ipLimit=10`; the 11th request is blocked with `code: "RATE_LIMIT_IP"`, not `RATE_LIMIT_USER`.
- **Distinguishable reason:** per-user bucket exhaustion → `RATE_LIMIT_USER`; IP bucket exhaustion → `RATE_LIMIT_IP`.

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./M14-internal-push-ip-allowlist.md`](./M14-internal-push-ip-allowlist.md)
