# M9 — Mass-account abuse can scale per-user rate-limits linearly

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/server/src/http/rateLimit.ts:102–107` keys per-user when a session is
present and per-IP otherwise. An attacker with N free accounts gets N
separate buckets from the same machine, multiplying their effective rate by
N. The per-IP fallback alone fails to clamp this because it only fires
without a session.

## Recommendation

- Add a **secondary per-IP bucket** that always applies on top of the
  per-user bucket (whichever exhausts first wins).
- For anonymous public routes, key on `(IP, ASN)` instead of bare IP so a
  small CGNAT pool does not get DDoS'ed by one bad actor.

## Correction points

- `apps/server/src/http/rateLimit.ts` — extend `pickSubject` to return
  `[primary, secondary]`; consume both buckets atomically in the Lua script.
- `apps/server/src/migrations/03X_rate_limit_buckets_secondary.sql` — new
  column or composite key reflecting the secondary subject.
- `apps/server/src/http/rateLimit.test.ts` — add a regression test where 5
  authed users from the same IP collectively exhaust the IP bucket before
  any individual user bucket.

## Verification

- **Unit:** five users × 50 r/min individually = 250 r/min, but the
  secondary `ip:` bucket caps at 100 r/min and engages first.
- **Load test:** distinguish per-user `429` reasons via the structured
  rate-limit response payload.

## Cross-references

- [`./M2-trust-proxy-parameterize.md`](./M2-trust-proxy-parameterize.md)
- [`./M14-internal-push-ip-allowlist.md`](./M14-internal-push-ip-allowlist.md)
