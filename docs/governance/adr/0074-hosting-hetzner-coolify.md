# ADR-0074: Backend hosting — Hetzner VPS and Coolify

- **Status:** Accepted
- **Date:** 2026-07-11
- **Last validated:** 2026-10-10 by @claude
- **Next review:** 2027-03-04
- **Deciders:** @SkOrDs-02
- **Supersedes:** ADR-0009 (backend portion; Vercel edge topology remains)
- **Related:** [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md), [ADR-0089](./0089-job-substrates-outbox-broker-timer.md), [`.github/workflows/deploy-api.yml`](../../../.github/workflows/deploy-api.yml), [`Dockerfile.api`](../../../Dockerfile.api)

## Decision

The Sergeant API, Postgres, and Redis run on one Hetzner VPS under Coolify.
The server image is built and published through GHCR by the API deployment
workflow. The web application remains on Vercel, which keeps the same-origin
`/api/*` edge-proxy contract through `BACKEND_URL`.

This decision deliberately assumes a single API instance. In-process work such
as SSE fan-out, timers, and selected queues is valid only within that boundary;
multi-instance scale requires the explicit fan-out and job-substrate review in
ADR-0065 and ADR-0089.

## Operational constraints

- Coolify deployment/webhook configuration is environment state, not a claim
  made true by the GitHub workflow alone.
- Database backups/restores, TLS, proxy trust, and a stable public webhook URL
  remain operating responsibilities and must be verified in the deployment
  environment.
- Railway-specific guidance is historical unless a document explicitly says it
  still applies to the Vercel edge layer.

## Client IP behind the Vercel edge (rel-03)

Open question closed: the Vercel edge proxy is **not** transparent for the
client address. Express (`trust proxy` = 1, the `TRUST_PROXY` fallback)
resolves `req.ip` to the Vercel egress node, so every per-IP bucket (auth
5/60 s fail-closed, anonymous AI quota) was shared by all web users on that
node. `TRUST_PROXY` is deliberately left untouched: raising the hop count
would trust a client-appendable `X-Forwarded-For` tail.

Decision (owner, 2026-10): a **signed client-IP header**.
`apps/web/middleware.ts` strips any incoming `x-sergeant-client-ip` /
`x-sergeant-client-ip-sig`, takes the first `x-forwarded-for` value (Vercel
overwrites it) and sends `x-sergeant-client-ip` plus
`x-sergeant-client-ip-sig = base64url(HMAC-SHA256(SERGEANT_CLIENT_IP_SECRET, ip))`.
The secret never travels in a header. The API trusts the header only on a
timing-safe signature match (`apps/server/src/http/clientIp.ts`); otherwise it
uses `req.ip`. One resolver feeds `getIp()` (rate limits, anonymous AI quota),
the access log, session-fingerprint drift and Better Auth
(`advanced.ipAddress.ipAddressHeaders`). Without the secret on either side the
behaviour is exactly the previous one, so the code can ship before the owner
sets the variables (backend first, then Vercel). The signature binds the IP
only, no timestamp: a replayed pair can only claim the very IP it was issued
for. Residual: a request that reaches the API directly (not via Vercel) keeps
`req.ip` semantics. See [`env-vars.md`](../../engineering/integrations/env-vars.md).

## Consequences

New deployment documentation must describe the current Coolify/Vercel split.
Moving to another host, adding replicas, or changing the edge/proxy boundary
requires this record and its runbooks to be revisited together.
