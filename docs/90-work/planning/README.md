# Планування

> **Last validated:** 2026-07-20 by @cursoragent (S10-Q1 + harness follow-ups closed). **Next review:** 2026-10-18.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів.

> **Як виконувати ці плани батчами:** [`../../00-start/playbooks/execute-planning-batch.md`](../../00-start/playbooks/execute-planning-batch.md) (governing skill `sergeant-planning-batch`).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`specs/`](./specs/) (шаблон: [`specs/TEMPLATE.md`](./specs/TEMPLATE.md)). Scaffolded / Active спеки лишаються тут; Closed — у [`archive/specs/`](./archive/specs/).

> Станом на 2026-07-25 у `specs/` живі: `anonymous-local-first-persistence.md`, `keyboard-and-scroll.md`, `test-observations-fixes-ab.md` (+ `TEMPLATE.md`). Спеки UA-billing / coach-correlations / chornylo перенесені в архів після code-reconcile 2026-07-20; шість спек knowledge-аудиту (`product-knowledge-audit*.md`) — у `archive/specs/` після Batch 2026-07-25, бо їхній делівербл (diff-звіти) уже лежить у [`../audits/`](../audits/README.md).

### Зведені роадмапи

| Документ                                                             | Скоуп                                                           | Статус                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)             | План спринтів 9–10: performance / reliability / product-surface | Active — reconcile 2026-07-20; відкриті: S10-T2 + залишки S10-R2/R1/F2/Q1        |
| [`sync-client-wiring.md`](./sync-client-wiring.md)                   | Multi-device op-log wiring після SQLite cut-over                | Active — Phase 1–2 code shipped; Phase 2 verification + Phase 3–4 open           |
| [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md) | Операційний playbook sync wiring                                | Active                                                                           |
| [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)     | ~55 задач у 6 хвилях за підсумками knowledge-аудиту 6 модулів   | Active — хвилі 0–3 = передумова invite-gate                                      |
| [`product-brainstorm-2026-07.md`](./product-brainstorm-2026-07.md)   | Продуктовий брейншторм: напрями після knowledge-аудиту          | Active                                                                           |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)           | План покращення AI-coding workflow                              | Active — 4 блоки `next` (PR-template sampling, operator dashboards, privacy ops) |
| [`harness-engineering-v1.md`](./harness-engineering-v1.md)           | Harness-engineering v1 rollout + follow-ups                     | Reference — v1 rollout завершено 2026-06-29                                      |

## Архів

[`archive/`](./archive) — Closed / Reference / Deprecated плани. Індекс батчу — [`archive/README.md`](./archive/README.md). Ключові переноси Batch 2026-07-20 (90-day gate skipped):

- `archive/storage-roadmap.md` + `archive/storage-roadmap/*` — усі 13 stages complete
- `archive/sprint-roadmap-q2q3-2026.md`, `archive/pr-plan-*-2026-05.md`, `archive/tools-research-*`, `archive/tailwind-v4-migration.md`, `archive/dev-stack-roadmap*.md`
- `archive/specs/ponytail-packages-cleanup-2026-07.md`, `archive/founder-feedback-regression-audit-2026-07-17.md`
- **Code-reconcile 2026-07-20 (додатково):** `archive/specs/phase-7-ua-billing.md`, `archive/specs/coach-correlations-chat.md`, `archive/specs/chornylo-visual-direction.md`, `archive/specs/chornylo-post-merge-fixes.md` (+ `chornylo-assets/`)

**Batch 2026-07-25** (розчистка активної зони):

- `archive/specs/product-knowledge-audit*.md` — шість спек knowledge-аудиту (finyk, fizruk, hub-coach, nutrition, overview, routine); делівербл кожної — diff-звіт у [`../audits/`](../audits/README.md), а зведення фіксів — [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)
- `archive/sync-client-wiring-phase2-handoff.md` — Phase 2 залита в код, handoff спожитий; живий трек лишається в [`sync-client-wiring.md`](./sync-client-wiring.md)
- `archive/ci-main-green-2026-07-21.md` — Closed

Конвенція: Status → Archived (read-only), inbound-лінки на `archive/` шлях.
