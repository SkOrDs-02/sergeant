# Планування

> **Last validated:** 2026-07-18 by Codex (lifecycle reconciliation). **Next review:** 2026-08-18.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів. Цей README пояснює саме planning-директорію; open-work відповідає на питання "що зараз НЕ доробленого в репо загалом?".

> **Як виконувати ці плани батчами:** [`../playbooks/execute-planning-batch.md`](../../00-start/playbooks/execute-planning-batch.md) (governing skill `sergeant-planning-batch`, parallel fan-out layer — [`../agents/agent-workflows.md`](../../00-start/agents/agent-workflows.md) §12). Динамічно тягне наступні N невиконаних PR-карток звідси, гонить паралельні агенти, оновлює трекери і fast-forward архівує доведені до повністю виконано доки (без 90-day gate, за standing-дозволом founder-а).

## Активні документи

### Спеки фіч

Кожна нетривіальна фіча починається зі спеки у [`specs/`](./specs/) (шаблон: [`specs/TEMPLATE.md`](./specs/TEMPLATE.md)). Спека народжується через spec-інтервʼю (глобальний скіл `spec`: AskUserQuestion → самодостатній документ) і виконується у свіжій сесії/worktree, читаючи лише її. Дрібні фікси та задачі з готовим playbook/initiative-таском спеки не потребують.

### Зведені роадмапи

| Документ                                                       | Скоуп                                                                                     | Статус                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`sprint-roadmap-q2q3-2026.md`](./sprint-roadmap-q2q3-2026.md) | Єдиний спринтовий трекер платформи: продуктові фічі + технічний борг Q2–Q3 2026           | Active                                                     |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)       | План спринтів 9–10: продовження performance / reliability / product-surface робіт         | Active                                                     |
| [`dev-stack-roadmap.md`](./dev-stack-roadmap.md)               | Технічний roadmap стеку (інструменти, інтеграції, практики, CI/CD, security, performance) | Active (живий журнал)                                      |
| [`storage-roadmap.md`](./storage-roadmap.md)                   | Storage & Sync roadmap до production-ready (SQLite + op-log)                              | Reference (all 13 stages complete; Redis #045 opt-in tail) |
| [`openclaw-user-guide.md`](./openclaw-user-guide.md)           | Операційний user guide для OpenClaw / Telegram control-plane                              | Active                                                     |

### PR-плани з прожарок 2026-05-13

| Документ                                                     | Скоуп                                                | Статус               |
| ------------------------------------------------------------ | ---------------------------------------------------- | -------------------- |
| [`pr-plan-revenue-2026-05.md`](./pr-plan-revenue-2026-05.md) | Revenue / monetization / paywall PR-план             | Reference/carry-over |
| [`pr-plan-web-2026-05.md`](./pr-plan-web-2026-05.md)         | Web architecture/state + frontend ergonomics PR-план | Reference/carry-over |

### Дослідження, міграції, рішення

| Документ                                                                     | Скоуп                                                                                                                                                         | Статус                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                   | План покращення AI-coding workflow (агентська інфраструктура, не продукт)                                                                                     | Active                                                        |
| [`tools-research-2026-05.md`](./tools-research-2026-05.md)                   | Дослідження готових рішень / лібок / тулзів зі зрізу 2026-05                                                                                                  | Reference                                                     |
| [`tools-research-2026-05-followup.md`](./tools-research-2026-05-followup.md) | Follow-up до `tools-research-2026-05.md` — реальний стан адопції + переоцінка «відкладених» / «не рекомендованих» (Hold / Mild miss / Real loss / Reconsider) | Reference                                                     |
| [`tailwind-v4-migration.md`](./tailwind-v4-migration.md)                     | Tailwind v3 → v4 migration plan                                                                                                                               | Phases 1/3/4 ✅ done; Phase 2 (mobile / NativeWind 5) blocked |

## Архів

[`archive/`](./archive) — read-only документи, для яких роботу повністю завершено або які зберігаються лише як історичний reference (щоб майбутні агенти не повертались до вже закритого рішення).

| Архів                                                                                                                | Чому архів                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md)                                                     | Хроніка early-spring 2026 «інфра-спринтів» (PR #714–#743), винесена з живого роадмапу.                                                                                                                                                                                |
| [`archive/orm-drizzle-vs-kysely.md`](./archive/orm-drizzle-vs-kysely.md)                                             | Міграція Kysely → Drizzle виконана 2026-05-03; зберігаємо rationale, щоб майбутні агенти не пропонували повернутися до Kysely.                                                                                                                                        |
| [`archive/pr-plan-ftux-2026-05.md`](./archive/pr-plan-ftux-2026-05.md)                                               | Closed execution-план FTUX-прожарки 2026-05-13; canonical статуси — у `docs/01-product/launch/product-os/ftux-master-tracker.md`.                                                                                                                                     |
| [`archive/pr-plan-mobile-reliability-2026-05.md`](./archive/pr-plan-mobile-reliability-2026-05.md)                   | Closed execution-план mobile-reliability прожарки; canonical статуси — у `docs/90-work/tech-debt/mobile.md`.                                                                                                                                                          |
| [`archive/mobile-e2e-testing.md`](./archive/mobile-e2e-testing.md)                                                   | Detox-vs-Maestro decision-record; superseded — Detox adopted. Зберігаємо, щоб не реоцінювати Maestro.                                                                                                                                                                 |
| [`archive/pr-plan-docs-hygiene-2026-05.md`](./archive/pr-plan-docs-hygiene-2026-05.md)                               | Closed execution-план doc-hygiene прожарки 2026-05-13; усі QW+PR-01…09 ✅, запроваджені gate-и живі на `main`. Fast-forward архівація 2026-06-02 (90-day gate skipped).                                                                                               |
| [`archive/pr-plan-security-obs-2026-05.md`](./archive/pr-plan-security-obs-2026-05.md)                               | Closed execution-план security/observability прожарки 2026-05-13; усі картки S2–S11 ✅ Виконано, verified on main (gate-и `no-console-pii`, `lint:html-sri`, `lint:pii-handling-drift` + parity-тести живі). Fast-forward архівація 2026-06-02 (90-day gate skipped). |
| [`archive/session-2026-05-15-revenue-security-testing.md`](./archive/session-2026-05-15-revenue-security-testing.md) | Closed session-нота 2026-05-15 (revenue/paywall/security/mutation); усе shipped на `main`, «Next PR Cards» влилися у живі плани. Ефемерна нота — заархівована після споживання 2026-06-02.                                                                            |
| [`archive/openclaw-migration-plan.md`](./archive/openclaw-migration-plan.md)                                         | Archived 2026-06-15 — migration complete (Stage 7 cutover 2026-05-12; grammy bot + `tools/openclaw` deleted PR #3470). Canonical home: ADR-0056 + `packages/openclaw-plugin` + `sergeant-openclaw` specialist.                                                        |
| [`archive/pr-plan-backend-perf-2026-05.md`](./archive/pr-plan-backend-perf-2026-05.md)                               | Archived 2026-06-15 — усі 12 PR-ів shipped (drift reconcile 2026-06-04). Canonical homes: parseBody → Rule #27 + `eslint-plugin-sergeant-design`; metrics/SLO → `docs/03-operations/observability/`.                                                                  |

| [`archive/pr-plan-2026-05.md`](./archive/pr-plan-2026-05.md) | Archived 2026-07-19 — Closed 2026-06-19; усі 48 Plan-ID серії змерджено. Canonical статуси живуть у поточних спринт-трекерах. |
| [`archive/pr-plan-dead-code-hard-rules-2026-05.md`](./archive/pr-plan-dead-code-hard-rules-2026-05.md) | Archived 2026-07-19 — Closed 2026-06-08; усі DC/HR items виконані, gate-и живі на `main`. Canonical: Hard Rules + `eslint-plugin-sergeant-design`. |
| [`archive/flyio-vs-railway.md`](./archive/flyio-vs-railway.md) | Archived 2026-07-19 — Deprecated: Railway виведено з експлуатації (backend → Hetzner/Coolify, ADR-0074). Зберігаємо rationale, щоб не реоцінювати Fly.io. |
| [`archive/syncv2-decomposition-detailed.md`](./archive/syncv2-decomposition-detailed.md) | Archived 2026-07-19 — Closed: декомпозицію `syncV2.ts` виконано (3100 → 509 LOC). Історичний план. |
| [`archive/talk-to-your-data.md`](./archive/talk-to-your-data.md) | Archived 2026-07-19 — Closed 2026-06-15: PR1–4 shipped (query-tools + DataResult). Історичний план. |

## Переїхали в інші розділи

Серія `stack-pulse-2026-05/` (16 PR-планів зі зрізу стеку 2026-05) переїхала в [`docs/90-work/initiatives/stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/README.md) — це multi-PR program of work з власником і ETA, що по семантиці належить ініціативам, а не дослідницькому планінгу.

## Конвенція архівації

Документ переноситься у [`archive/`](./archive), коли:

- Робота повністю виконана, follow-up-и закриті, і документ більше не редагується (фіксує снапшот рішення).
- АБО: документ потрібен лише як anti-regression reference (щоб майбутні агенти не пропонували відкочуватися до старого рішення).

Замість видалення файлу — переносимо у `archive/` з frontmatter:

```md
> **Last validated:** YYYY-MM-DD by <author>. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only).
> **Created:** YYYY-MM-DD.
> **Source:** [`<живий-документ>`](./link) — звідки винесли.
> **Purpose:** чому залишили (rationale, anti-regression, історичний контекст).
```

Inbound-лінки у живі документи мають бути оновлені на `archive/` шлях.
