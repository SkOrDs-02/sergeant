# @sergeant/console

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
cp apps/console/.env.example apps/console/.env
# Заповни CONSOLE_BOT_TOKEN, ALLOWED_USER_IDS, ANTHROPIC_API_KEY

pnpm --filter @sergeant/console dev     # tsx watch
pnpm --filter @sergeant/console build   # tsc
pnpm --filter @sergeant/console start   # node dist/index.js
```

## Середовище

Див. [`apps/console/.env.example`](.env.example) — потрібні `CONSOLE_BOT_TOKEN`, `ALLOWED_USER_IDS`, `ANTHROPIC_API_KEY`. Опціонально: `SERVER_INTERNAL_URL`, `INTERNAL_API_KEY`.

## Тести

```bash
pnpm --filter @sergeant/console test       # Vitest
pnpm --filter @sergeant/console typecheck  # TypeScript
```
