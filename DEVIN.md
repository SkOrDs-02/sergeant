# Devin in Sergeant

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Цей файл — тонкий вказівник із кількома Devin-specific нотатками. Repo contract, hard rules і operating system для агентів описані в `AGENTS.md`, `docs/agents/*` і `docs/playbooks/*`.

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.
3. Завантаж рівно один specialist skill для основної поверхні зміни (див. [agent-skills-catalog.md](./docs/agents/agent-skills-catalog.md)).
4. Якщо під задачу є playbook у [docs/playbooks/](./docs/playbooks/README.md) — виконуй його як canonical recipe.
5. Перший раз у репо? Пройди [`docs/agents/onboarding.md`](./docs/agents/onboarding.md) — секрети (`/run/repo_secrets/Sergeant/.env.secrets`), `pnpm db:up` із pgvector image, hard-rule навігація, plop-генератори.

## Devin-specific нотатки

- Перед claim про completion запускай явні verification commands (lint / typecheck / focused tests).
- Для multi-surface змін вирішуй один primary surface і один primary playbook; не міксуй кілька workflow без причини.
- Якщо задача торкає `docs/governance/`, `.agents/skills/` або `docs/playbooks/` — стався до них як до production surfaces: перевір індекси, схеми, sync gates і CODEOWNERS coverage.
