# Claude in Sergeant

> **Last validated:** 2026-05-18 by @codex. **Next review:** 2026-08-16.
> **Status:** Active

> **Single source of truth -> [AGENTS.md](./AGENTS.md).** Цей файл — тонкий Claude-specific wrapper. Політика репо, hard rules, skills, playbooks і workflow-дерева живуть в `AGENTS.md` та `docs/`.

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.
3. Завантаж рівно один Sergeant specialist skill для основної поверхні зміни.
4. Якщо під задачу є playbook у [docs/playbooks/](./docs/playbooks/README.md), виконуй його як canonical recipe.
5. Перший раз у репо? Пройди [`docs/agents/onboarding.md`](./docs/agents/onboarding.md).

## Claude-specific notes

- Для detailed agent workflows дивись [`docs/agents/agent-workflows.md`](./docs/agents/agent-workflows.md).
- Для repo-owned skills дивись [`docs/agents/agent-skills-catalog.md`](./docs/agents/agent-skills-catalog.md).
- Для OpenClaw/Gateway задач використовуй `sergeant-openclaw`, не `sergeant-hubchat`.
- Для SKILL.md змін спочатку відкрий `sergeant-writing-skills`, потім запускай `pnpm lint:skills && pnpm skills:lock`.
- Heavy local commands запускай лише коли вони потрібні задачі або користувач прямо попросив.
