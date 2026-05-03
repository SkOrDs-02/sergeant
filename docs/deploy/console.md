# Deploy `apps/console` (sergeant-hubchat)

> **Status:** Active
> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active
> **Власник:** `sergeant-hubchat`.

## Що це

`apps/console` — Node.js процес, що хостить grammy long-poll-боти Sergeant.
Після [ADR-0032](../adr/0032-console-consolidated-into-openclaw.md) активний
там тільки **`@OpenClaw_sergeant_bot`** (ADR-0031, DM-only co-founder з
chat + slash-командами + ops/marketing tool-ами). Legacy
`@sergeant_console_bot` (ADR-0027) консолідовано в OpenClaw і він тепер
dormant: процес стартує його гілку лише якщо встановлено `CONSOLE_BOT_TOKEN`.

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
- **HTTP:** в long-poll-режимі не слухає (Railway healthcheck — `pgrep -f "node dist/index.js"`). У webhook-режимі (ADR-0041) слухає на `$PORT` і відповідає `GET /healthz` → `200 ok` — після `OPENCLAW_USE_WEBHOOK=true` перевести healthcheck на `GET /healthz`.

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
Після ADR-0032 OpenClaw — primary surface; CONSOLE_BOT_TOKEN optional (fail-soft).

**Required для OpenClaw:**

| Variable                      | Source                                      | Опис                                              |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `OPENCLAW_BOT_TOKEN`          | `@OpenClaw_sergeant_bot` token              | Без значення — OpenClaw тихо не стартує (warn).   |
| `OPENCLAW_FOUNDER_TG_USER_ID` | numeric Telegram id founder-а               | Allowlist single-value (ADR-0031 §2).             |
| `OPENCLAW_FOUNDER_USER_ID`    | Better Auth `users.id` founder-а            | Server-side audit attribution.                    |
| `ANTHROPIC_API_KEY`           | reference `${{Sergeant.ANTHROPIC_API_KEY}}` | Claude tool-use.                                  |
| `SERVER_INTERNAL_URL`         | `http://sergeant.railway.internal:3000`     | Internal API base URL (Railway private DNS).      |
| `INTERNAL_API_KEY`            | reference `${{Sergeant.INTERNAL_API_KEY}}`  | Bearer для `/api/internal/openclaw/*` ендпоінтів. |

**Optional (tool-level, fail-soft):**

Ці передаються `apps/server` через `${{Sergeant.*}}` references — bot їх не читає напряму, але вони мають бути виставлені на server-side щоб `get_*_metrics` tools повертали дані замість `notConfigured: true`.

| Variable               | Опис                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`    | Без неї `get_stripe_metrics` повертає `{notConfigured:true}`.                    |
| `SENTRY_AUTH_TOKEN`    | Без неї `get_sentry_issues` повертає `{notConfigured:true}`.                     |
| `SENTRY_ORG`           | Default `sergeant`. Override якщо org slug інший.                                |
| `POSTHOG_API_KEY`      | Без неї `get_posthog_stats` повертає `{notConfigured:true}`.                     |
| `POSTHOG_PROJECT_ID`   | Те саме — обидва потрібні разом для PostHog tool-у.                              |
| `OPENCLAW_GITHUB_PAT`  | Default — unauthenticated GitHub (60 RPH). PAT піднімає до 5000 RPH.             |
| `OPENCLAW_GITHUB_REPO` | Default `Skords-01/Sergeant`. Repo, з якого `get_github_releases` бере releases. |

**Limits / governance (optional з defaults):**

| Variable                      | Default | Опис                           |
| ----------------------------- | ------- | ------------------------------ |
| `OPENCLAW_MAX_ITERATIONS`     | 8       | Tool-call cap у agent-loop.    |
| `OPENCLAW_RATE_LIMIT_PER_MIN` | 10      | Per-message rate limit.        |
| `OPENCLAW_DAILY_USD_BUDGET`   | 5.0     | Hard $5/day cap (fail-closed). |

**Webhook delivery (ADR-0041; default — long-poll):**

OpenClaw може отримувати update-и через webhook замість long-poll-у — approval-button latency 2-3с → <500мс. Default off (`OPENCLAW_USE_WEBHOOK` unset/false → long-poll); вмикається пер-Railway, dev лишається на long-poll.

| Variable                  | Required when               | Опис                                                                                                                                                   |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENCLAW_USE_WEBHOOK`    | always (default `false`)    | `true` / `1` / `yes` → webhook; усе інше → long-poll. Fail-closed.                                                                                     |
| `OPENCLAW_WEBHOOK_URL`    | `OPENCLAW_USE_WEBHOOK=true` | Публічна HTTPS-URL Railway-сервісу + path. Напр. `https://sergeant-hubchat.up.railway.app/webhook/openclaw`. Має бути `https://`.                      |
| `OPENCLAW_WEBHOOK_SECRET` | `OPENCLAW_USE_WEBHOOK=true` | ≥32 символи, `/^[A-Za-z0-9_-]+$/`. Telegram echo-їть як `X-Telegram-Bot-Api-Secret-Token` header; mismatch → 401. Згенерувати: `openssl rand -hex 24`. |
| `OPENCLAW_WEBHOOK_PATH`   | optional                    | Default `/webhook/openclaw`. Override якщо path конфліктує. URL і path мають збігатись.                                                                |
| `PORT`                    | `OPENCLAW_USE_WEBHOOK=true` | Railway provides automatically. Якщо unset → fallback `OPENCLAW_WEBHOOK_PORT` → `8080`.                                                                |

Активація на Railway:

1. Згенерувати секрет: `openssl rand -hex 24` (48 chars hex).
2. `variableUpsert` для `OPENCLAW_USE_WEBHOOK=true`, `OPENCLAW_WEBHOOK_URL=https://<railway-domain>/webhook/openclaw`, `OPENCLAW_WEBHOOK_SECRET=<secret>`.
3. У service settings перевести healthcheck path на `/healthz` (replace `pgrep`-команду).
4. Redeploy → у логах `[openclaw] webhook registered with Telegram`. Smoke-перевірити tap по будь-якій approve-кнопці; latency p95 має впасти до <500мс.

Backout: `variableDelete OPENCLAW_USE_WEBHOOK` + redeploy → `unregisterOpenClawWebhook` зробить `deleteWebhook` і console повернеться у long-poll за один redeploy.

**Legacy console (dormant після ADR-0032):**

| Variable            | Опис                                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| `CONSOLE_BOT_TOKEN` | Optional. Якщо відсутній — Sergeant Console гілка не стартує, OpenClaw — стартує.   |
| `ALLOWED_USER_IDS`  | Optional. Multi-value allowlist для legacy Console (ігнорується якщо немає токена). |

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
