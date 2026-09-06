# 00 · Start — точка входу

> **Last touched:** 2026-09-06 by @Skords-01. **Next review:** 2026-12-26.
> **Status:** Active

Звідси починають і люди, і агенти: онбординг, маршрутизація в skill-и,
покрокові рецепти й глосарій. Жанр — **informational** (довідка).

Карта цільового дерева документації та правила вибору canonical home —
[`documentation-architecture.md`](./documentation-architecture.md).

| Розділ                                   | Що тут                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [`agents/`](./agents/README.md)          | Agent OS: routing-каталог skill-ів, workflow-дерева, онбординг агентів. |
| [`playbooks/`](./instructions/README.md) | Канонічні execution-рецепти для повторюваних задач (з тригерами).       |
| [`glossary.md`](./glossary.md)           | Доменні й платформні терміни (Finyk, Fizruk, HubChat, syncV2, …).       |

## Контракт жанрів

Playbook живе тут, але не замінює runbook або deploy-doc — кожен жанр має свою аудиторію:

| Жанр           | Де живе                    | Тригер                    | Ключова характеристика                                           |
| -------------- | -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| **Playbook**   | `docs/start/instructions/` | Старт повторюваної задачі | _Що_ і _коли_ — агностик до infra                                |
| **Runbook**    | `docs/start/instructions/` | Інцидент / DR-вправа      | _Як саме_ на нашому стеку (Hetzner/Coolify, pgBouncer, key-ring) |
| **Deploy-doc** | `docs/operations/deploy/`  | Конфігурація платформи    | Довідник по Coolify / Vercel-налаштуваннях                       |

Коли додавати новий документ: якщо є покрокові кроки для типового сценарію — playbook тут; якщо є конкретні команди для нашого infra під час інциденту — runbook у `docs/start/instructions/`; якщо це налаштування платформи — deploy-doc у `docs/operations/deploy/`.

Повний каталог playbook і runbook → [`instructions/README.md`](./instructions/README.md).

---

Назад до кореня: [`docs/README.md`](../README.md).
