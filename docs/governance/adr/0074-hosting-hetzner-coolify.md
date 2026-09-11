# ADR-0074: Backend hosting — Hetzner VPS and Coolify

- **Status:** Accepted
- **Date:** 2026-07-11
- **Last validated:** 2026-09-04 by @codex
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

## Consequences

New deployment documentation must describe the current Coolify/Vercel split.
Moving to another host, adding replicas, or changing the edge/proxy boundary
requires this record and its runbooks to be revisited together.
