# 00 · Start — точка входу

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
> **Status:** Active

Звідси починають і люди, і агенти: онбординг, маршрутизація в skill-и,
покрокові рецепти й глосарій. Жанр — **informational** (довідка).

| Розділ                                | Що тут                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| [`agents/`](./agents/README.md)       | Agent OS: routing-каталог skill-ів, workflow-дерева, онбординг агентів.     |
| [`playbooks/`](./playbooks/README.md) | Канонічні execution-рецепти для повторюваних задач (з тригерами).           |
| [`glossary.md`](./glossary.md)        | Доменні й платформні терміни (Finyk, Fizruk, HubChat, OpenClaw, syncV2, …). |

## Контракт жанрів

Playbook живе тут, але не замінює runbook або deploy-doc — кожен жанр має свою аудиторію:

| Жанр           | Де живе                        | Тригер                    | Ключова характеристика                                           |
| -------------- | ------------------------------ | ------------------------- | ---------------------------------------------------------------- |
| **Playbook**   | `docs/00-start/playbooks/`     | Старт повторюваної задачі | _Що_ і _коли_ — агностик до infra                                |
| **Runbook**    | `docs/03-operations/runbooks/` | Інцидент / DR-вправа      | _Як саме_ на нашому стеку (Hetzner/Coolify, pgBouncer, key-ring) |
| **Deploy-doc** | `docs/03-operations/deploy/`   | Конфігурація платформи    | Довідник по Coolify / Vercel-налаштуваннях                       |

Коли додавати новий документ: якщо є покрокові кроки для типового сценарію — playbook тут; якщо є конкретні команди для нашого infra під час інциденту — runbook у `docs/03-operations/runbooks/`; якщо це налаштування платформи — deploy-doc у `docs/03-operations/deploy/`.

Повний каталог playbooks → [`playbooks/README.md`](./playbooks/README.md). Розмежування runbook / playbook → [`docs/03-operations/runbooks/README.md`](../03-operations/runbooks/README.md).

---

Назад до кореня: [`docs/README.md`](../README.md).
