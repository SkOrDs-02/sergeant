# Playbook: Restore from Backup

> **Last touched:** 2026-07-21 by @github-actions[bot]. **Next review:** 2026-10-19.
> **Status:** Active

**Trigger:** критичні дані треба відновити після corruption, destructive міграції, provider-інциденту або невідновлюваної втрати runtime-стану.

## Owner surface

- Primary surface: data recovery
- Governing skill: `sergeant-data-and-migrations`

## Required context

- Перегляньте [disaster-recovery.md](../../04-governance/security/disaster-recovery.md), [service-catalog.md](../../02-engineering/architecture/service-catalog.md) і [incident-severity-policy.md](../../04-governance/governance/incident-severity-policy.md).
- Якщо подія активна в production, спершу відкрийте [declare-incident.md](./declare-incident.md).

## Steps

### 1. Заморозьте blast radius

- Зупиніть або поставте на паузу workflow, який продовжує писати поганий стан.
- Вирішіть, чи має сервіс бути degraded, read-only або rolled back до restore.

### 2. Оберіть restore point

- Визначте найновіший backup або snapshot, що відповідає recovery target.
- Підтвердьте, які дані буде втрачено між часом backup і моментом збою.

### 3. Виконайте restore

- За можливості спершу restore у safe environment.
- Перевірте сумісність схеми та стан міграцій.
- Промоутьте відновлений стан лише після того, як таргетовані перевірки пройдуть.

### 4. Reconcile і комунікація

- Поверніть трафік у контрольованому порядку.
- Зафіксуйте вікно втрачених даних, компенсуючі кроки і follow-up дії.

## Verification

- [ ] Timestamp restore point зафіксовано
- [ ] Очікуване вікно data-loss зафіксовано
- [ ] Таргетовані data-integrity перевірки пройдено
- [ ] Incident log або recovery note оновлено

## When not to use this playbook

- Звичайний deploy rollback або вимкнення feature flag вирішить проблему без data restore.
- Задача — лише rehearsal; використовуйте [test-backup-restore.md](./test-backup-restore.md).

## Related playbooks and skills

- Concrete commands: [`docs/03-operations/runbooks/database-backup-restore.md`](../../03-operations/runbooks/database-backup-restore.md) — Coolify Postgres `pg_dump` / `pg_restore` (historical Railway notes у runbook), smoke-test SQL, migration-skew handling.
- [test-backup-restore.md](./test-backup-restore.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [declare-incident.md](./declare-incident.md)
- Skill: `sergeant-deploy-and-observability`

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                      | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ---------- |
| [#382](https://github.com/Skords-01/Sergeant/pull/382) | test(server): raise business module coverage (+1.45pp lines, branch lifts) | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
