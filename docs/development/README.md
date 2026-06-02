# Development

> **Last validated:** 2026-06-02 by @claude. **Next review:** 2026-08-31.
> **Status:** Active

Інженерні how-to для локального dev-loop-у: налаштування оточення, lint-config, тулінг
pre-commit. Це reference-матеріал, який читаєш на вимогу — не tracker. Високорівневий
contributor-flow живе в [`CONTRIBUTING.md`](../../CONTRIBUTING.md); тут — точкові
deep-dive-и під конкретні інструменти.

## Документи

| Документ                                               | Призначення                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`eslint-config.md`](./eslint-config.md)               | Структура ESLint flat-config (v9+) та roadmap її розбиття.                              |
| [`local-postgres-setup.md`](./local-postgres-setup.md) | Локальний Postgres через `docker-compose.yml` для розробки й міграцій.                  |
| [`pre-commit-timing.md`](./pre-commit-timing.md)       | Як читати й чим міряти час Husky pre-commit-хуків (закриває P1-5 testing-devx audit-у). |

## Cross-links

- Contributor manual: [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
- Repo-контракт і hard rules: [`AGENTS.md`](../../AGENTS.md).
- Швидкі команди: [`AGENTS.md § Quick commands`](../../AGENTS.md#quick-commands).
