# Playbook Catalog

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Scenario catalog: which playbook to open, which skill governs the work, and whether the document is primarily for humans, agents, or both.

| Scenario                               | Playbook                                                                 | Governing skill                                         | Primary user  |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| Add a new API endpoint                 | [`add-api-endpoint.md`](./add-api-endpoint.md)                           | `sergeant-server-api`                                   | Human + agent |
| Add or change DB schema                | [`add-sql-migration.md`](./add-sql-migration.md)                         | `sergeant-data-and-migrations`                          | Human + agent |
| Add or change HubChat tool             | [`add-hubchat-tool.md`](./add-hubchat-tool.md)                           | `sergeant-hubchat`                                      | Human + agent |
| Fix red CI on a PR                     | [`fix-failing-ci.md`](./fix-failing-ci.md)                               | `sergeant-bugfix-and-regression`                        | Human + agent |
| Respond to a prod regression           | [`hotfix-prod-regression.md`](./hotfix-prod-regression.md)               | `sergeant-deploy-and-observability`                     | Human + agent |
| Investigate an alert or degradation    | [`investigate-alert.md`](./investigate-alert.md)                         | `sergeant-deploy-and-observability`                     | Human + agent |
| Ship any production release            | [`release.md`](./release.md)                                             | `sergeant-deploy-and-observability`                     | Human + agent |
| Change deploy-config (vercel/fly/etc)  | [`deploy-config-change.md`](./deploy-config-change.md)                   | `sergeant-deploy-and-observability`                     | Human + agent |
| Declare a production incident          | [`declare-incident.md`](./declare-incident.md)                           | `sergeant-deploy-and-observability`                     | Human + agent |
| Any privileged access governance event | [`access-governance.md`](./access-governance.md)                         | `sergeant-review-and-merge`                             | Human + agent |
| Write a postmortem                     | [`write-postmortem.md`](./write-postmortem.md)                           | `sergeant-review-and-merge`                             | Human + agent |
| Retire a feature flag                  | [`retire-feature-flag.md`](./retire-feature-flag.md)                     | `sergeant-review-and-merge`                             | Human + agent |
| Restore from backup                    | [`restore-from-backup.md`](./restore-from-backup.md)                     | `sergeant-data-and-migrations`                          | Human + agent |
| Run a backup restore rehearsal         | [`test-backup-restore.md`](./test-backup-restore.md)                     | `sergeant-data-and-migrations`                          | Human + agent |
| Run weekly operator review             | [`run-weekly-operator-digest.md`](./run-weekly-operator-digest.md)       | `sergeant-review-and-merge`                             | Human + agent |
| Port a web screen to mobile            | [`port-web-screen-to-mobile.md`](./port-web-screen-to-mobile.md)         | `sergeant-mobile-expo` + `sergeant-monorepo-boundaries` | Human + agent |
| Modify or add a console agent          | [`modify-console-agent.md`](./modify-console-agent.md)                   | `sergeant-hubchat`                                      | Human + agent |
| Modify or add an n8n workflow          | [`modify-n8n-workflow.md`](./modify-n8n-workflow.md)                     | `sergeant-deploy-and-observability`                     | Human + agent |
| Cutover OpenClaw to external Gateway   | [`cutover-openclaw-gateway.md`](./cutover-openclaw-gateway.md)           | `sergeant-deploy-and-observability`                     | Human + agent |
| Review / merge gate                    | [`../governance/review-checklist.md`](../governance/review-checklist.md) | `sergeant-review-and-merge`                             | Human + agent |

## Notes

- If no row fits cleanly, start with `sergeant-start-here` and choose one primary skill before opening a playbook.
- If a change touches multiple surfaces, pick the playbook for the highest-risk part of the work.
