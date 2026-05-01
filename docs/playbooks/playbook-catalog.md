# Playbook Catalog

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Каталог сценаріїв: який playbook відкривати, який skill має керувати роботою і чи орієнтований документ на людей, агентів чи обох.

| Scenario                          | Playbook                                                                 | Governing skill                                         | Primary user  |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| Додати новий API endpoint         | [`add-api-endpoint.md`](./add-api-endpoint.md)                           | `sergeant-server-api`                                   | Human + agent |
| Додати або змінити DB schema      | [`add-sql-migration.md`](./add-sql-migration.md)                         | `sergeant-data-and-migrations`                          | Human + agent |
| Додати або змінити HubChat tool   | [`add-hubchat-tool.md`](./add-hubchat-tool.md)                           | `sergeant-hubchat`                                      | Human + agent |
| Полагодити червоний CI на PR      | [`fix-failing-ci.md`](./fix-failing-ci.md)                               | `sergeant-bugfix-and-regression`                        | Human + agent |
| Відповідь на прод-регресію        | [`hotfix-prod-regression.md`](./hotfix-prod-regression.md)               | `sergeant-deploy-and-observability`                     | Human + agent |
| Розслідувати alert або деградацію | [`investigate-alert.md`](./investigate-alert.md)                         | `sergeant-deploy-and-observability`                     | Human + agent |
| Перенести web screen у mobile     | [`port-web-screen-to-mobile.md`](./port-web-screen-to-mobile.md)         | `sergeant-mobile-expo` + `sergeant-monorepo-boundaries` | Human + agent |
| Змінити або додати console agent  | [`modify-console-agent.md`](./modify-console-agent.md)                   | `sergeant-hubchat`                                      | Human + agent |
| Змінити або додати n8n workflow   | [`modify-n8n-workflow.md`](./modify-n8n-workflow.md)                     | `sergeant-deploy-and-observability`                     | Human + agent |
| Review / merge gate               | [`../governance/review-checklist.md`](../governance/review-checklist.md) | `sergeant-review-and-merge`                             | Human + agent |

## Примітки

- Якщо жоден рядок не підходить, агент має почати з `sergeant-start-here` і вибрати один primary skill до відкриття playbook.
- Якщо change торкає кілька surfaces, вибери playbook за найризикованішою частиною роботи.
