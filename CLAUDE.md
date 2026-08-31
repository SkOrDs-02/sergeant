# Claude in Sergeant

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2026-12-09.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Тонкий wrapper; repo policy приходить нижче через `@import` — не дублюй її тут.

@AGENTS.md

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md). Claude Code: вже в контексті через `@import` вище — не витрачай tool-call на повторне читання.
2. Завантаж `.agents/skills/sergeant-start-here/SKILL.md` через **`Read`**, далі рівно один specialist skill для основної поверхні зміни. **Sergeant-скіли НЕ в реєстрі Claude `Skill` tool** — вони живуть у `.agents/skills/`, який Claude не сканує. Ім'я скіла `X` з routing-таблиці резолвиться у `Read .agents/skills/X/SKILL.md` (НЕ `Skill(X)` — це дасть «not found»).
3. Routing surface→skill: таблиця в § «Agent harnesses & routing» нижче (mapping tool-agnostic, валідний і для тебе).
4. Є playbook під задачу в [docs/00-start/playbooks/](./docs/00-start/playbooks/README.md)? Виконуй як canonical recipe.
5. Перший раз у репо? Пройди [docs/00-start/agents/onboarding.md](./docs/00-start/agents/onboarding.md).

## Legacy-харнеси

Kilo Code і Devin виведені з експлуатації ([ADR-0088](./docs/04-governance/adr/0088-devin-kilo-harness-retirement.md)); активні харнеси - Claude Code і Codex. Kilo-примітиви (`skill`, `task`, `agent_manager`, `kilo_local_recall`) та гілки `devin/<unix-ts>-…` у старих PR і доках - історія, не інструкція. Реєстр версій харнеса тепер `.agents/harness-versions.json`; snapshot пишеться в `.agents/snapshot.md` (`pnpm snapshot`).

## Sub-tree CLAUDE.md

Root вантажиться при старті; вкладені `CLAUDE.md` — ліниво при вході в subtree. Bridge-и: `apps/{web,server,mobile,mobile-shell}/CLAUDE.md` (→ surface `AGENTS.md`), `packages/{db-schema,api-client}/CLAUDE.md` (pointer+інваріант+skill).

## Notes

- OpenClaw/Gateway виведено з експлуатації ([ADR-0075](./docs/04-governance/adr/0075-openclaw-gateway-decommissioned.md)) — скіла `sergeant-openclaw` НЕ існує. Web-асистент → `sergeant-module-ai`; PAT-guard (Hard Rule #20) → `sergeant-security-audit`. Каталоги: [agent-workflows.md](./docs/00-start/agents/agent-workflows.md), [agent-skills-catalog.md](./docs/00-start/agents/agent-skills-catalog.md).
- Топологія агентного шару (вузли skill/agent/workspace + дозволені переходи) — [`.agents/agent-graph.json`](./.agents/agent-graph.json), гейт `pnpm lint:agent-graph`. Додав скіл чи агента — додай вузол, інакше лінт червоніє.
- SKILL.md зміни: спершу `sergeant-writing-skills`, потім `pnpm lint:skills && pnpm skills:lock`. Heavy local commands — лише за потреби чи на прохання.
- Глобальні `~/.claude/agents/` subagent-и через `Agent` — для self-contained задач (ad copy, generic review, research), коли немає specialist skill-у.
- Глобальні engineering-агенти (Frontend Developer, Mobile App Builder, Backend Architect, Database Optimizer, Code Reviewer тощо) ЗАБОРОНЕНІ для кодових правок у `apps/**` і `packages/**` — вони не знають Hard Rules (RQ-фабрики, дизайн-лінти, bigint-коерція, 44px touch targets). Для коду в цих директоріях — тільки репо-агенти (`.claude/agents/`) і specialist-скіли з `AGENTS.md`.
