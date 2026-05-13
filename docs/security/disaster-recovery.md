# Disaster Recovery

> **Last validated:** 2026-05-13 by Codex. **Next review:** 2026-08-11.
> **Status:** Active

Disaster recovery defines how Sergeant recovers from catastrophic runtime or data loss events. This document keeps the expectations lightweight but explicit for a Founder+1 operating model.

## What counts as a disaster

- production database loss, corruption, or unrecoverable migration mistake
- deploy target outage where rollback is unavailable
- auth/session secrets compromise requiring coordinated key rotation
- accidental destructive change to critical automation or integration state
- backup chain cannot be restored when needed

## Recovery targets

| Surface                       | Target RPO   | Target RTO | Notes                                                                             |
| ----------------------------- | ------------ | ---------- | --------------------------------------------------------------------------------- |
| PostgreSQL system of record   | <= 24h       | <= 4h      | Recovery depends on Railway snapshot availability and restore rehearsal freshness |
| Web / API runtime             | <= 1 deploy  | <= 1h      | Prefer redeploy or rollback before infrastructure rebuild                         |
| Mobile distribution lanes     | <= 1 release | <= 24h     | Store propagation can dominate recovery time                                      |
| Console / automation surfaces | <= 24h       | <= 4h      | Secrets and workflow manifests must remain reconstructable                        |

## Minimum controls

- At least one validated restore path for PostgreSQL.
- One documented rollback path for each runtime in [service-catalog.md](../architecture/service-catalog.md).
- Secret rotation procedure ready for auth and provider keys.
- Backup restore drill performed on a regular cadence, not only after incidents.

## Recovery ownership

- Database restore path: `sergeant-data-and-migrations`
- Runtime rollback and verification: `sergeant-deploy-and-observability`
- Secret rotation: follow [rotate-secrets.md](../playbooks/rotate-secrets.md)
- Post-incident learning: [write-postmortem.md](../playbooks/write-postmortem.md)

## Canonical playbooks

- [restore-from-backup.md](../playbooks/restore-from-backup.md)
- [test-backup-restore.md](../playbooks/test-backup-restore.md)
- [hotfix-prod-regression.md](../playbooks/hotfix-prod-regression.md)

## Recovery scenarios

| Scenario                                      | First action                                                                                                     | Canonical runbook                                                                                                             | Target                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| PostgreSQL data loss or corruption            | Stop write-heavy deploys, preserve current snapshot, restore latest verified backup into a fresh database        | [`database-backup-restore.md`](../runbooks/database-backup-restore.md)                                                        | RPO <= 24h, RTO <= 4h            |
| Bad migration on production                   | Do not run `down.sql`; ship a compensating migration or restore into a fresh DB if data is corrupt               | [`database-backup-restore.md`](../runbooks/database-backup-restore.md) + AGENTS.md hard rule #4                               | RTO depends on data impact       |
| Railway API/runtime outage                    | Roll back or redeploy `apps/server` before rebuilding infra; verify `/healthz` and `/health/workers`             | [`operations-runbook.md`](../runbooks/operations-runbook.md)                                                                  | RTO <= 1h                        |
| Vercel web deploy/header regression           | Promote previous green deployment or revert the header PR; verify COOP/COEP/CSP headers                          | [`../deploy/vercel.md`](../deploy/vercel.md)                                                                                  | RTO <= 1h                        |
| n8n workflow corruption or accidental UI edit | Re-import the JSON from `ops/n8n-workflows/`, then validate the manifest and smoke-trigger the affected workflow | [`operations-runbook.md`](../runbooks/operations-runbook.md)                                                                  | RTO <= 4h                        |
| Secret compromise                             | Rotate the provider key, redeploy affected surfaces, and record the incident/exception trail                     | [`rotate-secrets.md`](../playbooks/rotate-secrets.md), [`encryption-key-rotation.md`](../runbooks/encryption-key-rotation.md) | RTO <= 4h for auth/provider keys |

## Drill cadence

- PostgreSQL restore drill: every 6 months, using [`test-backup-restore.md`](../playbooks/test-backup-restore.md).
- Operations table-top: every quarter, start from [`operations-runbook.md`](../runbooks/operations-runbook.md) and walk the five runtime scenarios above.
- After each drill, update this document only if the target, owner, or canonical runbook changed.

## Operational runbooks

- [database-backup-restore.md](../runbooks/database-backup-restore.md) — Railway-specific `pg_dump`/`pg_restore` commands, smoke-test SQL, migration-skew handling (PR #049 docs portion).
- [encryption-key-rotation.md](../runbooks/encryption-key-rotation.md) — Better Auth + Mono token-encryption rotation.
