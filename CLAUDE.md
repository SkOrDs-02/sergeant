# Claude in Sergeant

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Цей файл - thin wrapper над [AGENTS.md](./AGENTS.md). Уся repo policy, hard rules, playbooks і routing catalog живуть там та в `docs/`.

## Початок сесії

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Для repo-owned routing починай із `.agents/skills/sergeant-start-here/SKILL.md`.
3. Далі завантаж рівно один specialist skill для основної поверхні зміни.
4. Якщо сценарій має playbook, відкрий його до редагування коду.

## Claude-specific нотатки

- Для browser smoke tests віддавай перевагу локальному/in-app browser workflow.
- Не дублюй repo policy у відповіді, якщо вона вже описана в `AGENTS.md` або playbook.
- Для tasks на review/merge звіряйся з [docs/governance/review-checklist.md](./docs/governance/review-checklist.md).

## Канонічні посилання

- Repo contract: [AGENTS.md](./AGENTS.md)
- Skill catalog: [docs/superpowers/agent-skills-catalog.md](./docs/superpowers/agent-skills-catalog.md)
- Playbooks: [docs/playbooks/README.md](./docs/playbooks/README.md)
- Contributor manual: [CONTRIBUTING.md](./CONTRIBUTING.md)
