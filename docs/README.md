# Sergeant Documentation

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Це головний індекс документації Sergeant.

## Швидкий старт

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract і hard rules: [AGENTS.md](../AGENTS.md)
- Agent skills catalog: [superpowers/agent-skills-catalog.md](./superpowers/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./playbooks/playbook-catalog.md)

## Розділи

| Розділ                                        | Призначення                                                      |
| --------------------------------------------- | ---------------------------------------------------------------- |
| [`adr/`](./adr/README.md)                     | Архітектурні рішення і їхній контекст.                           |
| [`api/`](./api/README.md)                     | OpenAPI, API contracts і generated artifacts.                    |
| [`architecture/`](./architecture/README.md)   | Repo map, runtime surfaces, platform architecture.               |
| [`governance/`](./governance/README.md)       | Hard rules registry, review checklists, freshness і policy docs. |
| [`mobile/`](./mobile/README.md)               | Expo/mobile strategy та migration docs.                          |
| [`observability/`](./observability/README.md) | Alerts, SLO, logs, production operations.                        |
| [`planning/`](./planning/README.md)           | Roadmaps, infra plans, staged improvements.                      |
| [`playbooks/`](./playbooks/README.md)         | Canonical execution recipes для repeatable tasks.                |
| [`superpowers/`](./superpowers/README.md)     | Agent operating system, routing catalog і workflows.             |
| [`tech-debt/`](./tech-debt/README.md)         | Активні debt registries і cleanup plans.                         |

## Додавання нової документації

1. Розміщуй документ у відповідному розділі.
2. Якщо це execution recipe, використовуй `docs/playbooks/`.
3. Якщо це policy або machine-readable governance source, використовуй `docs/governance/`.
4. Якщо документ змінює routing для агентів, синхронізуй `docs/superpowers/*` і `AGENTS.md`.
5. Для документів із cadence додавай `Last validated` і `Status`.
