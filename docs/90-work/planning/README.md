# Планування

> **Last validated:** 2026-07-20 by @cursor (fast-forward archive sweep). **Next review:** 2026-10-18.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів.

> **Як виконувати ці плани батчами:** [`../../00-start/playbooks/execute-planning-batch.md`](../../00-start/playbooks/execute-planning-batch.md) (governing skill `sergeant-planning-batch`).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`specs/`](./specs/) (шаблон: [`specs/TEMPLATE.md`](./specs/TEMPLATE.md)). Scaffolded / Active спеки лишаються тут; Closed — у [`archive/specs/`](./archive/specs/).

### Зведені роадмапи

| Документ                                                                         | Скоуп                                                           | Статус |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)                         | План спринтів 9–10: performance / reliability / product-surface | Active |
| [`sync-client-wiring.md`](./sync-client-wiring.md)                               | Multi-device op-log wiring після SQLite cut-over                | Active |
| [`sync-client-wiring-phase2-handoff.md`](./sync-client-wiring-phase2-handoff.md) | Phase 2 verification handoff                                    | Active |
| [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md)             | Операційний playbook sync wiring                                | Active |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                       | План покращення AI-coding workflow                              | Active |
| [`harness-engineering-v1.md`](./harness-engineering-v1.md)                       | Harness-engineering v1 rollout + follow-ups                     | Active |

## Архів

[`archive/`](./archive) — Closed / Reference / Deprecated плани (fast-forward 2026-07-20, 90-day gate skipped). Повний список — у каталозі; ключові переноси цього батчу:

- `archive/storage-roadmap.md` + `archive/storage-roadmap/*` — усі 13 stages complete
- `archive/sprint-roadmap-q2q3-2026.md`, `archive/pr-plan-*-2026-05.md`, `archive/tools-research-*`, `archive/tailwind-v4-migration.md`, `archive/dev-stack-roadmap-ff-2026-07-20.md`
- `archive/specs/ponytail-packages-cleanup-2026-07.md`, `archive/founder-feedback-regression-audit-2026-07-17.md`

Конвенція архівації — як і раніше: Status → Archived (read-only), inbound-лінки оновлені на `archive/` шлях.
