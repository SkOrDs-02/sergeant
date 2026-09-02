# Runbooks

> **Last touched:** 2026-09-02 by @Skords-01. **Next review:** 2026-12-15.
> **Status:** Active

Operational runbooks для on-call та incident-flow-ів — точне «як» для нашого
конкретного infra-сетапу (**Coolify Postgres/Redis/API** на Hetzner — [ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md); legacy Railway notes де ще не переписано). Доповнюють концептуальні плейбуки в [`docs/00-start/playbooks/`](../../00-start/playbooks/README.md):
playbook каже **що** і **коли**, runbook — **як саме** виконати на нашому стеку.

## Документи

| Документ                                                             | Призначення                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`operations-runbook.md`](./operations-runbook.md)                   | Bus-factor doc: як оперувати Sergeant без `@Skords-01` (PR-37). Routing-карта до інших runbook-ів + daily ops.    |
| [`database-backup-restore.md`](./database-backup-restore.md)         | Full-restore-from-backup, pg_dump-snapshot, smoke-tests schema integrity. Storage roadmap PR #049.                |
| [`database-connection-pooling.md`](./database-connection-pooling.md) | pgBouncer transaction-mode deploy-shape, `DATABASE_URL_POOL`, runtime app-pool. Storage roadmap PR #046.          |
| [`encryption-key-rotation.md`](./encryption-key-rotation.md)         | Key-ring rotation для Better Auth (`BETTER_AUTH_TOKEN_ENC_KEY*`) + legacy single-key path для Mono. Hardening H4. |
| [`postgres-read-replica.md`](./postgres-read-replica.md)             | Streaming read-replica + `DATABASE_URL_REPLICA`, прозорий fallback на primary. Storage roadmap PR #047.           |
| [`sync-client-e2e.md`](./sync-client-e2e.md)                         | Phase 1 sync wiring gate — web↔web / web→mobile manual E2E, failure triage, CI smoke commands.                    |
| [`security-events.md`](./security-events.md)                         | Тріаж security-подій з `apps/server/src/obs/securityEvents.ts` (hardening I7).                                    |
| [`db-index-audit-template.md`](./db-index-audit-template.md)         | Шаблон періодичного index-аудиту Postgres; викликається з `operations-runbook.md`.                                |
| [`billing-payments-launch.md`](./billing-payments-launch.md)         | Передумови вмикання `PLATA_ENABLED` / `LIQPAY_ENABLED`: фіскалізація, бойовий токен еквайрингу, post-launch чеки. |

## Runbook vs playbook vs incident workflow

| Папка                                              | Призначення                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/00-start/playbooks/`                         | Канонічна послідовність кроків для repeatable tasks (incident flow, release, hotfix).      |
| `docs/03-operations/runbooks/` (**цей каталог**)   | Точне `how` для нашого infra-стеку — команди, ENV-перемикачі, rollback steps, smoke-tests. |
| `docs/04-governance/security/disaster-recovery.md` | RPO/RTO targets, disaster classes, який runbook вмикається на яку класу інциденту.         |
| `docs/03-operations/postmortems/`                  | Incident retrospectives після того, як runbook відпрацював.                                |

## Як додати новий runbook

1. Назва файлу — `kebab-case`, без дати-префіксу: `<surface>-<operation>.md`
   (`<surface>` = `database` / `redis` / `vercel` / тощо).
2. На початку — `**Last validated:**` + `**Status:**` блок (для freshness-gate).
3. Cross-link з відповідним playbook-ом і `disaster-recovery.md` (RPO/RTO).
4. Cross-link сюди з playbook-у, який вмикає runbook у incident-flow.
5. Додати рядок у таблицю вище.

## Cross-links

- Incident playbooks: [`docs/00-start/playbooks/declare-incident.md`](../../00-start/playbooks/declare-incident.md), [`docs/00-start/playbooks/restore-from-backup.md`](../../00-start/playbooks/restore-from-backup.md), [`docs/00-start/playbooks/test-backup-restore.md`](../../00-start/playbooks/test-backup-restore.md).
- Disaster recovery policy: [`docs/04-governance/security/disaster-recovery.md`](../../04-governance/security/disaster-recovery.md).
- Storage roadmap: [`docs/90-work/planning/storage-roadmap.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md).
