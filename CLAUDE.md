# Claude in Sergeant

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Цей файл — тонкий вказівник із кількома Claude-specific нотатками. Уся repo policy, hard rules, routing catalog і playbook-індекс живуть там і в `docs/`.

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.
3. Завантаж рівно один specialist skill для основної поверхні зміни.
4. Якщо під задачу є playbook у [docs/playbooks/](./docs/playbooks/README.md) — виконуй його як canonical recipe.

## Claude-specific нотатки

- Для browser smoke tests віддавай перевагу локальному / in-app browser workflow.
- Не дублюй repo policy у відповіді, якщо вона вже описана в `AGENTS.md` або playbook — посилайся.
- Для review/merge tasks звіряйся з [docs/governance/review-checklist.md](./docs/governance/review-checklist.md).
