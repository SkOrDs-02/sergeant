# M2 — `trust proxy = 1` is hard-coded

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04) — PR [#1682](https://github.com/Skords-01/Sergeant/pull/1682)

| Field          | Value                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                                                                                                                                           |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                                                                                                        |
| **Owner**      | backend                                                                                                                                                                                                                          |
| **Effort**     | 0.25 person-day                                                                                                                                                                                                                  |
| **Status**     | Closed (2026-05-04) — PR [#1682](https://github.com/Skords-01/Sergeant/pull/1682)                                                                                                                                                |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                                  |
| **Resolved**   | `parseTrustProxy` lives in `apps/server/src/lib/trustProxy.ts`; `config.ts` reads `TRUST_PROXY` env-var; `apps/server/README.md` + `.env.example` document the env-var matrix. `TRUST_PROXY=true` is rejected at boot by policy. |

## Summary

`apps/server/src/app.ts` calls `app.set("trust proxy", 1)`, trusting exactly
one proxy hop (Railway). Any future architecture change — adding Cloudflare
WAF, an ALB, or a second internal proxy — silently turns `req.ip` into a
client-controlled value, which makes every rate-limit and audit log spoofable.

## Recommendation

- Read `process.env.TRUST_PROXY` at startup (default `"1"`); accept either an
  integer (number of hops) or a comma-separated allowlist of CIDR blocks.
- Document in `apps/server/README.md` and `docs/deploy/`.

## Correction points

- `apps/server/src/app.ts` — replace literal `1` with parsed env-var.
- `.env.example` — add `TRUST_PROXY=1`.
- `apps/server/README.md` — describe how to update the value when a new edge
  layer is introduced.

## Verification

- **Unit:** with `TRUST_PROXY=2` set, `req.ip` resolves to the client IP
  beyond two `X-Forwarded-For` hops in a Supertest fixture.
- **Manual:** in staging behind two proxies, `req.ip` matches the synthetic
  client address.

## Cross-references

- [`./M9-per-ip-secondary-rate-limit.md`](./M9-per-ip-secondary-rate-limit.md)
- [`./M14-internal-push-ip-allowlist.md`](./M14-internal-push-ip-allowlist.md)
