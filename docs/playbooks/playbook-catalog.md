# Playbook Catalog

> **Last validated:** 2026-05-18 by @codex. **Next review:** 2026-08-16.
> **Status:** Active

Scenario catalog: which playbook to open, which skill governs the work, and whether the document is primarily for humans, agents, or both.

| Scenario                                       | Playbook                                                                 | Governing skill                                         | Primary user  |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| Add a new API endpoint                         | [`add-api-endpoint.md`](./add-api-endpoint.md)                           | `sergeant-server-api`                                   | Human + agent |
| Add or change DB schema                        | [`add-sql-migration.md`](./add-sql-migration.md)                         | `sergeant-data-and-migrations`                          | Human + agent |
| Add or change HubChat tool                     | [`add-hubchat-tool.md`](./add-hubchat-tool.md)                           | `sergeant-hubchat`                                      | Human + agent |
| Fix red CI on a PR                             | [`fix-failing-ci.md`](./fix-failing-ci.md)                               | `sergeant-bugfix-and-regression`                        | Human + agent |
| Respond to a prod regression                   | [`hotfix-prod-regression.md`](./hotfix-prod-regression.md)               | `sergeant-deploy-and-observability`                     | Human + agent |
| Investigate an alert or degradation            | [`investigate-alert.md`](./investigate-alert.md)                         | `sergeant-deploy-and-observability`                     | Human + agent |
| Ship any production release                    | [`release.md`](./release.md)                                             | `sergeant-deploy-and-observability`                     | Human + agent |
| Change deploy-config (vercel/fly/etc)          | [`deploy-config-change.md`](./deploy-config-change.md)                   | `sergeant-deploy-and-observability`                     | Human + agent |
| Declare a production incident                  | [`declare-incident.md`](./declare-incident.md)                           | `sergeant-deploy-and-observability`                     | Human + agent |
| Any privileged access governance event         | [`access-governance.md`](./access-governance.md)                         | `sergeant-review-and-merge`                             | Human + agent |
| Write a postmortem                             | [`write-postmortem.md`](./write-postmortem.md)                           | `sergeant-review-and-merge`                             | Human + agent |
| Retire a feature flag                          | [`retire-feature-flag.md`](./retire-feature-flag.md)                     | `sergeant-review-and-merge`                             | Human + agent |
| Restore from backup                            | [`restore-from-backup.md`](./restore-from-backup.md)                     | `sergeant-data-and-migrations`                          | Human + agent |
| Run a backup restore rehearsal                 | [`test-backup-restore.md`](./test-backup-restore.md)                     | `sergeant-data-and-migrations`                          | Human + agent |
| Run weekly operator review                     | [`run-weekly-operator-digest.md`](./run-weekly-operator-digest.md)       | `sergeant-review-and-merge`                             | Human + agent |
| Port a web screen to mobile                    | [`port-web-screen-to-mobile.md`](./port-web-screen-to-mobile.md)         | `sergeant-mobile-expo` + `sergeant-monorepo-boundaries` | Human + agent |
| Modify or add a console agent                  | [`modify-console-agent.md`](./modify-console-agent.md)                   | `sergeant-hubchat`                                      | Human + agent |
| Modify or add an n8n workflow                  | [`modify-n8n-workflow.md`](./modify-n8n-workflow.md)                     | `sergeant-deploy-and-observability`                     | Human + agent |
| Cutover OpenClaw to external Gateway           | [`cutover-openclaw-gateway.md`](./cutover-openclaw-gateway.md)           | `sergeant-deploy-and-observability`                     | Human + agent |
| Clean up Codex branch after merged PR          | [`cleanup-codex-branch-after-pr.md`](./cleanup-codex-branch-after-pr.md) | `sergeant-review-and-merge`                             | Human + agent |
| Review / merge gate                            | [`../governance/review-checklist.md`](../governance/review-checklist.md) | `sergeant-review-and-merge`                             | Human + agent |
| PR review across 3+ governed surfaces          | [`run-squad-review.md`](./run-squad-review.md)                           | `sergeant-review-squad`                                 | Human + agent |
| Cross-surface feature delivery (DB→server→web) | [`run-squad-deliver.md`](./run-squad-deliver.md)                         | `sergeant-deliver-squad`                                | Human + agent |
| Full QA across all surfaces in parallel        | [`run-squad-qa.md`](./run-squad-qa.md)                                   | `sergeant-qa-squad`                                     | Human + agent |
| Validate idea / decision from multiple angles  | [`run-council.md`](./run-council.md)                                     | `sergeant-council`                                      | Human + agent |

## Повний inventory

Curated table вище лишається швидким роутером для найчастіших сценаріїв. Цей inventory показує активні playbook-файли; deprecated redirect anchors винесені нижче й не входять у generated trigger index / core knowledge graph.

| Playbook                                                                           | Trigger                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`add-feature-flag.md`](./add-feature-flag.md)                                     | «Сховай фічу X за прапорцем» / будь-яка нова експериментальна фіча, яку треба вмикати/вимикати без редеплою.                                                                                                                |
| [`add-hard-rule.md`](./add-hard-rule.md)                                           | "Додати новий Hard Rule" / "Додати нову обов'язкову конвенцію" / будь-яке правило, яке потрібно енфорсити для всіх контриб'юторів і AI-агентів.                                                                             |
| [`add-monobank-event-handler.md`](./add-monobank-event-handler.md)                 | "Треба обробити нову подію X від Monobank" / новий тип webhook event / новий статус транзакції від Monobank API.                                                                                                            |
| [`add-new-page-route.md`](./add-new-page-route.md)                                 | "Додати нову сторінку в apps/web" / новий розділ UI / новий route для SPA.                                                                                                                                                  |
| [`add-onboarding-step.md`](./add-onboarding-step.md)                               | «Додай новий крок в онбординг» / зміна послідовності перших кроків нового юзера / новий FTUX-етап.                                                                                                                          |
| [`add-push-notification.md`](./add-push-notification.md)                           | «Надсилай push коли X» / «Додати новий тип сповіщення» / нагадування / реакція на зовнішню подію (Mono webhook, AI insight, scheduler).                                                                                     |
| [`add-react-query-hook.md`](./add-react-query-hook.md)                             | «Дай хук який тягне X з API» / новий useQuery або useMutation у `apps/web` / нова server-state дата.                                                                                                                        |
| [`bump-dep-safely.md`](./bump-dep-safely.md)                                       | "Оновити X до версії Y" / Renovate PR з major-bump / security advisory на залежність.                                                                                                                                       |
| [`cleanup-dead-code.md`](./cleanup-dead-code.md)                                   | «Видали X і всі його використання» / видалення застарілого модуля, компонента, утиліти або feature flag.                                                                                                                    |
| [`cleanup-codex-branch-after-pr.md`](./cleanup-codex-branch-after-pr.md)           | PR merged / "онови main" / "видали гілку" / "поверни local dirty files" після Codex-гілки.                                                                                                                                  |
| [`debug-chat-tool.md`](./debug-chat-tool.md)                                       | «Асистент каже що зробив, але нічого не сталось» / «Натиснув кнопку quick action — нема ефекту» / tool call повернувся текстом замість дії / `Невідома дія: …` у відповіді.                                                 |
| [`enable-prompt-caching.md`](./enable-prompt-caching.md)                           | «Зменшити cost Anthropic» / «Anthropic API занадто дорогий» / `aiTokensTotal{kind="prompt"}` росте лінійно з трафіком, бо стабільні `SYSTEM_PREFIX` і `TOOLS` повторюються на кожному запиті.                               |
| [`fix-exhaustive-deps.md`](./fix-exhaustive-deps.md)                               | "Виправити exhaustive-deps warnings" / ESLint `react-hooks/exhaustive-deps` violations / стале закриття з `apps-web-exhaustive-deps.md`.                                                                                    |
| [`migrate-localstorage-to-typedstore.md`](./migrate-localstorage-to-typedstore.md) | "Мігрувати файл X з прямого localStorage на typedStore" / зменшити TODO-список у ESLint allowlist / `frontend-tech-debt.md` #2.                                                                                             |
| [`onboard-external-api.md`](./onboard-external-api.md)                             | "Інтегрувати нову зовнішню API" / додати новий third-party сервіс / нова банківська інтеграція / новий AI-провайдер.                                                                                                        |
| [`operational-continuity.md`](./operational-continuity.md)                         | @Skords-01 is unavailable (vacation, illness, emergency). You need to keep Sergeant running.                                                                                                                                |
| [`pre-merge-migration-checklist.md`](./pre-merge-migration-checklist.md)           | PR містить файли в `apps/server/src/migrations/` (новий `NNN_*.sql` або зміна існуючого `*.down.sql`).                                                                                                                      |
| [`prettier-pass-on-docs.md`](./prettier-pass-on-docs.md)                           | `pnpm format:check` фейлиться на `docs/**/*.md` / треба прогнати prettier по одному / кільком doc-файлах (як [PR #447](https://github.com/Skords-01/Sergeant/pull/447)).                                                    |
| [`rotate-openclaw-credentials.md`](./rotate-openclaw-credentials.md)               | ротація будь-якого OpenClaw GitHub credential.                                                                                                                                                                              |
| [`rotate-secrets.md`](./rotate-secrets.md)                                         | "Secret leaked" / планова ротація / security audit / підозріла активність.                                                                                                                                                  |
| [`security-pen-test-checklist.md`](./security-pen-test-checklist.md)               | треба підтвердити, що hardening-карта зі статусом `Closed` дійсно закриває описану атаку — наприклад, перед launch readiness gate, перед external pen-test engagement, або як квартальна репетиція pen-test reproduction-у. |
| [`stabilize-flaky-test.md`](./stabilize-flaky-test.md)                             | «Тест X падає 1 з 5 разів» / у CI red, локально green / тест у списку **«Pre-existing flaky tests»** в AGENTS.md.                                                                                                           |
| [`sync-rn-migration-progress.md`](./sync-rn-migration-progress.md)                 | після merge порту web → mobile (див. `port-web-screen-to-mobile.md`) — оновити progress tracker `docs/mobile/react-native-migration.md`.                                                                                    |
| [`tune-system-prompt.md`](./tune-system-prompt.md)                                 | «AI відповідає не так як треба» / «Зміни тон асистента» / «Додай нову інструкцію в системний промпт» / зміна як модель розуміє контекст модулі.                                                                             |

## Deprecated redirect anchors

Ці файли збережені для старих посилань і PR-контексту. Для виконання відкривай canonical playbook у другій колонці.

| Historical file                              | Canonical owner                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `grant-privileged-access.md`                 | [`access-governance.md` § Grant privileged access](./access-governance.md#1-grant-privileged-access)           |
| `release-expo-mobile.md`                     | [`release.md` § Expo](./release.md#3-expo)                                                                     |
| `release-mobile-shell.md`                    | [`release.md` § Mobile shell (Capacitor)](./release.md#2-mobile-shell-capacitor)                               |
| `release-web-and-api.md`                     | [`release.md` § Web + API](./release.md#1-web--api)                                                            |
| `respond-to-suspected-account-compromise.md` | [`access-governance.md` § Suspected account compromise](./access-governance.md#4-suspected-account-compromise) |
| `revoke-privileged-access.md`                | [`access-governance.md` § Revoke privileged access](./access-governance.md#2-revoke-privileged-access)         |
| `run-access-review.md`                       | [`access-governance.md` § Periodic access review](./access-governance.md#3-periodic-access-review)             |

## Notes

- If no row fits cleanly, start with `sergeant-start-here` and choose one primary skill before opening a playbook.
- If a change touches multiple surfaces, pick the playbook for the highest-risk part of the work.
