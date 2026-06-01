# Планування

> **Last validated:** 2026-05-14 by Codex (синхронізовано з фактичним набором `docs/planning/*.md`; додано нові PR-плани з прожарок 2026-05-13 та посилання на `docs/open-work.md` як єдиний дашборд активної роботи). **Next review:** 2026-08-12.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

> **Швидко знайти активне:** [`../open-work.md`](../open-work.md) — автогенерований дашборд усіх відкритих tracker-документів. Цей README пояснює саме planning-директорію; open-work відповідає на питання "що зараз НЕ доробленого в репо загалом?".

## Активні документи

### Зведені роадмапи

| Документ                                                       | Скоуп                                                                                                          | Статус                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [`pr-plan-2026-05.md`](./pr-plan-2026-05.md)                   | Зведений PR-план 30/60/90/180 днів зі зрізу автоматизації / n8n / Telegram / OpenClaw / AI-як-інфра (48 PR-ів) | Active                    |
| [`sprint-roadmap-q2q3-2026.md`](./sprint-roadmap-q2q3-2026.md) | Єдиний спринтовий трекер платформи: продуктові фічі + технічний борг Q2–Q3 2026                                | Active                    |
| [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md)       | План спринтів 9–10: продовження performance / reliability / product-surface робіт                              | Active                    |
| [`dev-stack-roadmap.md`](./dev-stack-roadmap.md)               | Технічний roadmap стеку (інструменти, інтеграції, практики, CI/CD, security, performance)                      | Active (живий журнал)     |
| [`storage-roadmap.md`](./storage-roadmap.md)                   | Storage & Sync roadmap до production-ready (SQLite + op-log)                                                   | Active (Stage 13 cleanup) |
| [`openclaw-migration-plan.md`](./openclaw-migration-plan.md)   | Stage-by-stage OpenClaw migration / gateway cutover / legacy deletion tracker                                  | Active                    |
| [`openclaw-user-guide.md`](./openclaw-user-guide.md)           | Операційний user guide для OpenClaw / Telegram control-plane                                                   | Active                    |

### PR-плани з прожарок 2026-05-13

| Документ                                                                               | Скоуп                                                                                | Статус |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| [`pr-plan-backend-perf-2026-05.md`](./pr-plan-backend-perf-2026-05.md)                 | Backend/performance PR-картки: validation, observability, env, pool/latency          | Active |
| [`pr-plan-dead-code-hard-rules-2026-05.md`](./pr-plan-dead-code-hard-rules-2026-05.md) | Dead-code + hard-rules follow-up PR-план                                             | Active |
| [`pr-plan-docs-hygiene-2026-05.md`](./pr-plan-docs-hygiene-2026-05.md)                 | Documentation hygiene follow-up: stale links, discoverability, governance sync gates | Active |
| [`pr-plan-revenue-2026-05.md`](./pr-plan-revenue-2026-05.md)                           | Revenue / monetization / paywall PR-план                                             | Active |
| [`pr-plan-security-obs-2026-05.md`](./pr-plan-security-obs-2026-05.md)                 | Security & observability PR-план: CSP, secrets, Sentry/OTel/web-vitals, audit logs   | Active |
| [`pr-plan-web-2026-05.md`](./pr-plan-web-2026-05.md)                                   | Web architecture/state + frontend ergonomics PR-план                                 | Active |

### Дослідження, міграції, рішення

| Документ                                                                     | Скоуп                                                                                                                                                         | Статус                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                   | План покращення AI-coding workflow (агентська інфраструктура, не продукт)                                                                                     | Active                                                        |
| [`tools-research-2026-05.md`](./tools-research-2026-05.md)                   | Дослідження готових рішень / лібок / тулзів зі зрізу 2026-05                                                                                                  | Active research                                               |
| [`tools-research-2026-05-followup.md`](./tools-research-2026-05-followup.md) | Follow-up до `tools-research-2026-05.md` — реальний стан адопції + переоцінка «відкладених» / «не рекомендованих» (Hold / Mild miss / Real loss / Reconsider) | Active research                                               |
| [`tailwind-v4-migration.md`](./tailwind-v4-migration.md)                     | Tailwind v3 → v4 migration plan                                                                                                                               | Phases 1/3/4 ✅ done; Phase 2 (mobile / NativeWind 5) blocked |
| [`flyio-vs-railway.md`](./flyio-vs-railway.md)                               | Decision-rationale: Railway зараз залишається, Fly.io — checklist «коли мігрувати»                                                                            | Reference (не потребує дій)                                   |
| [`talk-to-your-data.md`](./talk-to-your-data.md)                             | План для conversational data Q&A на даних користувача                                                                                                         | Draft                                                         |

## Архів

[`archive/`](./archive/) — read-only документи, для яких роботу повністю завершено або які зберігаються лише як історичний reference (щоб майбутні агенти не повертались до вже закритого рішення).

| Архів                                                                                              | Чому архів                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md)                                   | Хроніка early-spring 2026 «інфра-спринтів» (PR #714–#743), винесена з живого роадмапу.                                         |
| [`archive/orm-drizzle-vs-kysely.md`](./archive/orm-drizzle-vs-kysely.md)                           | Міграція Kysely → Drizzle виконана 2026-05-03; зберігаємо rationale, щоб майбутні агенти не пропонували повернутися до Kysely. |
| [`archive/pr-plan-ftux-2026-05.md`](./archive/pr-plan-ftux-2026-05.md)                             | Closed execution-план FTUX-прожарки 2026-05-13; canonical статуси — у `docs/launch/product-os/ftux-master-tracker.md`.         |
| [`archive/pr-plan-mobile-reliability-2026-05.md`](./archive/pr-plan-mobile-reliability-2026-05.md) | Closed execution-план mobile-reliability прожарки; canonical статуси — у `docs/tech-debt/mobile.md`.                           |
| [`archive/mobile-e2e-testing.md`](./archive/mobile-e2e-testing.md)                                 | Detox-vs-Maestro decision-record; superseded — Detox adopted. Зберігаємо, щоб не реоцінювати Maestro.                          |

## Переїхали в інші розділи

Серія `stack-pulse-2026-05/` (16 PR-планів зі зрізу стеку 2026-05) переїхала в [`docs/initiatives/stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/README.md) — це multi-PR program of work з власником і ETA, що по семантиці належить ініціативам, а не дослідницькому планінгу.

## Конвенція архівації

Документ переноситься у [`archive/`](./archive/), коли:

- Робота повністю виконана, follow-up-и закриті, і документ більше не редагується (фіксує снапшот рішення).
- АБО: документ потрібен лише як anti-regression reference (щоб майбутні агенти не пропонували відкочуватися до старого рішення).

Замість видалення файлу — переносимо у `archive/` з frontmatter:

```md
> **Last validated:** YYYY-MM-DD by <author>. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only).
> **Created:** YYYY-MM-DD.
> **Source:** [`<живий-документ>`](link) — звідки винесли.
> **Purpose:** чому залишили (rationale, anti-regression, історичний контекст).
```

Inbound-лінки у живі документи мають бути оновлені на `archive/` шлях.
