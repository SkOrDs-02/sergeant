# Інструкції Sergeant

> **Last touched:** 2026-09-06 by @Skords-01. **Next review:** 2026-12-15.
> **Status:** Active

Це єдина бібліотека повторюваних процедур Sergeant. Skills визначають
поверхню та правила, а інструкції — порядок дій. Поле
`Runtime-specific: yes|no` відрізняє переносимі playbook-и від процедур,
привʼязаних до Coolify, Hetzner, Postgres або іншого конкретного runtime.

## Жанри

- `delivery` - new features, API work, HubChat tools, product surfaces
- `bugfix/debugging` - CI red, regressions, alerts, flaky tests
- `data/migrations` - schema changes, rollout safety, DB hygiene, restore drills
- `AI/HubChat` - tools, prompts, chat executors
- `mobile` - Expo, RN porting, migration progress, mobile releases
- `deploy/ops` - releases, prod hotfixes, incidents, secrets, runtime safety
- `governance/docs` - hard rules, review, docs upkeep, operating-system hygiene, access governance
- `runtime operations` — backup/restore, connection pooling, key rotation,
  replica, security events та операторська routing-карта

## Стандарт

Each playbook must include:

- `**Trigger:**`
- owner surface
- required prerequisite docs or skills
- ordered steps
- verification section
- when not to use this playbook
- related playbooks / related skills

Кожен виконуваний файл також має `> **Runtime-specific:** yes|no`. Значення
`yes` вимагає перед виконанням звірити фактичний hosting/runtime; `no` означає,
що процедура описує репозиторний workflow без залежності від середовища.

## How to use

1. Identify the primary scenario.
2. Open [playbook-catalog.md](./playbook-catalog.md).
3. Use exactly one primary playbook unless the scenario explicitly crosses into another operating class.
4. If the task changes class mid-stream, switch playbooks intentionally and capture that in the PR or incident note.

## Routing

- Agent routing catalog: [docs/start/agents/agent-skills-catalog.md](../agents/agent-skills-catalog.md)
- Trigger index: [INDEX.md](./INDEX.md)
- Reviewer checklist: [docs/governance/governance/review-checklist.md](../../governance/governance/review-checklist.md)
- Runtime-процедури: [operations-runbook.md](./operations-runbook.md),
  [database-backup-restore.md](./database-backup-restore.md),
  [database-connection-pooling.md](./database-connection-pooling.md),
  [encryption-key-rotation.md](./encryption-key-rotation.md),
  [postgres-read-replica.md](./postgres-read-replica.md),
  [security-events.md](./security-events.md),
  [sync-client-e2e.md](./sync-client-e2e.md)

## Priority playbooks

- [add-api-endpoint.md](./add-api-endpoint.md)
- [add-sql-migration.md](./add-sql-migration.md)
- [add-hubchat-tool.md](./add-hubchat-tool.md)
- [fix-failing-ci.md](./fix-failing-ci.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [investigate-alert.md](./investigate-alert.md)
- [release.md](./release.md)
- [cleanup-codex-branch-after-pr.md](./cleanup-codex-branch-after-pr.md)
- [declare-incident.md](./declare-incident.md)
- [restore-from-backup.md](./restore-from-backup.md)
- [access-governance.md](./access-governance.md)
- [port-web-screen-to-mobile.md](./port-web-screen-to-mobile.md)
- [write-e2e-test.md](./write-e2e-test.md)
- [change-auth-flow.md](./change-auth-flow.md)
- [author-skill.md](./author-skill.md)
