# Playbook: Restore from Backup

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** critical data must be recovered after corruption, destructive migration, provider incident, or unrecoverable runtime state loss.

## Owner surface

- Primary surface: data recovery
- Governing skill: `sergeant-data-and-migrations`

## Required context

- Review [disaster-recovery.md](../security/disaster-recovery.md), [service-catalog.md](../architecture/service-catalog.md), and [incident-severity-policy.md](../governance/incident-severity-policy.md).
- If the event is active in production, open [declare-incident.md](./declare-incident.md) first.

## Steps

### 1. Freeze the blast radius

- Stop or pause the workflow that keeps writing bad state.
- Decide whether service should be degraded, read-only, or rolled back before restore.

### 2. Select restore point

- Identify the newest backup or snapshot that satisfies the recovery target.
- Confirm what data will be lost between backup time and failure time.

### 3. Execute restore

- Restore into a safe environment first when time permits.
- Validate schema compatibility and migration state.
- Promote the restored state only after targeted checks pass.

### 4. Reconcile and communicate

- Re-enable traffic in a controlled order.
- Record lost-data window, compensating steps, and follow-up actions.

## Verification

- [ ] Restore point timestamp recorded
- [ ] Expected data-loss window recorded
- [ ] Targeted data integrity checks passed
- [ ] Incident log or recovery note updated

## When not to use this playbook

- A normal deploy rollback or feature-flag disable will solve the issue without data restore.
- The task is only a rehearsal; use [test-backup-restore.md](./test-backup-restore.md).

## Related playbooks and skills

- [test-backup-restore.md](./test-backup-restore.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [declare-incident.md](./declare-incident.md)
- Skill: `sergeant-deploy-and-observability`
