# Claude in Sergeant

> **Last touched:** 2026-09-23 by @claude (заборону для глобальних агентів перенесено в AGENTS.md, повний список bridge-ів). **Next review:** 2026-12-12.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Тонкий wrapper; repo policy приходить нижче через `@import` — не дублюй її тут.

@AGENTS.md

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md). Claude Code: вже в контексті через `@import` вище — не витрачай tool-call на повторне читання.
2. Завантаж `.agents/skills/sergeant-start-here/SKILL.md` через **`Read`**, далі рівно один specialist skill для основної поверхні зміни. **Sergeant-скіли НЕ в реєстрі Claude `Skill` tool** — вони живуть у `.agents/skills/`, який Claude не сканує. Ім'я скіла `X` з routing-таблиці резолвиться у `Read .agents/skills/X/SKILL.md` (НЕ `Skill(X)` — це дасть «not found»).
3. Routing surface→skill: таблиця в § «Agent harnesses & routing» нижче (mapping tool-agnostic, валідний і для тебе).
4. Є playbook під задачу в [docs/start/instructions/](./docs/start/instructions/README.md)? Виконуй як canonical recipe.
5. Перший раз у репо? Пройди [docs/start/agents/onboarding.md](./docs/start/agents/onboarding.md).

## Legacy-харнеси

Kilo Code і Devin виведені з експлуатації ([ADR-0088](./docs/governance/adr/0088-devin-kilo-harness-retirement.md)); активні харнеси - Claude Code і Codex. Kilo-примітиви (`skill`, `task`, `agent_manager`, `kilo_local_recall`) та гілки `devin/<unix-ts>-…` у старих PR і доках - історія, не інструкція. Реєстр версій харнеса тепер `.agents/harness-versions.json`; snapshot пишеться в `.agents/snapshot.md` (`pnpm snapshot`).

## Sub-tree CLAUDE.md

Root вантажиться при старті; вкладені `CLAUDE.md` — ліниво при вході в subtree. Bridge-и: `apps/{web,server,mobile,mobile-shell}/CLAUDE.md` (→ surface `AGENTS.md`), `packages/{api-client,db-schema,dualwrite-core,finyk-domain,fizruk-domain,nutrition-domain,routine-domain}/CLAUDE.md` (pointer+інваріант+skill).

## Граф коду (codebase-memory)

Для питань «де живе X», «хто викликає Y», «що зачепить зміна» спершу граф, потім `Grep`/`Glob`: `search_graph` (функції, класи, роути; `query` природною мовою), `trace_path` (ланцюги викликів і потоки даних), `get_code_snippet`, `query_graph`. Інструменти deferred: завантаж їх одним `ToolSearch` на старті сесії, до першого пошуку по коду.

- **Проєкт завжди `D-Sergeant`.** Індекс один, з трунку `D:\Sergeant` на `main`, оновлюється щоночі рутиною `graph-reindex-nightly`. Worktree не індексуй (~150 МБ на кожен): змін своєї гілки в графі немає, їх читай файлами.
- **Свіжість перевіряй, а не припускай.** Не знаходить символ, який точно є в `main`, значить індекс відстає: скажи про це і переходь на `Grep`. Рутина пропускає оновлення, коли трунк не на `main` або брудний.
- **Сабагентам** з кодовою задачею пиши в брифі, що граф доступний і з яким проєктом. Репо-агенти в `.claude/agents/` мають інструменти графа у своєму `tools:`; агент без них у списку граф викликати не може.

## Notes

- OpenClaw/Gateway виведено з експлуатації ([ADR-0075](./docs/governance/adr/0075-openclaw-gateway-decommissioned.md)) — скіла `sergeant-openclaw` НЕ існує. Web-асистент → `sergeant-module-ai`; PAT-guard (Hard Rule #20) → `sergeant-security-audit`. Каталоги: [agent-workflows.md](./docs/start/agents/agent-workflows.md), [agent-skills-catalog.md](./docs/start/agents/agent-skills-catalog.md).
- Топологія агентного шару (вузли skill/agent/workspace + дозволені переходи) — [`.agents/agent-graph.json`](./.agents/agent-graph.json), гейт `pnpm lint:agent-graph`. Додав скіл чи агента — додай вузол, інакше лінт червоніє.
- SKILL.md зміни: спершу `sergeant-writing-skills`, потім `pnpm lint:skills && pnpm skills:lock`. Heavy local commands — лише за потреби чи на прохання.
- Глобальні `~/.claude/agents/` subagent-и через `Agent` — для self-contained задач (ad copy, generic review, research), коли немає specialist skill-у.
- Глобальні engineering-агенти (Frontend Developer, Backend Architect, Code Reviewer тощо) не правлять код у `apps/**` і `packages/**`: правило в [AGENTS.md § Agent harnesses & routing](./AGENTS.md#agent-harnesses--routing), пункт «Загальні агенти без контексту репо».
