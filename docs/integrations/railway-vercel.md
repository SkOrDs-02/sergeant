# Railway (API + PostgreSQL) + Vercel (фронт)

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

## 1. PostgreSQL на Railway

1. У [Railway](https://railway.app) створи **New project** → **Empty project** або **Deploy from GitHub** (спочатку можна лише БД).
2. **Add service** → **Database** → **PostgreSQL**.
3. Після створення відкрий сервіс Postgres → вкладка **Variables** (або **Connect**).
4. Скопіюй **`DATABASE_URL`** (або збери з `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — Railway часто показує готовий connection string).

Цей URL потрібен **тільки бекенду** (Node на Railway), не Vercel.

## 2. API на Railway (той самий репозиторій)

1. **Add service** → **GitHub repo** → обери репозиторій Hub.
2. У налаштуваннях сервісу: **Settings** → якщо не підхопився Dockerfile, вкажи **Dockerfile path**: `Dockerfile.api` (або використай [railway.toml](../../railway.toml) у корені — вже налаштований).
3. У **Variables** додай:

| Змінна                           | Значення                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | **Reference** до змінної Postgres-сервісу: ` ${{ Postgres.DATABASE_URL }}` або встав вручну скопійований рядок                                                                                             |
| `BETTER_AUTH_SECRET`             | Випадковий рядок ≥32 символів                                                                                                                                                                              |
| `BETTER_AUTH_URL`                | Публічний HTTPS URL **цього API** після деплою, напр. `https://hub-api-production.up.railway.app` (без слеша в кінці)                                                                                      |
| `ANTHROPIC_API_KEY`              | Ключ Claude                                                                                                                                                                                                |
| `PORT`                           | Зазвичай Railway підставляє сам; якщо треба — `3000`                                                                                                                                                       |
| `ALLOWED_ORIGINS`                | URL фронту на Vercel, напр. `https://твій-проєкт.vercel.app` (через кому, якщо кілька)                                                                                                                     |
| `RESEND_API_KEY`                 | Опційно, але для листів скидання пароля / верифікації email — ключ [Resend](https://resend.com). Без нього бекенд стартує з warn у логах. Опційно `RESEND_FROM` (відправник з верифікованого домену).      |
| `BETTER_AUTH_CROSS_SITE_COOKIES` | Опційно: `0` — не форсити `SameSite=None` (рідко: один домен через reverse proxy). Якщо не задано, при `BETTER_AUTH_URL` на **https://** кукі налаштовуються для крос-сайтового фронта (Vercel → Railway). |
| `SENTRY_DSN`                     | DSN бекенд-проєкту в Sentry (платформа Node.js). Без цієї змінної `apps/server/src/sentry.ts` стає no-op і помилки не їдуть у Sentry — alert routing у n8n не зрабує. Див. §7.                             |
| `SENTRY_ENVIRONMENT`             | Опційно: `production` / `staging`. Дефолт — `NODE_ENV`.                                                                                                                                                    |
| `SENTRY_TRACES_SAMPLE_RATE`      | Опційно: `0..1`. Дефолт `0.1`. `0` явно вимикає трейсинг.                                                                                                                                                  |

4. У **Networking** увімкни **Public networking**, скопіюй домен — це і є база для `BETTER_AUTH_URL`.
5. Задеплой. У логах після старту має бути `[db] Schema verified` і (якщо є `SENTRY_DSN`) `{"msg":"sentry_initialized",...}`.

## 3. Vercel (фронт)

У **Project** → **Settings** → **Environment Variables** (Production / Preview / Development):

| Змінна                           | Значення                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_URL`                    | Публічний URL API (Railway), напр. `https://sergeant-production.up.railway.app`                                                        |
| `VITE_SENTRY_DSN`                | DSN фронт-проєкту в Sentry (платформа `javascript-react`). Без нього `@sentry/react` не підвантажується — економія ~30–40 KB у бандлі. |
| `VITE_SENTRY_ENVIRONMENT`        | Опційно: `production` / `preview`. Дефолт — `MODE`.                                                                                    |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Опційно: `0..1`. Дефолт `0.1`.                                                                                                         |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | Опційно: `0..1` для Session Replay. Дефолт `0` (вимкнено); `replaysOnErrorSampleRate` завжди `1`.                                      |

> **Чому `BACKEND_URL`, а не `VITE_API_BASE_URL`?**
>
> Safari (ITP) блокує third-party cookie, коли фронт і API на різних доменах.
> Edge Middleware (`apps/web/middleware.ts`) проксіює `/api/*` на `BACKEND_URL`,
> роблячи cookie same-origin. Фронтенд використовує відносні шляхи — `VITE_API_BASE_URL`
> **видали** (або залиш порожнім), щоб запити йшли через проксі, а не напряму на Railway.

Перезбери фронт після зміни змінних.

## 4. Локальна БД (Docker)

Якщо хочеш PostgreSQL на машині без хмари:

```bash
docker compose up -d
```

У `.env` (локально):

```env
DATABASE_URL=postgresql://hub:hub@localhost:5432/hub
BETTER_AUTH_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:5173
```

Потім `pnpm start` (API) і `pnpm dev` (Vite).

## 5. Перевірка

- `GET https://<твій-api>.up.railway.app/readyz` (або історичний аліас `/health`) → тіло `ok`, якщо PostgreSQL доступний; інакше **503** і `unhealthy`.
- `GET https://<твій-api>.up.railway.app/livez` → завжди `200 ok`, якщо процес живий (не чіпає БД) — зручно для простого uptime-моніторингу.
- У відповідях API є заголовок `X-Request-Id` (або передай свій `X-Request-Id` з клієнта).
- Реєстрація в застосунку з прод-фронту: куки й CORS мають відповідати `ALLOWED_ORIGINS` і домену API. Safari (ITP) блокує third-party cookie — Edge Middleware у `apps/web/middleware.ts` проксіює `/api/*` через Vercel, роблячи cookie same-origin. Якщо сесія «не тримається» — перевір, що `BACKEND_URL` задано на Vercel і `VITE_API_BASE_URL` **видалено**.

## 6. Моніторинг і логи

- **Healthcheck**:\n+ - **Uptime**: `GET /livez` кожні 1–5 хв.\n+ - **Readiness (з БД)**: `GET /readyz` (або `/health`) — корисно, якщо хочеш алертити саме проблеми з Postgres.\n+ - Алерт при **не 200** або тілі не `ok`.
- **Логи Railway**: шукай за **`X-Request-Id`** з відповіді API або з тіла помилки (`requestId`), щоб зв’язати клієнт і сервер.
- **Структуровані рядки** `{"msg":"http",...}` — фільтруй за `status >= 500` або `path` для регресій.

## 7. Sentry → n8n → Telegram

Error-алерти йдуть з обох Sentry-проєктів (`sergeant-api`, `sergeant-web`) у self-hosted n8n
(Railway) → воркфлоу `03 — Sentry Alert Routing` → Telegram (`Sergeant_alert_bot`).

Як це склеєно (одноразова операція в Sentry/n8n, не в коді репо):

1. **Sentry → Settings → Developer Settings → Custom Integrations → Internal Integration**
   `n8n Alert Routing`: `Webhook URL = <n8n-public>/webhook/sentry-alert`, `Alerts = on`,
   scopes `event:read, project:read, org:read`. Інсталюється в орг автоматично.
2. **Per-project (`sergeant-api`, `sergeant-web`) → Settings → Legacy Integrations → WebHooks**
   увімкнути плагін, у `Callback URLs` вставити той самий `<n8n-public>/webhook/sentry-alert`.
   Це дає action `Send a notification via webhooks` для Issue Alert Rules.
3. **Per-project → Alerts → Rules → Create Issue Alert** з умовою
   `A new issue is created` та action `Send a notification via webhooks`. Існуюча дефолтна
   рулза _Send a notification for high priority issues_ не чіпає n8n — webhook action треба
   додати окремо.
4. **n8n → workflow `03-sentry-alert-routing.json` (active=true)** парсить
   `body.data.issue.{level,title,project.name,count,permalink}` і шле в `TELEGRAM_ALERT_CHAT_ID`.
   Гілки: `level=fatal` → `🚨 FATAL`, інші не-`info` → `⚠️ <level>`.

Воркфлоу/маніфест джерела істини — в [`ops/n8n-workflows/`](../../ops/n8n-workflows/);
ADR — [`docs/adr/0026-n8n-workflow-source-of-truth.md`](../adr/0026-n8n-workflow-source-of-truth.md).
У git `active: false` навмисно (per ADR-0026 — активація це окрема операція в середовищі).

## 8. Railway → n8n → Telegram (deploy notify)

Railway шле webhook-події про деплої у self-hosted n8n (Railway) → воркфлоу
`15 — Railway Deployment Notify` → Telegram (`Sergeant_alert_bot`).

Як це склеєно (одноразова операція в Railway UI, не в коді репо):

1. **Railway → відкрий проєкт** (`humorous-eagerness` для `sergeant-api`,
   `grateful-nurturing` для n8n) → **Settings** → **Webhooks**.
2. Натисни **Add Webhook**, встав URL:
   `https://n8n-production-09ac.up.railway.app/webhook/railway-deploy`.
3. Опційно вибери події (за замовчуванням Railway шле всі deploy-події).
4. Save → з'явиться рядок з кнопкою **Test Webhook** — натисни, щоб переконатись,
   що n8n приймає payload. Має прийти exec на 15 з тестовим Telegram-повідомленням.
5. Повтори те саме для другого проєкту.

Workflow `15` парсить payload Railway формату:

```json
{
  "type": "Deployment.deployed",
  "details": {
    "status": "SUCCESS",
    "branch": "...",
    "commitMessage": "...",
    "commitHash": "..."
  },
  "resource": {
    "service": { "name": "..." },
    "environment": { "name": "..." }
  },
  "severity": "INFO",
  "timestamp": "..."
}
```

Гілки: `status` ∈ `SUCCESS|DEPLOYED|ACTIVE` → ✅ success, інакше → ❌ failed.
Telegram-повідомлення містить: service, env, branch, commit hash + msg, duration.

### Як це бачиться в Railway GraphQL API (для довідки)

Railway-вебхуки (Project Settings → Webhooks) у GraphQL — це насправді
`notificationRule` ресурс з channel-config `{ "type": "WEBHOOK", "url": "<your-url>" }`.
Перелік правил воркспейсу:

```graphql
query {
  notificationRules(workspaceId: "<workspace-id>") {
    id
    eventTypes
    severities
    projectId
    channels {
      id
      config
    }
  }
}
```

**Важливе обмеження**: для **створення** правил workspace-level PAT (`Account
Settings → Tokens → New Token` зі scope = workspace) має достатньо прав, але
**`notificationRuleDelete`/`notificationRuleUpdate`** з того самого PAT повертають
`Not Authorized` — Railway навмисно гейтить mutate-операції на dashboard UI.

**Канонічні `eventTypes`** (lowercase, `<object>.<action>`, виявлені через
`events(projectId: ...)`):

| eventType               | severity   | значення                           |
| ----------------------- | ---------- | ---------------------------------- |
| `Deployment.created`    | `INFO`     | створено deploy                    |
| `Deployment.building`   | `INFO`     | почалась збірка                    |
| `Deployment.snapshoted` | `INFO`     | snapshoted                         |
| `Deployment.deploying`  | `INFO`     | деплоїться (контейнер стартує)     |
| `Deployment.deployed`   | `INFO`     | успішний деплой (status=`SUCCESS`) |
| `Deployment.failed`     | `WARNING`  | build/deploy впав                  |
| `Deployment.crashed`    | `CRITICAL` | контейнер впав після старту        |
| `Deployment.removed`    | `INFO`     | старий деплой знятий               |

`DEPLOY_*` (uppercase, як в legacy webhook payload) — **не** валідні в API.

### Cleanup застарілих правил

Якщо у воркспейсі лишились правила з невірними event-name (`DEPLOY_SUCCEEDED`,
`DEPLOY_FAILED` тощо), вичистити їх можна **тільки через Railway UI**:
**Project → Settings → Webhooks → знайти рядок з URL n8n → ⋮ → Delete**.
Робити це для кожного зайвого webhook-рядка (по проєктах окремо).
