# Playbook: Зміна або додавання n8n-воркфлоу

> ⚠️ **n8n-шар виведено з репозиторію ([ADR-0090](../../04-governance/adr/0090-n8n-decommissioned.md), 2026-09-02).** Інстанс не працював з 2026-06-28; каталог `ops/n8n-workflows/` <!-- removed -->, валідатор, Plop-генератор і CI-крок прибрано — жодного живого кроку з цього файлу виконувати нема чим. Файл стиснуто до redirect-стаба; повний історичний runbook — у git history цього файлу, workflow-JSON — у [permalink-снапшоті](https://github.com/SkOrDs-02/sergeant/blob/ffdf694cb60dcfeebc2c1de14887c5a8a1d71e6b/ops/n8n-workflows/).

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-02.
> **Status:** Deprecated (n8n decommissioned — ADR-0090)

**Redirect:** періодична задача → серверний таймер або outbox за таблицею вибору в [ADR-0089](../../04-governance/adr/0089-job-substrates-outbox-broker-timer.md); alert у Telegram → server-side shipper (`/api/internal/alerts/send`, [`alert-bot-routing.md`](../../03-operations/observability/alert-bot-routing.md)); деплой/observability-зміни → [`sergeant-deploy-and-observability`](../../../.agents/skills/sergeant-deploy-and-observability/SKILL.md).

## Що лишається чинним

- [ADR-0030](../../04-governance/adr/0030-telegram-reporting-channel-structure.md) — структура Telegram-каналів (вона про канали, не про n8n).
- Серверні `/api/internal/*` роути й `INTERNAL_API_KEY` + HMAC-guard ([`api-internal-hmac.md`](../../04-governance/security/api-internal-hmac.md)) — у них є інші клієнти.

## Споріднені документи

- [ADR-0090](../../04-governance/adr/0090-n8n-decommissioned.md) — decommission rationale і перелік follow-up-ів.
- [ADR-0026](../../04-governance/adr/0026-n8n-workflow-source-of-truth.md) — історичне рішення (superseded).
- [`playbook-catalog.md` § Deprecated redirect anchors](./playbook-catalog.md#deprecated-redirect-anchors).

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#895](https://github.com/Skords-01/Sergeant/pull/895) | fix(agents): полірування агентного шару після розкатки module-owners | 2026-08-28 |
| [#892](https://github.com/Skords-01/Sergeant/pull/892) | feat(agents): module-owner і службові Claude-агенти                  | 2026-08-27 |
| [#891](https://github.com/Skords-01/Sergeant/pull/891) | feat(agents): скіли-дисципліни                                       | 2026-08-27 |
| [#890](https://github.com/Skords-01/Sergeant/pull/890) | feat(agents): інфра module-скіли і nested-роутинг                    | 2026-08-27 |
| [#889](https://github.com/Skords-01/Sergeant/pull/889) | feat(agents): продуктові module-owner скіли                          | 2026-08-27 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 5 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
