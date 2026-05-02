# Devin in Sergeant

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Цей файл навмисно короткий. Repo contract, hard rules і operating system для агентів описані в [AGENTS.md](./AGENTS.md), `docs/superpowers/*` і `docs/playbooks/*`.

## Devin startup flow

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.
3. Вибери specialist skill з [agent-skills-catalog.md](./docs/superpowers/agent-skills-catalog.md).
4. Якщо під задачу є playbook, виконуй його як canonical recipe.

## Devin-specific нотатки

- Перед claim про completion запускай явні verification commands.
- Для multi-surface змін вирішуй один primary surface і один primary playbook; не міксуй кілька workflow без причини.
- Якщо задача торкає docs/governance/skills/playbooks, стався до них як до production surfaces: перевір індекси, схеми, sync gates і CODEOWNERS coverage.

## Канонічні посилання

- Repo contract: [AGENTS.md](./AGENTS.md)
- Playbook taxonomy: [docs/playbooks/README.md](./docs/playbooks/README.md)
- Playbook catalog: [docs/playbooks/playbook-catalog.md](./docs/playbooks/playbook-catalog.md)
- Review checklist: [docs/governance/review-checklist.md](./docs/governance/review-checklist.md)
