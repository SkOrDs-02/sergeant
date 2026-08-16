# Планування

> **Last validated:** 2026-07-29 by Codex (semantic work-tracker reconcile). **Next review:** 2027-10-16.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів.

> **Як виконувати ці плани батчами:** [`../../00-start/playbooks/execute-planning-batch.md`](../../00-start/playbooks/execute-planning-batch.md) (governing skill `sergeant-planning-batch`).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`specs/`](./specs/) (шаблон: [`specs/TEMPLATE.md`](./specs/TEMPLATE.md)). Scaffolded / Active спеки лишаються тут; закриті snapshot-и доступні у Git history.

> Станом на 2026-08-01 у `specs/` три відкриті роботи: `anonymous-local-first-persistence.md` (agent-ready residual), `telegram-waitlist.md` (потрібне founder-рішення) і `silpo-mcp-integration.md` (спека ухвалена founder-ом 2026-07-31: G/H ратифіковано як Pro, хакатон — ні, B/C/D — рівноправні треки; Phase 0-спайк agent-ready; відкриті гейти — оферта Сільпо й формулювання приватності). `goal-progress-auto.md`, `keyboard-and-scroll.md` та `transactions-page-polish.md` видалено 2026-08-01 як реалізовані (PR #481 / #439 / #478) — snapshot-и лишаються в Git history. `TEMPLATE.md` не є роботою. Спеку груп A/B перенесено в `archive/specs/` після code-reconcile з PR #427.

### Зведені роадмапи

| Документ                                                                                 | Скоуп                                                                     | Статус                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)                                 | План спринтів 9–10: performance / reliability / product-surface           | Active — reconcile 2026-07-29; відкриті: S10-R2 + залишок S10-R1 (`/app`) |
| [`sync-client-wiring.md`](./sync-client-wiring.md)                                       | Multi-device op-log wiring після SQLite cut-over                          | Active — Phase 1–2 code shipped; Phase 2 verification + Phase 3–4 open    |
| [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md)                     | Операційний playbook sync wiring                                          | Active                                                                    |
| [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)                         | ~55 задач у 6 хвилях за підсумками knowledge-аудиту 6 модулів             | Active — хвилі 0–3 = передумова invite-gate                               |
| [`product-brainstorm-2026-07.md`](./product-brainstorm-2026-07.md)                       | Продуктовий брейншторм: рішення після knowledge-аудиту                    | Reference — рішення спожиті канонами й `product-knowledge-backlog.md`     |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                               | План покращення AI-coding workflow                                        | Active — 3 напрями `next`; перед виконанням кожен потребує окремої спеки  |
| [`harness-engineering-v1.md`](./harness-engineering-v1.md)                               | Harness-engineering v1 rollout + follow-ups                               | Reference — v1 rollout завершено 2026-06-29                               |
| [`2026-06-30-harness-v1-summary-worklog.md`](./2026-06-30-harness-v1-summary-worklog.md) | Worklog фінальної сесії harness-v1 (перенесено з кореневого `WORKLOG.md`) | Reference — сесію закрито 2026-07-01                                      |

## Історія завершених планів

[Git snapshot](https://github.com/Skords-01/Sergeant/tree/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive) містить колишні Closed / Reference / Deprecated плани. Локальний archive retired за ADR-0081. Ключові історичні групи:

- `archive/storage-roadmap.md` + `archive/storage-roadmap/*` — усі 13 stages complete
- `archive/sprint-roadmap-q2q3-2026.md`, `archive/pr-plan-*-2026-05.md`, `archive/tools-research-*`, `archive/tailwind-v4-migration.md`, `archive/dev-stack-roadmap*.md`
- `archive/specs/ponytail-packages-cleanup-2026-07.md`, `archive/founder-feedback-regression-audit-2026-07-17.md`
- **Code-reconcile 2026-07-20 (додатково):** `archive/specs/phase-7-ua-billing.md`, `archive/specs/coach-correlations-chat.md`, `archive/specs/chornylo-visual-direction.md`, `archive/specs/chornylo-post-merge-fixes.md` (+ `chornylo-assets/`)

**Batch 2026-07-25** (розчистка активної зони):

- `archive/specs/product-knowledge-audit*.md` — шість спек knowledge-аудиту (finyk, fizruk, hub-coach, nutrition, overview, routine); делівербл кожної — diff-звіт у [`../audits/`](../audits/README.md), а зведення фіксів — [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)
- `archive/sync-client-wiring-phase2-handoff.md` — Phase 2 залита в код, handoff спожитий; живий трек лишається в [`sync-client-wiring.md`](./sync-client-wiring.md)
- `archive/ci-main-green-2026-07-21.md` — Closed

**Code-reconcile 2026-07-29:**

- `archive/specs/test-observations-fixes-ab.md` — усі групи A/B змерджено в PR #427

Конвенція: перед cleanup зафіксувати Outcome й merge evidence; після видалення inbound-лінки ведуть на immutable commit permalink.
