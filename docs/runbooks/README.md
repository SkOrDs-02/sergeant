# Runbooks

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

Operational runbooks для on-call та incident-flow-ів — точне «як» для нашого
конкретного infra-сетапу (Railway Postgres, pgBouncer, key-ring, replica).
Доповнюють концептуальні плейбуки в [`docs/playbooks/`](../playbooks/README.md):
playbook каже **що** і **коли**, runbook — **як саме** виконати на нашому стеку.

## Документи

| Документ                                                             | Призначення                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`operations-runbook.md`](./operations-runbook.md)                   | Bus-factor doc: як оперувати Sergeant без `@Skords-01` (PR-37). Routing-карта до інших runbook-ів + daily ops.    |
| [`database-backup-restore.md`](./database-backup-restore.md)         | Full-restore-from-backup, pg_dump-snapshot, smoke-tests schema integrity. Storage roadmap PR #049.                |
| [`database-connection-pooling.md`](./database-connection-pooling.md) | pgBouncer transaction-mode deploy-shape, `DATABASE_URL_POOL`, runtime app-pool. Storage roadmap PR #046.          |
| [`encryption-key-rotation.md`](./encryption-key-rotation.md)         | Key-ring rotation для Better Auth (`BETTER_AUTH_TOKEN_ENC_KEY*`) + legacy single-key path для Mono. Hardening H4. |
| [`postgres-read-replica.md`](./postgres-read-replica.md)             | Streaming read-replica + `DATABASE_URL_REPLICA`, прозорий fallback на primary. Storage roadmap PR #047.           |
| [`openclaw-telegram-tools.md`](./openclaw-telegram-tools.md)         | `read_telegram_topic_history` LLM tool — env-vars, structured errors, smoke-tests (PR-35 / Pain P8).              |
| [`openclaw-morning-briefing.md`](./openclaw-morning-briefing.md)     | Morning-briefing template — 5 hardcoded sections, env-vars matrix, manual smoke-test (PR-26 / Phase 2.A).         |

## Runbook vs playbook vs incident workflow

| Папка                                | Призначення                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `docs/playbooks/`                    | Канонічна послідовність кроків для repeatable tasks (incident flow, release, hotfix).      |
| `docs/runbooks/` (**цей каталог**)   | Точне `how` для нашого infra-стеку — команди, ENV-перемикачі, rollback steps, smoke-tests. |
| `docs/security/disaster-recovery.md` | RPO/RTO targets, disaster classes, який runbook вмикається на яку класу інциденту.         |
| `docs/postmortems/`                  | Incident retrospectives після того, як runbook відпрацював.                                |

## Як додати новий runbook

1. Назва файлу — `kebab-case`, без дати-префіксу: `<surface>-<operation>.md`
   (`<surface>` = `database` / `redis` / `vercel` / тощо).
2. На початку — `**Last validated:**` + `**Status:**` блок (для freshness-gate).
3. Cross-link з відповідним playbook-ом і `disaster-recovery.md` (RPO/RTO).
4. Cross-link сюди з playbook-у, який вмикає runbook у incident-flow.
5. Додати рядок у таблицю вище.

## Cross-links

- Incident playbooks: [`docs/playbooks/declare-incident.md`](../playbooks/declare-incident.md), [`docs/playbooks/restore-from-backup.md`](../playbooks/restore-from-backup.md), [`docs/playbooks/test-backup-restore.md`](../playbooks/test-backup-restore.md).
- Disaster recovery policy: [`docs/security/disaster-recovery.md`](../security/disaster-recovery.md).
- Storage roadmap: [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md).
