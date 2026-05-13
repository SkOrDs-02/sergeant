# @sergeant/openclaw

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Внутрішня ops-консоль Sergeant — Telegram-бот з multi-agent AI (ops + marketing). Використовує grammy + Anthropic Claude.

## Стек

| Шар     | Технологія                             |
| ------- | -------------------------------------- |
| Runtime | Node 20, TypeScript                    |
| Bot     | grammy (Telegram Bot API)              |
| AI      | Anthropic Claude (`@anthropic-ai/sdk`) |
| Тести   | Vitest                                 |

## Структура

```
src/
├── index.ts        # Entrypoint — запуск бота
├── security.ts     # Валідація дозволених користувачів
├── agents/
│   ├── router.ts   # Роутер між агентами
│   ├── ops.ts      # Ops-агент (інфра, моніторинг, деплой)
│   └── marketing.ts # Marketing-агент (контент, аналітика)
```

## Запуск

```bash
cp tools/openclaw/.env.example tools/openclaw/.env
# Заповни CONSOLE_BOT_TOKEN, ALLOWED_USER_IDS, ANTHROPIC_API_KEY

pnpm --filter @sergeant/openclaw dev     # tsx watch
pnpm --filter @sergeant/openclaw build   # tsc
pnpm --filter @sergeant/openclaw start   # node dist/index.js
```

## Середовище

Див. [`tools/openclaw/.env.example`](.env.example) — потрібні `CONSOLE_BOT_TOKEN`, `ALLOWED_USER_IDS`, `ANTHROPIC_API_KEY`. Опціонально: `SERVER_INTERNAL_URL`, `INTERNAL_API_KEY`.

## Тести

```bash
pnpm --filter @sergeant/openclaw test       # Vitest
pnpm --filter @sergeant/openclaw typecheck  # TypeScript
```
