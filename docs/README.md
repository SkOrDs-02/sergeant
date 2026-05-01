# Sergeant Documentation

> **Last validated:** 2026-05-01 by @codex. **Next review:** 2026-07-30.
> **Status:** Active

Документація Sergeant згрупована за призначенням. Цей індекс — точка входу для нових учасників, AI-агентів і швидкої навігації по канонічних документах.

## Структура

| Розділ | Призначення |
| --- | --- |
| [`adr/`](./adr/README.md) | Architecture Decision Records — чому обрано конкретні архітектурні рішення. |
| [`api/`](./api/README.md) | OpenAPI 3.1 spec (`openapi.json`), згенерований із zod-схем `packages/shared`. |
| [`architecture/`](./architecture/README.md) | Огляд системи: статус-матриця, frontend overview, API-контракт, платформи. |
| [`audits/`](./audits/README.md) | Періодичні аудити коду та архітектури. |
| [`design/`](./design/README.md) | Брендбук, дизайн-токени, palette / WCAG proposal. |
| [`governance/`](./governance/README.md) | Cadence policies, freshness, policy review. |
| [`integrations/`](./integrations/README.md) | Зовнішні сервіси: Railway, Vercel, Renovate, Monobank. |
| [`launch/`](./launch/README.md) | Запуск продукту: монетизація, GTM, операції. |
| [`mobile/`](./mobile/README.md) | Мобільні додатки: Expo overview, Capacitor shell, deep-links, RN-міграція. |
| [`observability/`](./observability/README.md) | SLO, runbooks, dashboards, logging, metrics. |
| [`planning/`](./planning/README.md) | Roadmap-и: dev-stack, AI-coding, implementation plans. |
| [`playbooks/`](./playbooks/README.md) | Покрокові how-to для типових змін у репо. |
| [`postmortems/`](./postmortems/README.md) | Постмортеми інцидентів. |
| [`security/`](./security/README.md) | Аудит-винятки, vulnerability SLA, нічний скан. |
| [`superpowers/`](./superpowers/README.md) | Agent operating manual, routing catalog, workflows, and specs for Sergeant AI work. |
| [`tech-debt/`](./tech-debt/README.md) | Frontend / backend tech-debt registries. |

## Швидкі лінки

- [`AGENTS.md`](../AGENTS.md) — головний контракт для розробників та AI-агентів.
- [`superpowers/agent-skills-catalog.md`](./superpowers/agent-skills-catalog.md) — який Sergeant skill брати для кожного типового сценарію.
- [`superpowers/agent-workflows.md`](./superpowers/agent-workflows.md) — короткі decision trees для feature, bugfix, review, migration, release.
- [`README.md`](../README.md) — overview репо.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — як комітити, commit conventions, PR flow.

## Як додати документ

1. Обери розділ за призначенням з таблиці вище.
2. Якщо документ не вписується у жоден з розділів, додай новий підкаталог і онови цей індекс в тому ж PR.
3. Для ADR використовуй [`adr/TEMPLATE.md`](./adr/TEMPLATE.md).
4. Для playbook використовуй [`playbooks/_TEMPLATE-decision-tree.md`](./playbooks/_TEMPLATE-decision-tree.md).
5. Якщо документ потребує періодичного огляду, додай канонічний freshness-заголовок `> **Last validated:** ... **Next review:** ...`; auto-discovery підтягне його у tracking автоматично.
