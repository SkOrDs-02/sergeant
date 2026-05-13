# Deploy `tools/openclaw` (sergeant-openclaw)

> **Status:** Active
> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Власник:** `sergeant-hubchat` skill (HubChat governance).
> **Railway service:** `sergeant-openclaw` (раніше `sergeant-hubchat`, перейменовано у PR-47 per ADR-0032 / Pain P10 — див. §«Railway service rename runbook» нижче).
> **Webhook delivery (ADR-0041):** ✅ live in production з 2026-05-03 21:26 UTC. URL `https://sergeant-openclaw-production.up.railway.app/webhook/openclaw` (раніше `sergeant-hubchat-production…`), secret set, healthcheck `GET /healthz`. Backout — unset `OPENCLAW_USE_WEBHOOK` + redeploy.

## Що це

`tools/openclaw` — Node.js процес, що хостить grammy long-poll-боти Sergeant.
Після [ADR-0032](../adr/0032-console-consolidated-into-openclaw.md) активний
там тільки **`@OpenClaw_sergeant_bot`** (ADR-0031, DM-only co-founder з
chat + slash-командами + ops/marketing tool-ами). Legacy
`@sergeant_console_bot` (ADR-0027) консолідовано в OpenClaw і він тепер
dormant: процес стартує його гілку лише якщо встановлено `CONSOLE_BOT_TOKEN`.

На відміну від `@Sergeant_alert_bot` (push-only, керується n8n через
`api.telegram.org/sendMessage`), цей процес **обов'язково має крутитись 24/7**,
бо grammy long-poll опитує Telegram API в нескінченному циклі.

## Розгортання — Railway service `sergeant-openclaw`

### Project / environment

- Workspace: `46c491e1-507f-415d-995c-0b88751227cb` (Sergeant Workspace)
- Project: `humorous-eagerness` (`eaa696f9-e197-4b76-9645-0e62ce51bb18`) — той самий, де живе `Sergeant` API + `redis` + `sergeant-db`.
- Environment: `production` (`81b68dcb-0107-44ba-b719-df445ea71c71`)

### Build / runtime

- **Dockerfile:** `Dockerfile.console` (root монорепо).
- **Config-as-code:** `railway.console.toml` — `builder=DOCKERFILE`, `restartPolicyType=ON_FAILURE`.
- **Deploy filter (`watchPatterns`):** запис у Railway DB (не у `railway.console.toml` — Railway не дозволяє config-as-code для git-trigger полів). Поточний набір — `tools/openclaw/**`, `packages/config/**`, `Dockerfile.console`, `railway.console.toml`, root manifests (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.nvmrc`), `patches/**`. Канонічна версія + причина — у [`./monorepo-deploy-filtering.md`](./monorepo-deploy-filtering.md). Long-poll grammy-боти не люблять зайві рестарти, тому patterns тримаємо вузькими.
- **Builder:** pnpm-фільтр `@sergeant/openclaw...` + `@sergeant/config...` (мінімальний subgraph).
- **Runtime:** `node dist/index.js` від non-root `app` user-а.
- **HTTP:** у production — webhook-режим (ADR-0041, активований 2026-05-03), процес слухає на `$PORT` і відповідає `GET /healthz` → `200 ok`. Railway healthcheck path `/healthz`. У long-poll-режимі (default для local dev і backout) HTTP не слухає, тому healthcheck треба повернути на `pgrep -f "node dist/index.js"` якщо вимикаєш webhook.

### Створення сервісу через Railway GraphQL

Devin/admin може створити сервіс програмно (Railway CLI або GraphQL API). Кроки:

```graphql
mutation {
  serviceCreate(
    input: {
      projectId: "eaa696f9-e197-4b76-9645-0e62ce51bb18"
      name: "sergeant-openclaw"
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

**Webhook delivery (ADR-0041) — ✅ active in production з 2026-05-03 21:26 UTC:**

OpenClaw отримує update-и через webhook замість long-poll-у — approval-button latency 2-3с → <500мс. Code-default off (`OPENCLAW_USE_WEBHOOK` unset/false → long-poll), щоб local dev лишався на long-poll; production-environment у Railway має `OPENCLAW_USE_WEBHOOK=true`.

| Variable                  | Required when               | Production value                                                                                                                                       |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENCLAW_USE_WEBHOOK`    | always (default `false`)    | `true` (set on Railway). `true` / `1` / `yes` → webhook; усе інше → long-poll. Fail-closed.                                                            |
| `OPENCLAW_WEBHOOK_URL`    | `OPENCLAW_USE_WEBHOOK=true` | `https://sergeant-openclaw-production.up.railway.app/webhook/openclaw` (раніше `sergeant-hubchat-production…`, оновлено у PR-47). Має бути `https://`. |
| `OPENCLAW_WEBHOOK_SECRET` | `OPENCLAW_USE_WEBHOOK=true` | 48-char hex (set on Railway, не у git). ≥32 chars, `/^[A-Za-z0-9_-]+$/`. Rotate: `openssl rand -hex 24` → `variableUpsert` → redeploy.                 |
| `OPENCLAW_WEBHOOK_PATH`   | optional                    | Default `/webhook/openclaw`. Override якщо path конфліктує. URL і path мають збігатись.                                                                |
| `PORT`                    | `OPENCLAW_USE_WEBHOOK=true` | Railway provides automatically. Якщо unset → fallback `OPENCLAW_WEBHOOK_PORT` → `8080`.                                                                |

Активація на Railway (already done; залишено як runbook для іншого env-у або після rotation):

1. Згенерувати секрет: `openssl rand -hex 24` (48 chars hex).
2. `serviceDomainCreate` якщо public domain ще нема (один раз на сервіс): `targetPort: 8080`.
3. `variableUpsert × 3` для `OPENCLAW_USE_WEBHOOK=true`, `OPENCLAW_WEBHOOK_URL=https://<railway-domain>/webhook/openclaw`, `OPENCLAW_WEBHOOK_SECRET=<secret>`.
4. `serviceInstanceUpdate` → `healthcheckPath=/healthz` (replace `pgrep`-команду).
5. Redeploy → у логах `OpenClaw starting in webhook mode on :<port><path>…` → `[openclaw] webhook registered with Telegram`.
6. Verify: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` → URL set, `has_custom_certificate=false`, `pending_update_count=0`. Smoke-перевірити tap по будь-якій approve-кнопці; latency p95 має впасти до <500мс.

Backout: `variableDelete OPENCLAW_USE_WEBHOOK` + redeploy → `unregisterOpenClawWebhook` зробить `deleteWebhook` і console повернеться у long-poll за один redeploy. Не забудь повернути healthcheck path на `pgrep -f "node dist/index.js"`, інакше long-poll-контейнер не пройде healthcheck і Railway вб'є його.

**Initial long-poll → webhook race (one-shot, observed 2026-05-03):** при першій активації перший redeploy викликав `setWebhook` ОК (видно в логах нового container-а), але одразу після цього старий long-poll контейнер у graceful-shutdown зробив один `getUpdates`, що неявно очищає webhook на стороні Telegram. `getWebhookInfo` повернув `url=""`. Workaround — після того як `OPENCLAW_USE_WEBHOOK=true` redeploy став SUCCESS, ще раз вручну викликати `setWebhook` через Bot API curl-ом і зробити explicit `serviceInstanceRedeploy`. Подальші webhook → webhook redeploy-и стабільні: старий webhook-контейнер не робить `getUpdates`, тому Telegram-side state не чіпається. Race-condition виникає тільки на першому переході і фіксується одним повторним setWebhook. **W4.1 hardening (backlog):** додати у `tools/openclaw/src/openclaw/bootstrap.ts` poll-and-retry — після `setWebhook` робити `getWebhookInfo`, перевіряти що URL дорівнює очікуваному, при mismatch ще раз `setWebhook` (max 3 retries з backoff). Усуне ручний крок при майбутніх long-poll → webhook міграціях інших ботів.

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

## Railway service rename runbook

> Контекст: PR-47 / Pain P10 / ADR-0032. Repo-side посилання вже вказують на `sergeant-openclaw`, тож потрібно виконати фактичний rename у Railway. Якщо service вже має ім'я `sergeant-openclaw` — пропустити.

Railway _не_ підтримує атомарний rename без рестарту: треба змінити ім'я через GraphQL `serviceUpdate` mutation, після чого public domain і env-vars переїжджають на нове ім'я під час наступного redeploy.

1. **Перейменувати service** (project `humorous-eagerness`, environment `production`):

   ```graphql
   mutation {
     serviceUpdate(
       id: "<sergeant-hubchat-service-id>"
       input: { name: "sergeant-openclaw" }
     ) {
       id
       name
     }
   }
   ```

2. **Перевиставити public domain.** Старий `sergeant-hubchat-production.up.railway.app` перестане резолвитись після rename; Telegram webhook треба перенаправити на новий:

   ```graphql
   mutation {
     serviceDomainCreate(
       input: {
         serviceId: "<service-id>"
         environmentId: "81b68dcb-0107-44ba-b719-df445ea71c71"
         targetPort: 8080
       }
     ) {
       domain
     }
   }
   ```

3. **Оновити webhook env-vars.** `OPENCLAW_WEBHOOK_URL` має містити нове ім'я:

   ```graphql
   mutation {
     variableUpsert(
       input: {
         serviceId: "<service-id>"
         environmentId: "81b68dcb-0107-44ba-b719-df445ea71c71"
         name: "OPENCLAW_WEBHOOK_URL"
         value: "https://sergeant-openclaw-production.up.railway.app/webhook/openclaw"
       }
     )
   }
   ```

4. **Redeploy** через `serviceInstanceRedeploy` — це повторно викличе `setWebhook` з нової URL і Telegram переключиться. Перевірити: `curl https://api.telegram.org/bot<OPENCLAW_BOT_TOKEN>/getWebhookInfo` → `url=https://sergeant-openclaw-production.up.railway.app/webhook/openclaw`, `pending_update_count=0`.

5. **Smoke-перевірка.** Tap по будь-якій approve-кнопці у OpenClaw DM — latency має лишитись <500ms (як до rename-у).

**Backout.** `serviceUpdate` повертає старе ім'я; `OPENCLAW_WEBHOOK_URL` → старий subdomain; redeploy. Webhook відновиться у пам'яті Telegram після наступного `setWebhook`-у. Pending updates не загубляться — `drop_pending_updates: false` зберіг queue.

**Що _не_ змінюється.** `tools/openclaw` directory, `@sergeant/openclaw` npm-package name, `Dockerfile.console`, `railway.console.toml` config-as-code path, healthcheck `GET /healthz`, secret-token. Усі endpoint paths (`/webhook/openclaw`, `/healthz`) ідентичні; зміна тільки у host-частині URL.

## Локальний dev

```bash
cd tools/openclaw
cp .env.example .env       # заповнити CONSOLE_BOT_TOKEN (або dev-bot)
pnpm dev                    # tsx watch src/index.ts
```

Локальний run конфліктуватиме з production long-poll якщо токени однакові.
Створити **окремий dev-bot** через @BotFather — рекомендований pattern.

## Зв'язані ADR / docs

- ADR-0027 — Console agent allow-list і rate-limit policy
- ADR-0031 — OpenClaw v0 (DM-only co-founder bot)
- [service-catalog.md](../architecture/service-catalog.md) — `sergeant-openclaw` рядок (раніше `sergeant-hubchat`)
- [§«Railway service rename runbook»](#railway-service-rename-runbook) — як виконати фактичний rename у Railway dashboard
- [secret-ownership-register.md](../security/secret-ownership-register.md)
