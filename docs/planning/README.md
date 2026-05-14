# Планування

> **Last validated:** 2026-05-13 by Devin (синхронізовано зі станом Stage 7 storage-roadmap, OpenClaw Phase 3 prep + архівація `orm-drizzle-vs-kysely.md` після Kysely → Drizzle міграції). **Next review:** 2026-08-11.
> **Status:** Active

Активні roadmap-и, дослідницькі плани і decision-rationale документи розвитку Sergeant.

## Активні документи

| Документ                                                                           | Скоуп                                                                                                                                                         | Статус                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`pr-plan-2026-05.md`](./pr-plan-2026-05.md)                                       | Зведений PR-план 30/60/90/180 днів зі зрізу автоматизації / n8n / Telegram / OpenClaw / AI-як-інфра (48 PR-ів)                                                | Active                                                         |
| [`pr-plan-mobile-reliability-2026-05.md`](./pr-plan-mobile-reliability-2026-05.md) | 10 PR-карток closeout відкритих/partial items із прожарки 2026-05-13 (mobile reliability/UX, без SQLite Stage 8/9)                                            | Active                                                         |
| [`dev-stack-roadmap.md`](./dev-stack-roadmap.md)                                   | Технічний roadmap стеку (інструменти, інтеграції, практики, CI/CD, security, performance)                                                                     | Active (живий журнал)                                          |
| [`storage-roadmap.md`](./storage-roadmap.md)                                       | Storage & Sync roadmap до production-ready (SQLite + op-log)                                                                                                  | Active (Stage 7)                                               |
| [`ai-coding-improvements.md`](./ai-coding-improvements.md)                         | План покращення AI-coding workflow (агентська інфраструктура, не продукт)                                                                                     | Active                                                         |
| [`tools-research-2026-05.md`](./tools-research-2026-05.md)                         | Дослідження готових рішень / лібок / тулзів зі зрізу 2026-05                                                                                                  | Active research                                                |
| [`tools-research-2026-05-followup.md`](./tools-research-2026-05-followup.md)       | Follow-up до `tools-research-2026-05.md` — реальний стан адопції + переоцінка «відкладених» / «не рекомендованих» (Hold / Mild miss / Real loss / Reconsider) | Active research                                                |
| [`tailwind-v4-migration.md`](./tailwind-v4-migration.md)                           | Tailwind v3 → v4 migration plan                                                                                                                               | Phases 1/3/4 ✅ done; Phase 2 (mobile / NativeWind 5) blocked  |
| [`mobile-e2e-testing.md`](./mobile-e2e-testing.md)                                 | Mobile E2E framework choice — Detox vs Maestro                                                                                                                | Рекомендація підготовлена (Maestro), впровадження не розпочато |
| [`flyio-vs-railway.md`](./flyio-vs-railway.md)                                     | Decision-rationale: Railway зараз залишається, Fly.io — checklist «коли мігрувати»                                                                            | Reference (не потребує дій)                                    |
| [`talk-to-your-data.md`](./talk-to-your-data.md)                                   | План для conversational data Q&A на даних користувача                                                                                                         | Draft                                                          |

## Архів

[`archive/`](./archive/) — read-only документи, для яких роботу повністю завершено або які зберігаються лише як історичний reference (щоб майбутні агенти не повертались до вже закритого рішення).

| Архів                                                                    | Чому архів                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md)         | Хроніка early-spring 2026 «інфра-спринтів» (PR #714–#743), винесена з живого роадмапу.                                         |
| [`archive/orm-drizzle-vs-kysely.md`](./archive/orm-drizzle-vs-kysely.md) | Міграція Kysely → Drizzle виконана 2026-05-03; зберігаємо rationale, щоб майбутні агенти не пропонували повернутися до Kysely. |

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
