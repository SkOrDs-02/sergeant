# Deploy `apps/console` (sergeant-hubchat)

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-08-02.
> **Власник:** `sergeant-hubchat`.

## Що це

`apps/console` — Node.js процес, що хостить **два long-poll grammy-боти** в одному ранчасі:

1. **`@sergeant_console_bot`** (ADR-0027) — multi-agent ops/marketing асистент.
2. **`@OpenClaw_sergeant_bot`** (ADR-0031) — DM-only co-founder bot.

На відміну від `@Sergeant_alert_bot` (push-only, керується n8n через
`api.telegram.org/sendMessage`), цей процес **обов'язково має крутитись 24/7**,
бо grammy long-poll опитує Telegram API в нескінченному циклі.

## Розгортання — Railway service `sergeant-hubchat`

### Project / environment

- Workspace: `46c491e1-507f-415d-995c-0b88751227cb` (Sergeant Workspace)
- Project: `humorous-eagerness` (`eaa696f9-e197-4b76-9645-0e62ce51bb18`) — той самий, де живе `Sergeant` API + `redis` + `sergeant-db`.
- Environment: `production` (`81b68dcb-0107-44ba-b719-df445ea71c71`)

### Build / runtime

- **Dockerfile:** `Dockerfile.console` (root монорепо).
- **Config-as-code:** `railway.console.toml` — `builder=DOCKERFILE`, `restartPolicyType=ON_FAILURE`.
- **Builder:** pnpm-фільтр `@sergeant/console...` + `@sergeant/config...` (мінімальний subgraph).
- **Runtime:** `node dist/index.js` від non-root `app` user-а.
- **HTTP:** не слухає (long-poll only). Railway healthcheck — `pgrep -f "node dist/index.js"`.

### Створення сервісу через Railway GraphQL

Devin/admin може створити сервіс програмно (Railway CLI або GraphQL API). Кроки:

```graphql
mutation {
  serviceCreate(
    input: {
      projectId: "eaa696f9-e197-4b76-9645-0e62ce51bb18"
      name: "sergeant-hubchat"
      branch: "main"
      source: { repo: "Skords-01/Sergeant" }
    }
  ) {
    id
  }
}
```

Після створення — встановити config-as-code path:

```graphql
mutation {
  serviceInstanceUpdate(
    serviceId: "<new-service-id>"
    environmentId: "81b68dcb-0107-44ba-b719-df445ea71c71"
    input: { railwayConfigFile: "railway.console.toml" }
  ) {
    id
  }
}
```

### Required env vars (production)

Виставляються через `variableUpsert` mutation на `serviceId` console-сервісу.

| Variable                      | Source                                      | Опис                                                                  |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `CONSOLE_BOT_TOKEN`           | `@sergeant_console_bot` token               | Sergeant Console long-poll. Без значення — `apps/console` exits 1.    |
| `ALLOWED_USER_IDS`            | CSV Telegram numeric IDs                    | Allowlist для Sergeant Console (multi-value).                         |
| `ANTHROPIC_API_KEY`           | reference `${{Sergeant.ANTHROPIC_API_KEY}}` | Claude tool-use для обох ботів.                                       |
| `SERVER_INTERNAL_URL`         | `http://sergeant.railway.internal:3000`     | Internal API base URL (Railway private DNS).                          |
| `INTERNAL_API_KEY`            | reference `${{Sergeant.INTERNAL_API_KEY}}`  | Bearer для `/api/internal/openclaw/*` ендпоінтів.                     |
| `OPENCLAW_BOT_TOKEN`          | `@OpenClaw_sergeant_bot` token              | Без значення — OpenClaw тихо не стартує (Sergeant Console — стартує). |
| `OPENCLAW_FOUNDER_TG_USER_ID` | numeric Telegram id founder-а               | Allowlist single-value (ADR-0031 §2).                                 |
| `OPENCLAW_FOUNDER_USER_ID`    | Better Auth `users.id` founder-а            | Server-side audit attribution.                                        |
| `OPENCLAW_MAX_ITERATIONS`     | (optional) default 8                        | Tool-call cap у agent-loop.                                           |
| `OPENCLAW_RATE_LIMIT_PER_MIN` | (optional) default 10                       | Per-message rate limit.                                               |
| `OPENCLAW_DAILY_USD_BUDGET`   | (optional) default 5.0                      | Hard $5/day cap (fail-closed).                                        |

### Що робити, якщо щось зламалось

1. **Bot не відповідає, але контейнер running.** Перевірити Railway логи: `Sergeant Console starting…` + `OpenClaw starting…` мають бути в early-startup. Якщо `OPENCLAW_BOT_TOKEN is not set` — додати env var; якщо `OPENCLAW_FOUNDER_USER_ID is not set` — те саме.
2. **Контейнер crash-loop.** `node dist/index.js` exit з кодом 1 = відсутній `CONSOLE_BOT_TOKEN` або `ANTHROPIC_API_KEY`. Long-poll-боти exit-уються рано якщо required env-и нема (fail-closed).
3. **Інший процес не пускає бота.** Telegram дозволяє лише ОДИН long-poll consumer на token. Якщо локально `pnpm console:dev` запущений з тим самим `CONSOLE_BOT_TOKEN` — Railway отримає `409 Conflict`. Зупинити локалку.
4. **Rollback.** Через Railway UI → Deployments → попередній SUCCESS → Rollback. Або повернути попередній commit на main.

## Локальний dev

```bash
cd apps/console
cp .env.example .env       # заповнити CONSOLE_BOT_TOKEN (або dev-bot)
pnpm dev                    # tsx watch src/index.ts
```

Локальний run конфліктуватиме з production long-poll якщо токени однакові.
Створити **окремий dev-bot** через @BotFather — рекомендований pattern.

## Зв'язані ADR / docs

- ADR-0027 — Console agent allow-list і rate-limit policy
- ADR-0031 — OpenClaw v0 (DM-only co-founder bot)
- [service-catalog.md](../architecture/service-catalog.md) — `sergeant-hubchat` рядок
- [secret-ownership-register.md](../security/secret-ownership-register.md)
