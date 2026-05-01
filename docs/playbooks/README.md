# Playbooks

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Playbooks - канонічний execution layer для repeatable tasks у Sergeant. Skills вирішують, який surface і які repo rules застосовуються; playbooks кажуть, у якому порядку виконувати роботу.

## Taxonomy

- `delivery` - нові фічі, API, HubChat tools, product surfaces
- `bugfix/debugging` - CI red, regressions, alerts, flaky tests
- `data/migrations` - schema changes, rollout safety, DB hygiene
- `AI/HubChat` - tools, prompts, console agents
- `mobile` - Expo, RN porting, migration progress
- `deploy/ops` - prod hotfixes, secrets, runtime safety, n8n workflows
- `governance/docs` - hard rules, review, docs upkeep

## Стандарт для кожного playbook

Кожен playbook має містити:

- `**Trigger:**`
- owner surface
- required prerequisite docs/skills
- ordered steps
- verification section
- when not to use this playbook
- related playbooks / related skills

## Як користуватися

1. Визнач primary scenario.
2. Відкрий [playbook-catalog.md](./playbook-catalog.md).
3. Якщо є прямий match, використовуй рівно один primary playbook.
4. Якщо задача переходить у інший class проблеми, явно переключись на інший playbook і зафіксуй це в PR.

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
- [port-web-screen-to-mobile.md](./port-web-screen-to-mobile.md)
- [modify-console-agent.md](./modify-console-agent.md)
- [modify-n8n-workflow.md](./modify-n8n-workflow.md)
