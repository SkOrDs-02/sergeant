# ADR-0057: Upgrade @anthropic-ai/sdk 0.36.3 → 0.95.x у tools/console

- **Status:** Accepted
- **Date:** 2026-05-11
- **Last validated:** 2026-05-11 by @Skords-01. **Next review:** 2026-08-09.
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** —

---

## Context and Problem Statement

`tools/console` використовував `@anthropic-ai/sdk@^0.36.3` — застарілу версію з deprecated
внутрішніми типами. Найновіший стабільний реліз — `0.95.x`.

## Considered Options

1. **Мігрувати на ^0.95.x** — замінити версію у `package.json`, перевірити сумісність call-sites.
2. **Залишити 0.36.x** — безкоштовно зараз, але технічний борг зростає; нові можливості SDK недоступні.
3. **Перейти на HTTP-клієнт вручну** — зайва складність без переваг.

## Decision

Обрано варіант 1: bumped `@anthropic-ai/sdk` до `^0.95.1` у `tools/console/package.json`. Усі
call-sites (`new Anthropic({ apiKey })`, `client.messages.create()`, type-only imports
`Anthropic.Tool`, `Anthropic.MessageParam`, `Anthropic.ToolResultBlockParam`, `Anthropic.TextBlock`)
повністю сумісні — streaming API (`messages.stream()`) console не використовує.

## Rationale

- 0.95.x — найновіший стабільний реліз; 0.36.x — застарілий.
- Нуль змін у бізнес-логіці: жодного streaming, жодного deprecated endpoint.
- Мінімальний ризик: lockfile оновлюється лише у `tools/console`.

## Consequences

### Positive

- Доступ до нових можливостей SDK (batch API, prompt caching helpers, нові моделі).
- Усунення security-warnings від npm audit для старого major.

### Negative

- Lockfile змінився для `tools/console`.

### Neutral

- Публічний API `messages.create` / типи не змінились — нуль diff у бізнес-коді.

## Compliance

`pnpm --filter @sergeant/console typecheck` проходить без помилок.

## Links

- [Anthropic SDK changelog](https://github.com/anthropics/anthropic-sdk-typescript/releases)
