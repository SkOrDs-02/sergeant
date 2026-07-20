# Планування

> **Last validated:** 2026-07-20 by @cursoragent (code-reconcile: archive shipped specs). **Next review:** 2026-10-18.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів.

> **Як виконувати ці плани батчами:** [`../../00-start/playbooks/execute-planning-batch.md`](../../00-start/playbooks/execute-planning-batch.md) (governing skill `sergeant-planning-batch`).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`specs/`](./specs/) (шаблон: [`specs/TEMPLATE.md`](./specs/TEMPLATE.md)). Scaffolded / Active спеки лишаються тут; Closed — у [`archive/specs/`](./archive/specs/).

> Станом на 2026-07-20 у `specs/` лише `TEMPLATE.md` — усі попередні спеки (UA-billing, coach-correlations, chornylo) змерджені в код і перенесені в архів після code-reconcile.

### Зведені роадмапи

| Документ                                                                         | Скоуп                                                           | Статус                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)                         | План спринтів 9–10: performance / reliability / product-surface | Active — reconcile 2026-07-20; відкриті: S10-T2 + залишки S10-R2/R1/F2/Q1 |
| [`sync-client-wiring.md`](./sync-client-wiring.md)                               | Multi-device op-log wiring після SQLite cut-over                | Active — Phase 1–2 code shipped; Phase 2 verification + Phase 3–4 open    |
| [`sync-client-wiring-phase2-handoff.md`](./sync-client-wiring-phase2-handoff.md) | Phase 2 verification handoff                                    | Active                                                                    |
| [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md)             | Операційний playbook sync wiring                                | Active                                                                    |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                       | План покращення AI-coding workflow                              | Active — skill-trigger evals done; 4 next-blocks open                     |
| [`harness-engineering-v1.md`](./harness-engineering-v1.md)                       | Harness-engineering v1 rollout + follow-ups                     | Active — v1.0.0 shipped; golden-task / freshness-janitor open             |

## Архів

[`archive/`](./archive) — Closed / Reference / Deprecated плани. Індекс батчу — [`archive/README.md`](./archive/README.md). Ключові переноси Batch 2026-07-20 (90-day gate skipped):

- `archive/storage-roadmap.md` + `archive/storage-roadmap/*` — усі 13 stages complete
- `archive/sprint-roadmap-q2q3-2026.md`, `archive/pr-plan-*-2026-05.md`, `archive/tools-research-*`, `archive/tailwind-v4-migration.md`, `archive/dev-stack-roadmap*.md`
- `archive/specs/ponytail-packages-cleanup-2026-07.md`, `archive/founder-feedback-regression-audit-2026-07-17.md`
- **Code-reconcile 2026-07-20 (додатково):** `archive/specs/phase-7-ua-billing.md`, `archive/specs/coach-correlations-chat.md`, `archive/specs/chornylo-visual-direction.md`, `archive/specs/chornylo-post-merge-fixes.md` (+ `chornylo-assets/`)

Конвенція: Status → Archived (read-only), inbound-лінки на `archive/` шлях.
