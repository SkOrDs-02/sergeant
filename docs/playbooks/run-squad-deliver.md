<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Squad deliver — sequential cross-surface feature delivery

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

**Trigger:** Фіча потребує змін у ≥2 surfaces з contract dependencies: DB schema → server serializer → api-client types → web/mobile UI.

## Prerequisites

1. Feature spec або issue з acceptance criteria існує в `docs/05-design/design/specs/` або у PR description.
2. Визначено які surfaces зачеплено (DB? Server? Web? Mobile? HubChat?).

## Кроки

### Крок 1 — Завантаж skill

```
Load skill: sergeant-deliver-squad
```

### Крок 2 — Запусти migration-agent (якщо є schema change)

```
Use the migration-agent subagent.
Task: [опис schema change — які таблиці/колонки, що додається/змінюється]
Feature context: [загальний опис фічі]
```

Чекай на звіт. Він міститиме: назви migration файлів, нові bigint колонки, оновлену схему.

### Крок 3 — Запусти server-agent

```
Use the server-agent subagent.
Task: implement server route and serializer for [feature name]
Migration report: [вставити звіт migration-agent]
Feature context: [загальний опис фічі]
```

Чекай на звіт. Він міститиме: HTTP method + path, JSON response shape.

### Крок 4 — Запусти api-client-agent

```
Use the api-client-agent subagent.
Task: update packages/api-client for [feature name]
Server report: [вставити звіт server-agent — response shape]
```

Чекай на звіт. Він міститиме: оновлені типи, import paths для web/mobile.

### Крок 5 — Запусти web-agent і mobile-agent (паралельно)

Якщо обидва зачеплені:

```
Create an agent team. Spawn 2 teammates:
1. web-agent — implement web UI for [feature name]
2. mobile-agent — implement mobile screen for [feature name]

Context for both: [api-client звіт — import paths, type names]
```

Або якщо тільки web або тільки mobile — запускай відповідний subagent одиночно.

### Крок 6 — Верифікація

```bash
pnpm check
```

## Owner surface

- Primary surface: `apps/server`, `packages/api-client`, `apps/web`, `apps/mobile`
- Coupled surface: `apps/server/src/migrations/` — sequential handoff chain
- Governing skill: `sergeant-deliver-squad`

## Verification

- [ ] Migration файл пронумеровано послідовно і bigint поля задекларовано
- [ ] Server-серіалізатор coerce-ить bigint → number
- [ ] `packages/api-client` типи відповідають JSON response shape
- [ ] `pnpm check` проходить на всіх зачеплених surfaces

## Common mistakes

- Запускати server-agent до завершення migration-agent — serializer не знає bigint fields
- Пропускати api-client-agent, писати web-agent проти server types напряму — заборонено
- Запускати всі агенти паралельно — migration → server → api-client є sequential chain

## Governing skill

[`sergeant-deliver-squad`](../../.agents/skills/sergeant-deliver-squad/SKILL.md)
