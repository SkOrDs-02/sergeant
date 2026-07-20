# Claude in Sergeant

> **Last touched:** 2026-07-20 by @dimastahov16012003. **Next review:** 2026-10-18.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Тонкий wrapper; repo policy приходить нижче через `@import` — не дублюй її тут.

@AGENTS.md

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md). Claude Code: вже в контексті через `@import` вище — не витрачай tool-call на повторне читання.
2. Завантаж `.agents/skills/sergeant-start-here/SKILL.md` через **`Read`**, далі рівно один specialist skill для основної поверхні зміни. **Sergeant-скіли НЕ в реєстрі Claude `Skill` tool** — вони живуть у `.agents/skills/`, який Claude не сканує. Ім'я скіла `X` з routing-таблиці резолвиться у `Read .agents/skills/X/SKILL.md` (НЕ `Skill(X)` — це дасть «not found»).
3. Routing surface→skill: таблиця в § «Agent harnesses & routing» нижче (mapping tool-agnostic, валідний і для тебе).
4. Є playbook під задачу в [docs/00-start/playbooks/](./docs/00-start/playbooks/README.md)? Виконуй як canonical recipe.
5. Перший раз у репо? Пройди [docs/00-start/agents/onboarding.md](./docs/00-start/agents/onboarding.md).

## Claude Code native equivalents

§ «Agent harnesses & routing» в AGENTS.md повністю нейтральний — Kilo-примітиви там НЕ згадуються (вони живуть лише в `~/.config/kilo/rules.md`). Якщо натрапиш на них у legacy-PR чи Kilo-доках, ось нативні еквіваленти Claude Code:

- Kilo `skill` → **`Read .agents/skills/<name>/SKILL.md`** (Claude `Skill` tool індексує лише plugin / `~/.claude/skills` скіли — Sergeant-скілів там НЕМА, тому Read, не `Skill`); Kilo `task` + agent-defs→`Agent`+`~/.claude/agents/*`, `Task*` для teams; `agent_manager`→`EnterWorktree`.
- `kilo_local_recall`→auto-memory+`Explore`; Kilo MCP (context7/github/memory)→`ToolSearch` (`.mcp.json`); Kilo commands→`pnpm check` або `.claude/commands/*`.

Спільне для всіх харнесів і валідне для тебе: routing-таблиця surface→skill і список hard rules / invariants нижче по AGENTS.md. Конфіг Kilo живе глобально в `~/.config/kilo/`, не в репо — у репо з `.kilo/` лишився тільки harness-neutral реєстр версій `.kilo/harness-versions.json` (див. AGENTS.md § Harness version).

## Sub-tree CLAUDE.md

Root вантажиться при старті; вкладені `CLAUDE.md` — ліниво при вході в subtree. Bridge-и: `apps/{web,server,mobile,mobile-shell}/CLAUDE.md` (→ surface `AGENTS.md`), `packages/{db-schema,api-client}/CLAUDE.md` (pointer+інваріант+skill).

## Notes

- OpenClaw/Gateway → `sergeant-openclaw`, не `sergeant-hubchat`. Каталоги: [agent-workflows.md](./docs/00-start/agents/agent-workflows.md), [agent-skills-catalog.md](./docs/00-start/agents/agent-skills-catalog.md).
- SKILL.md зміни: спершу `sergeant-writing-skills`, потім `pnpm lint:skills && pnpm skills:lock`. Heavy local commands — лише за потреби чи на прохання.
- Глобальні `~/.claude/agents/` subagent-и через `Agent` — для self-contained задач (ad copy, generic review, research), коли немає specialist skill-у.
- Глобальні engineering-агенти (Frontend Developer, Mobile App Builder, Backend Architect, Database Optimizer, Code Reviewer тощо) ЗАБОРОНЕНІ для кодових правок у `apps/**` і `packages/**` — вони не знають Hard Rules (RQ-фабрики, дизайн-лінти, bigint-коерція, 44px touch targets). Для коду в цих директоріях — тільки репо-агенти (`.claude/agents/`) і specialist-скіли з `AGENTS.md`.
