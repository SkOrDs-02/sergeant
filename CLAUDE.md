# Claude in Sergeant

> **Last validated:** 2026-06-06 by @claude. **Next review:** 2026-09-04.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Тонкий wrapper; repo policy приходить нижче через `@import` — не дублюй її тут.

@AGENTS.md

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md). Claude Code: вже в контексті через `@import` вище — не витрачай tool-call на повторне читання.
2. Завантаж `.agents/skills/sergeant-start-here/SKILL.md`, далі рівно один specialist skill для основної поверхні зміни.
3. Routing surface→skill: таблиця в § «Kilo Code» нижче (mapping tool-agnostic, валідний і для тебе).
4. Є playbook під задачу в [docs/playbooks/](./docs/playbooks/README.md)? Виконуй як canonical recipe.
5. Перший раз у репо? Пройди [docs/agents/onboarding.md](./docs/agents/onboarding.md).

## Claude Code ≠ Kilo Code

§ «Kilo Code: extension operating model» в AGENTS.md написана для Kilo-розширення — **ігноруй її примітиви**, бери нативні еквіваленти:

- `skill`→`Skill` (SKILL.md можна й через `Read`); `task`/`.kilo/agent/*`→`Agent`+`.claude/agents/*` (18 subagents), `Task*` для teams; `agent_manager`→`EnterWorktree`.
- `kilo_local_recall`→auto-memory+`Explore`; kilo.json MCP→`ToolSearch` (`.mcp.json`); `.kilo/command/*`→`pnpm check` або `.claude/commands/*`.

Валідні для тебе в тій секції: routing-таблиця surface→skill і список hard rules / invariants нижче по AGENTS.md.

## Sub-tree CLAUDE.md

Root вантажиться при старті; вкладені `CLAUDE.md` — ліниво при вході в subtree. Bridge-и: `apps/{web,server,mobile,mobile-shell}/CLAUDE.md` (→ surface `AGENTS.md`), `packages/{db-schema,api-client}/CLAUDE.md` (pointer+інваріант+skill).

## Notes

- OpenClaw/Gateway → `sergeant-openclaw`, не `sergeant-hubchat`. Каталоги: [agent-workflows.md](./docs/agents/agent-workflows.md), [agent-skills-catalog.md](./docs/agents/agent-skills-catalog.md).
- SKILL.md зміни: спершу `sergeant-writing-skills`, потім `pnpm lint:skills && pnpm skills:lock`. Heavy local commands — лише за потреби чи на прохання.
- Глобальні `~/.claude/agents/` subagent-и через `Agent` — для self-contained задач (ad copy, generic review, research), коли немає specialist skill-у.
