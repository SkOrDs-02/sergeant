# Disaster Recovery

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
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
