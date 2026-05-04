# Agents

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

Операційний розділ для AI-агентів у Sergeant — це **operating system для AI-агентів, які працюють у репо**, а не AI-фічі продукту (HubChat, AI Coach, Mono-classifier тощо живуть під `apps/web` і `apps/server` і документуються в окремих модулях). Тут навігація по repo-owned skills, decision trees для типових flow і design specs.

> **History:** до 2026-05-04 цей розділ називався `docs/superpowers/`. Перейменовано в межах initiative 0009 PR 2.2 для усунення термінологічної плутанини між «agent-OS surface» (цей розділ) і product-side AI features.

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
| [`specialists-mapping.md`](./specialists-mapping.md)   | Runtime `SpecialistAgent` ↔ governance skill ↔ primary playbook ↔ ADR.         |
| [`specs/`](./specs)                                    | Design specs для нетривіальних змін, які потребують явного проектного рішення. |

## Політика skill system

- Repo-owned skills мають бути короткими, project-specific і enforce-ити Sergeant policy.
- Generic browser, design, planning, or ecosystem encyclopedia skills не підтримуються як частина Sergeant surface.
- Якщо потрібна загальна capability, агент використовує можливості своєї платформи, а потім застосовує Sergeant specialist skill.
