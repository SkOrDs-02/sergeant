# Sergeant Documentation

> **Last validated:** 2026-04-29 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

> **Last reviewed:** 2026-04-27 by @Skords-01.

Документація Sergeant згрупована за призначенням. Цей індекс — точка входу для
нових учасників і швидкої навігації.

## Структура

| Розділ                                        | Призначення                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| [`adr/`](./adr/README.md)                     | Architecture Decision Records — `чому` обрано конкретні архітектурні рішення.  |
| [`api/`](./api/README.md)                     | OpenAPI 3.1 spec (`openapi.json`), згенерований із zod-схем `packages/shared`. |
| [`architecture/`](./architecture/README.md)   | Огляд системи: статус-матриця, фронтенд-overview, API-контракт, платформи.     |
| [`audits/`](./audits/README.md)               | Періодичні аудити коду / архітектури.                                          |
| [`design/`](./design/README.md)               | Брендбук, дизайн-токени, palette / WCAG proposal.                              |
| [`governance/`](./governance/README.md)       | Cadence policies (freshness, policy review).                                   |
| [`integrations/`](./integrations/README.md)   | Сторонні сервіси: Railway+Vercel, Renovate, Monobank.                          |
| [`launch/`](./launch/README.md)               | Запуск продукту: монетизація, GTM, операції.                                   |
| [`mobile/`](./mobile/README.md)               | Мобільні додатки: Expo overview, Capacitor shell, deep-links, RN-міграція.     |
| [`observability/`](./observability/README.md) | SLO, runbook, dashboards, prometheus rules, logging, metrics.                  |
| [`planning/`](./planning/README.md)           | Roadmap-и: dev-stack, AI-coding.                                               |
| [`playbooks/`](./playbooks/README.md)         | Покрокові how-to для типових змін у репо.                                      |
| [`postmortems/`](./postmortems/README.md)     | Постмортеми інцидентів.                                                        |
| [`security/`](./security/README.md)           | Аудит-винятки, vulnerability SLA, нічний скан.                                 |
| [`superpowers/`](./superpowers/README.md)     | Specs та нотатки для Devin Superpowers.                                        |
| [`tech-debt/`](./tech-debt/README.md)         | Frontend / Backend tech-debt registries.                                       |

## Швидкі лінки

- [`AGENTS.md`](../AGENTS.md) — головний контракт для розробників та AI-агентів.
- [`README.md`](../README.md) — overview репо.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — як комітити, конвенції commit-ів, PR-флоу.

## Як додати документ

1. Обери розділ за призначенням з таблиці вище.
2. Якщо документ не вписується у жоден з розділів — додай новий підкаталог
   та оновлюй цей індекс **в одному PR** з самим документом.
3. Для ADR використовуй [`adr/TEMPLATE.md`](./adr/TEMPLATE.md).
4. Для playbook — [`playbooks/_TEMPLATE-decision-tree.md`](./playbooks/_TEMPLATE-decision-tree.md).
5. Якщо документ потребує періодичного огляду — просто додай канонічний freshness-заголовок (`> **Last validated:** … **Next review:** …`); auto-discovery (`scripts/docs/freshness-config.mjs`) підтягне його у tracking автоматично. Інший cadence — через [`scripts/docs/freshness-config.json`](../scripts/docs/freshness-config.json) → `cadenceOverrides`.
