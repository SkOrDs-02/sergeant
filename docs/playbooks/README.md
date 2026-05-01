# Playbooks

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Playbooks are the canonical execution layer for repeatable tasks in Sergeant. Skills decide the governing surface and repo rules; playbooks define the execution order.

## Taxonomy

- `delivery` - new features, API work, HubChat tools, product surfaces
- `bugfix/debugging` - CI red, regressions, alerts, flaky tests
- `data/migrations` - schema changes, rollout safety, DB hygiene, restore drills
- `AI/HubChat` - tools, prompts, console agents
- `mobile` - Expo, RN porting, migration progress, mobile releases
- `deploy/ops` - releases, prod hotfixes, incidents, secrets, runtime safety, n8n workflows
- `governance/docs` - hard rules, review, docs upkeep, operating-system hygiene

## Standard for every playbook

Each playbook must include:

- `**Trigger:**`
- owner surface
- required prerequisite docs or skills
- ordered steps
- verification section
- when not to use this playbook
- related playbooks / related skills

## How to use

1. Identify the primary scenario.
2. Open [playbook-catalog.md](./playbook-catalog.md).
3. Use exactly one primary playbook unless the scenario explicitly crosses into another operating class.
4. If the task changes class mid-stream, switch playbooks intentionally and capture that in the PR or incident note.

## Routing

- Agent routing catalog: [docs/superpowers/agent-skills-catalog.md](../superpowers/agent-skills-catalog.md)
- Trigger index: [INDEX.md](./INDEX.md)
- Reviewer checklist: [docs/governance/review-checklist.md](../governance/review-checklist.md)

## Priority playbooks

- [add-api-endpoint.md](./add-api-endpoint.md)
- [add-sql-migration.md](./add-sql-migration.md)
- [add-hubchat-tool.md](./add-hubchat-tool.md)
- [fix-failing-ci.md](./fix-failing-ci.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [investigate-alert.md](./investigate-alert.md)
- [release-web-and-api.md](./release-web-and-api.md)
- [declare-incident.md](./declare-incident.md)
- [restore-from-backup.md](./restore-from-backup.md)
- [port-web-screen-to-mobile.md](./port-web-screen-to-mobile.md)
- [modify-console-agent.md](./modify-console-agent.md)
- [modify-n8n-workflow.md](./modify-n8n-workflow.md)
