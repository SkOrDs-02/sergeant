# Superpowers

> **Last validated:** 2026-05-01 by @Skords-01. **Next review:** 2026-07-30.
> **Status:** Active

Операційний розділ для AI-агентів у Sergeant. Тут лежить не лише історія design specs, а й канонічна навігація по repo-owned skills.

## З чого починати агенту

1. Відкрий [`AGENTS.md`](../../AGENTS.md) для hard rules і ownership.
2. Стартуй з [`sergeant-start-here`](../../.agents/skills/sergeant-start-here/SKILL.md).
3. За таблицею в [`agent-skills-catalog.md`](./agent-skills-catalog.md) вибери рівно один specialist skill.
4. Для flow-level роботи звіряйся з [`agent-workflows.md`](./agent-workflows.md).

## Підрозділи

| Підрозділ                                              | Призначення                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`agent-skills-catalog.md`](./agent-skills-catalog.md) | Scenario -> skill -> what it enforces.                                         |
| [`agent-workflows.md`](./agent-workflows.md)           | Decision trees для feature, bugfix, review, migration, release.                |
| [`specs/`](./specs)                                    | Design specs для нетривіальних змін, які потребують явного проектного рішення. |

## Політика skill system

- Repo-owned skills мають бути короткими, project-specific і enforce-ити Sergeant policy.
- Generic browser, design, planning, or ecosystem encyclopedia skills не підтримуються як частина Sergeant surface.
- Якщо потрібна загальна capability, агент використовує можливості своєї платформи, а потім застосовує Sergeant specialist skill.
