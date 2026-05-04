# Playbook: Test Backup Restore

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

**Trigger:** scheduled recovery rehearsal, backup confidence check, or evidence that snapshots exist but have not been validated recently.

## Owner surface

- Primary surface: recovery readiness
- Governing skill: `sergeant-data-and-migrations`

## Required context

- Review [disaster-recovery.md](../security/disaster-recovery.md) and [service-catalog.md](../architecture/service-catalog.md).

## Steps

### 1. Choose rehearsal scope

- Full database restore, partial restore, or metadata-only validation.
- Pick a representative backup or snapshot from the current cadence.

### 2. Run the rehearsal

- Restore into a safe environment using the concrete commands in [`docs/runbooks/database-backup-restore.md`](../runbooks/database-backup-restore.md) §2.
- Validate connectivity, migration state (§4.1), critical-table row counts (§4.2), and one or two key domain records.
- Measure elapsed time against RTO expectations.

### 3. Capture evidence

- Record backup timestamp, restore duration, and any manual steps that were required.
- If the rehearsal failed or was too slow, open a follow-up issue immediately.

## Verification

- [ ] Backup source identified
- [ ] Restore completed in a safe environment
- [ ] RPO/RTO comparison recorded
- [ ] Follow-up issue created for any gap

## When not to use this playbook

- A live production incident already requires a real restore.
- The task is only rotating secrets or redeploying runtime infrastructure.

## Related playbooks and skills

- [restore-from-backup.md](./restore-from-backup.md)
- [run-weekly-operator-digest.md](./run-weekly-operator-digest.md)
- Skill: `sergeant-deploy-and-observability`
