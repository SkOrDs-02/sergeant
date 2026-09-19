# Планування

> **Last touched:** 2026-09-17 by @claude (індекс: видалені плани → Reference з permalink-ом; додано research/eval-звіти; рядок беклогу — за його шапкою). **Next review:** 2026-12-16.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

Це legacy compatibility-шлях під час рефакторингу. Нові крос-системні зміни
оформлюй як спеки; цільове розміщення описане в
[`documentation-architecture.md`](../../../start/documentation-architecture.md).

> **Швидко знайти активне:** [`../open-work.md`](../../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів.

> **Як виконувати ці плани батчами:** [`../../../start/playbooks/execute-planning-batch.md`](../../../start/instructions/execute-planning-batch.md) (governing skill `sergeant-planning-batch`).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`docs/work/specs/`](../) (шаблон: [`TEMPLATE.md`](../TEMPLATE.md)). Scaffolded / Active спеки живуть у цільовому каталозі. Після завершення outcome та merge evidence фіксуються в каноні, а спеку прибирають з active checkout; локальні archive-дерева не розширюються (ADR-0081).

> Повний перелік відкритих спек зі статусами — [`../../open-work.md`](../../../open-work.md). Історичні archive-файли тут — legacy snapshot; нові завершені спеки в них не додаємо. `TEMPLATE.md` не є роботою.

### Зведені роадмапи

| Документ                                                                                                                                                           | Скоуп                                                                     | Статус                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sprint-9-10-plan-2026.md`](https://github.com/SkOrDs-02/sergeant/blob/ef890478b6167ce3965e5ce8035ec3fa9fc412cd/docs/90-work/planning/sprint-9-10-plan-2026.md)   | План спринтів 9–10: performance / reliability / product-surface           | Reference — файл видалено з checkout, лишився лише permalink (стан на 2026-07-29: відкриті S10-R2 + залишок S10-R1 `/app`); живим трекером не є |
| [`sync-client-wiring.md`](./sync-client-wiring.md)                                                                                                                 | Multi-device op-log wiring після SQLite cut-over                          | Active — Phase 1–2 code shipped; Phase 2 verification + Phase 3–4 open                                                                          |
| [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md)                                                                                               | Операційний playbook sync wiring                                          | Active                                                                                                                                          |
| [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)                                                                                                   | Беклог виправлень за підсумками knowledge-аудиту 6 модулів (хвилі 0–5)    | Active — повна звірка всіх хвиль 0–5 із кодом виконана 2026-09-17; чинний стан — колонки «Стан» у самому файлі                                  |
| [`product-brainstorm-2026-07.md`](./product-brainstorm-2026-07.md)                                                                                                 | Продуктовий брейншторм: рішення після knowledge-аудиту                    | Reference — рішення спожиті канонами й `product-knowledge-backlog.md`                                                                           |
| [`ai-coding-improvements.md`](https://github.com/SkOrDs-02/sergeant/blob/17bdf33c4ee6e1d6fd25e9d3b3267c53029a8e38/docs/90-work/planning/ai-coding-improvements.md) | План покращення AI-coding workflow                                        | Reference — файл видалено з checkout, лишився лише permalink (3 напрями `next` потребували окремих спек); живим трекером не є                   |
| [`harness-engineering-v1.md`](./harness-engineering-v1.md)                                                                                                         | Harness-engineering v1 rollout + follow-ups                               | Reference — v1 rollout завершено 2026-06-29                                                                                                     |
| [`2026-06-30-harness-v1-summary-worklog.md`](./2026-06-30-harness-v1-summary-worklog.md)                                                                           | Worklog фінальної сесії harness-v1 (перенесено з кореневого `WORKLOG.md`) | Reference — сесію закрито 2026-07-01                                                                                                            |
| [`barcode-database-research.md`](./barcode-database-research.md)                                                                                                   | Дослідження баз баркодів для nutrition (зріз 2026-08-01)                  | Reference — рішення спожите: каскад OFF → USDA живе в `apps/server/src/modules/nutrition/barcode.ts`                                            |
| [`model-eval-2026-08-04.md`](./model-eval-2026-08-04.md), [`model-eval-2026-08-25.md`](./model-eval-2026-08-25.md)                                                 | Звіти-знімки стенду оцінки текстових моделей (`eval:*`)                   | Reference — датовані прогони                                                                                                                    |
| [`vision-eval-2026-08-04.md`](./vision-eval-2026-08-04.md), [`vision-eval-2026-08-25.md`](./vision-eval-2026-08-25.md)                                             | Звіти-знімки зорового стенду (фото страв)                                 | Reference — датовані прогони                                                                                                                    |

## Історія завершених планів

[Git snapshot](https://github.com/Skords-01/Sergeant/tree/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive) містить колишні Closed / Reference / Deprecated плани. Локальний archive retired за ADR-0081. Ключові історичні групи:

- `archive/storage-roadmap.md` + `archive/storage-roadmap/*` — усі 13 stages complete
- `archive/sprint-roadmap-q2q3-2026.md`, `archive/pr-plan-*-2026-05.md`, `archive/tools-research-*`, `archive/tailwind-v4-migration.md`, `archive/dev-stack-roadmap*.md`
- `archive/specs/ponytail-packages-cleanup-2026-07.md`, `archive/founder-feedback-regression-audit-2026-07-17.md`
- **Code-reconcile 2026-07-20 (додатково):** `archive/specs/phase-7-ua-billing.md`, `archive/specs/coach-correlations-chat.md`, `archive/specs/chornylo-visual-direction.md`, `archive/specs/chornylo-post-merge-fixes.md` (+ `chornylo-assets/`)

**Batch 2026-07-25** (розчистка активної зони):

- `archive/specs/product-knowledge-audit*.md` — шість спек knowledge-аудиту (finyk, fizruk, hub-coach, nutrition, overview, routine); делівербл кожної — diff-звіт у [`../../audits/`](../audits/README.md), а зведення фіксів — [`product-knowledge-backlog.md`](./product-knowledge-backlog.md)
- `archive/sync-client-wiring-phase2-handoff.md` — Phase 2 залита в код, handoff спожитий; живий трек лишається в [`sync-client-wiring.md`](./sync-client-wiring.md)
- `archive/ci-main-green-2026-07-21.md` — Closed

**Code-reconcile 2026-07-29:**

- `archive/specs/test-observations-fixes-ab.md` — усі групи A/B змерджено в PR #427

Конвенція: перед cleanup зафіксувати Outcome й merge evidence; після видалення inbound-лінки ведуть на immutable commit permalink.
