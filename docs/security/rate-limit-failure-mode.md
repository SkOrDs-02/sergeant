# Rate-limit failure mode

> **Status:** Active
> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.

## TL;DR

The rate-limit middleware tries three backends in order: **Redis → Postgres → in-memory**. The first two are horizontally consistent across replicas; the third is per-process. Up until PR-02, every route silently fell through to the in-memory bucket on a backend outage — which on multi-replica deploys silently inflates the effective limit by `N×`.

PR-02 introduces a `failMode` option per route:

| Mode             | Used by                                                 | When Redis+PG both fail                                       |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `closed`         | `/api/auth/*` (sign-in, sign-up, forget/reset-password) | Refuse with `503 Service Unavailable` + `Retry-After: 5`      |
| `open` (default) | everything else (health, public reads, AI, sync, …)     | Degrade to per-process in-memory bucket and serve the request |

Both transitions are recorded on the `rate_limit_degraded_total{key,mode}` Prometheus counter so you can alert on a degraded production limiter.

## Why fail-closed for `/api/auth/*`

The current sensitive-auth limit is **20 hits / 60 s**. On a 3-replica Railway deploy, an in-memory fallback means each replica counts independently → effective `60 hits / 60 s`. For credential-stuffing or password-reset abuse this is a 3× acceleration that lasts as long as Redis stays down.

Fail-closed is the canonical OWASP ASVS 2.2.1 stance:

> "Authentication failure response shall not leak rate-limit state."

A 503 with `Retry-After` does not leak per-bucket state and does not let the attacker accumulate attempts while the backend recovers.

## Why fail-open everywhere else

Public read APIs (`/api/health`, `/api/env`, food/barcode lookups, AI quota check) carry the opposite trade-off: blocking a real user is worse than letting an abuser through 3× the limit for the few minutes it takes Redis to recover. The in-memory bucket still rate-limits the obvious spike — a single replica's `Map` will trip on a botnet hammering one IP.

`AI_QUOTA_*` is its own subsystem (not this middleware) and has its own fail-open semantics tracked in `aiQuotaFailOpenTotal`.

## Configuration

```bash
# Default: ON. Set to "0" / "false" to disable fail-closed and revert
# to silent in-memory degradation.
RATE_LIMIT_FAIL_CLOSED_AUTH=true
```

The flag is wired in `apps/server/src/http/authMiddleware.ts`:

```ts
rateLimitExpress({
  key: "api:auth:sensitive",
  limit: 20,
  windowMs: 60_000,
  failMode: env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open",
})(req, res, next);
```

When the flag is `false`, the auth route inherits the default `open` behavior — useful as an emergency kill-switch if Redis blips routinely take Postgres down with them and start producing false-positive 503s.

## Observability

### Metric: `rate_limit_degraded_total`

```
rate_limit_degraded_total{key, mode}
  mode=inmem   # served via in-memory bucket (failMode=open)
  mode=closed  # refused with 503 (failMode=closed)
```

**Recommended alert** (Grafana / Alertmanager):

```promql
sum by (key, mode) (rate(rate_limit_degraded_total[5m])) > 0
```

Sustained >5 min on **any** key is an obs event — both modes mean Redis AND Postgres failed simultaneously, which is a backend outage you want to know about regardless of which mode the route runs in.

### Logs

The one-shot `rate_limit_pg_table_missing` warn fires when migration `037_rate_limit_buckets.sql` hasn't been applied. After that point, transient Postgres errors degrade silently — the warn is enough to flag the schema gap without spamming on every request.

## Failure-mode walkthrough

| Scenario                          | `/api/auth/*` (closed)                                                 | `/api/health` (open)                                                        |
| --------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Redis OK                          | 200/429 (Redis-backed)                                                 | 200/429 (Redis-backed)                                                      |
| Redis down, PG OK                 | 200/429 (PG-backed)                                                    | 200/429 (PG-backed)                                                         |
| Redis down, PG schema missing     | **503** + `Retry-After: 5`, `rate_limit_degraded_total{mode=closed}++` | 200/429 (in-memory, per-replica), `rate_limit_degraded_total{mode=inmem}++` |
| Redis down, PG connection refused | **503**                                                                | 200/429 (in-memory)                                                         |
| Both up but limit hit             | 429 (canonical)                                                        | 429 (canonical)                                                             |

## Out of scope

- **Edge rate-limit** (Vercel Edge / Cloudflare Workers) — separate ADR. Pre-Express limiter would close the auth-route window even when the origin is offline; tracked alongside PR-09 (CDN policy).
- **Changing the base `AUTH_RATE_LIMIT_MAX`** — that's a security review of the limit value itself, not the failure mode.
- **Per-account locking** after N failed sign-ins — different control (account state, not request state); tracked under PR-10 (Better Auth security review).

## Refs

- OWASP ASVS 2.2.1 — Authentication failure response
- [Stripe "fail-closed" pattern](https://stripe.com/blog/idempotency)
- `apps/server/src/http/rateLimit.ts` — implementation
- `apps/server/src/http/rateLimit.test.ts` — `rateLimitExpress — fail-closed mode` describe block
