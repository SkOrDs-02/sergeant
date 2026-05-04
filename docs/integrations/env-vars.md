# Environment variables — повний reference

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

Цей документ — канонічний reference усіх змінних оточення Sergeant. Мінімальний `.env` (12 змінних, потрібних для `pnpm dev:web` + `pnpm dev:server`) лежить у [`/.env.example`](../../.env.example) у корені репо. Сюди винесено: повний опис, формати, default-и, наслідки незаповненості, перехресні посилання на код / ADR / hardening-ноти.

**Хто де (target hosting):**

- **Railway (бекенд `apps/server`)**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `USDA_FDC_API_KEY`, `VAPID_*`, `API_SECRET`, `ALLOWED_ORIGINS`, `PORT`, `AI_*`, server-side інтеграції.
- **Vercel (фронт `apps/web`)**: лише `VITE_*` (потрапляють у клієнтський бандл) + `BACKEND_URL` для Vercel Edge Middleware. **Ніколи** не використовуйте префікс `VITE_` для секретів (сесії, БД, приватні ключі API).
- **Mobile (Expo, `apps/mobile`)**: `EXPO_PUBLIC_*` — інлайнються у бандл на build-time.

Деталі топології і проксі: [`docs/integrations/railway-vercel.md`](./railway-vercel.md).

---

## 1. Required for `pnpm dev` (мінімальний набір)

| Змінна                  | Дефолт                                      | Що ламає, якщо не задано                                                                                                                              |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://hub:hub@localhost:5432/hub`   | Сервер не стартує. Локально — `pnpm db:up` піднімає Postgres у Docker. Railway — Reference `${{ Postgres.DATABASE_URL }}`.                            |
| `BETTER_AUTH_URL`       | `http://localhost:3000`                     | Better Auth callback URL. Авто-підставляється, якщо є `REPLIT_DEV_DOMAIN`.                                                                            |
| `BETTER_AUTH_SECRET`    | `change_me_to_a_long_random_string_32chars` | Сесійні кукі неможливо підписати → 500 на /api/auth/\*. Мінімум 32 символи; згенерувати: `openssl rand -base64 32`.                                   |
| `ANTHROPIC_API_KEY`     | `sk-ant-api03-...`                          | HubChat / Fizruk / Nutrition AI повертають 503. Без ключа клієнт виходить раніше з помилкою quota.                                                    |
| `USDA_FDC_API_KEY`      | _empty_                                     | Fallback на DEMO_KEY (40 req/hr shared). У production обов'язковий — інакше штрихкод-сканер падає на 429. Безкоштовно: api.data.gov.                  |
| `VAPID_PUBLIC_KEY`      | _empty_                                     | Web Push не реєструється (фронт ловить помилку у `Notifications.tsx`). Згенерувати: `node -e "console.log(require('web-push').generateVAPIDKeys())"`. |
| `VAPID_PRIVATE_KEY`     | _empty_                                     | Те саме — потрібно у парі з `VAPID_PUBLIC_KEY`.                                                                                                       |
| `VAPID_EMAIL`           | `mailto:you@example.com`                    | Браузери вимагають `mailto:` URI у VAPID claims, інакше push не доставляється.                                                                        |
| `API_SECRET`            | `change_me_to_a_random_string`              | `/api/push/send` приймає довільні запити (security hole). Bearer-токен для server-to-server викликів push-ендпоінта.                                  |
| `ALLOWED_ORIGINS`       | `http://localhost:5173`                     | CORS-preflight ріже фронт (Vite dev server). Через кому: `https://sergeant.vercel.app,https://app.sergeant.app`.                                      |
| `PORT`                  | `3000`                                      | Express слухає 3000.                                                                                                                                  |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:3000`                     | У dev режимі Vite проксує `/api/*` на бекенд. Має співпадати з `PORT`.                                                                                |

---

## 2. Better Auth — крос-доменна авторизація, OAuth, email

### `BETTER_AUTH_CROSS_SITE_COOKIES` _(optional)_

`0` = не форсити `SameSite=None` на сесійних кукі. Виставляйте, якщо фронт і API на одному домені через proxy (Vercel Edge Middleware → Railway), щоб не ламати Safari ITP / Chrome Tracking Protection. **Default**: forsено `None` (для крос-доменних сценаріїв).

### `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` _(optional)_

Список нативних deep-link схем, яким Better Auth довіряє для OAuth callback / cross-origin sign-in. Доповнює `localhost:*` у `getTrustedOrigins()`.

- **Без змінної у production**: тільки `sergeant://` (схема опублікованої RN-аппки, [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts)).
- **Без змінної у dev**: ще додається `exp://` (Expo Go).
- **`exp://` НЕ bound до конкретної аппки** — будь-який Expo Go застосунок на пристрої може її claim-ити, тому у production воно заборонене (закриває [hardening-карту H5](../security/hardening/H5-trusted-origins-exp-scheme.md)).
- Якщо змінну задати — вона **повністю** замінює дефолти (немає merge-режиму). Приклад: `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES=sergeant-staging://`.

### `RESEND_API_KEY`, `RESEND_FROM` _(optional, recommended for prod)_

Resend — транзакційні листи Better Auth (скидання пароля, верифікація email). Без ключа листи не відправляються; у production сервер логне попередження на старті.

- `RESEND_API_KEY=re_...`
- `RESEND_FROM=Sergeant <noreply@yourdomain.com>` — від кого; має бути з верифікованого домену в Resend (для тесту: `onboarding@resend.dev`).

### `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` _(optional)_

Google OAuth (Better Auth `socialProviders.google`). Активує кнопку «Увійти через Google» на AuthPage. Без обох змінних `socialProviders.google` не вмикається і клік повертає `Provider not configured` у `authError`.

- Створення клієнта: [console.cloud.google.com/auth/clients/create](https://console.cloud.google.com/auth/clients/create).
- Authorized redirect URIs мають містити `<BETTER_AUTH_URL>/api/auth/callback/google`.
- У production redirect URI має бути на домені фронта (Vercel Edge Middleware проксує `/api/*`): `https://sergeant.vercel.app/api/auth/callback/google`. Інакше state-cookie ставиться на API-домен як 3rd-party, Safari ITP / Chrome Tracking Protection її ріже → callback повертається з `error=state_mismatch`.
- Локально: `http://localhost:5000/api/auth/callback/google`.

### `REQUIRE_EMAIL_VERIFICATION` _(optional, default `false`)_

Коли `true` — sign-in блокується для неверифікованих email-ів. Default `false`, щоб не лочити legacy-акаунти, створені до того як `sendOnSignUp` був увімкнений. Ops фліпає `true` після soft-gate sweep-у legacy users.

Незалежно від цього flag-а:

- Кожен новий sign-up отримує верифікаційний лист (`auth.ts → sendOnSignUp`).
- `/api/mono/connect` гейтиться на `email_verified=true` через `requireVerifiedEmail()` middleware.

Дивись [`docs/security/hardening/H6-email-verification.md`](../security/hardening/H6-email-verification.md).

### `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` _(optional)_

- `MIN_PASSWORD_LENGTH=10` (default).
- `MAX_PASSWORD_LENGTH=72` — **hard-capped at 72**: bcrypt silently truncates input beyond 72 bytes. Setting >72 is rejected at startup (fail-fast). Дивись [ADR-0042](../adr/0042-password-hashing-strategy.md) щодо міграції на sha256 pre-hash або Argon2id.

---

## 3. Anthropic AI — квоти, circuit breaker, tool-budget

### `AI_DAILY_USER_LIMIT`, `AI_DAILY_ANON_LIMIT` _(optional)_

Денні ліміти викликів AI (таблиця `ai_usage_daily` у Postgres).

- `AI_DAILY_USER_LIMIT=120` (default) — для залогінених користувачів.
- `AI_DAILY_ANON_LIMIT=40` (default) — без сесії, ключ — IP.

### `AI_QUOTA_DISABLED` _(optional, dev/test only)_

`AI_QUOTA_DISABLED=1` повністю вимикає квоту (no-op для `assertAiQuota`). **!!! ТІЛЬКИ для CI/test/dev.** У production `assertStartupEnv()` хард-блокує server-startup, якщо `AI_QUOTA_DISABLED=true` і `NODE_ENV=production` (або `RAILWAY_ENVIRONMENT`/`RAILWAY_SERVICE_NAME` виставлені). Без цього хард-блока випадковий copy-paste flag-а зі staging до prod дав би unlimited Anthropic budget burn. Дивись [`docs/security/ai-quota-kill-switch.md`](../security/ai-quota-kill-switch.md).

### `AI_QUOTA_TOOL_COST`, `AI_QUOTA_TOOL_DEFAULT_LIMIT`, `AI_QUOTA_TOOL_LIMITS` _(optional)_

Tool-use квота (окремий bucket у `ai_usage_daily`). Кожен виклик tool-а (наприклад `change_category`, `create_debt`) коштує `AI_QUOTA_TOOL_COST` одиниць у власному лічильнику `tool:<name>`.

- `AI_QUOTA_TOOL_COST=3` (default).
- `AI_QUOTA_TOOL_DEFAULT_LIMIT=60` (default).
- `AI_QUOTA_TOOL_LIMITS={"change_category":30,"create_debt":10,"create_receivable":10,"hide_transaction":30,"set_budget_limit":10,"set_monthly_plan":5,"mark_habit_done":30,"plan_workout":10,"create_habit":10}` — JSON з лімітами на кожен tool. Tool-и, не вказані у JSON, беруть `AI_QUOTA_TOOL_DEFAULT_LIMIT` (або unlimited якщо пусто).

### `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_CIRCUIT_BREAKER_THRESHOLD`, `AI_CIRCUIT_BREAKER_RESET_MS` _(optional)_

Тюнінг Anthropic-клієнта.

- `AI_TIMEOUT_MS=180000` (default) — таймаут одного AI-запиту.
- `AI_MAX_RETRIES=2` (default) — повторні спроби при transient помилках.
- `AI_CIRCUIT_BREAKER_THRESHOLD=5` (default) — скільки помилок відкривають breaker.
- `AI_CIRCUIT_BREAKER_RESET_MS=30000` (default) — інтервал half-open тесту.

### `N8N_AGENT_DISPATCHER_WEBHOOK_URL` _(optional)_

Console → n8n dispatcher webhook для Telegram-controlled AI agents. Скопіюйте production webhook URL з workflow 20 після імпорту в n8n. Приклад: `https://n8n.your-domain.com/webhook/agent-dispatcher`.

---

## 4. Groq Whisper — голосова транскрипція

### `GROQ_API_KEY` _(optional)_

Використовується ендпоінтом `/api/transcribe` ([VoiceMicButton](../../apps/web/src/components/VoiceMicButton.tsx) на фронті). Без ключа endpoint повертає 503, фронт автоматично відкочується на Web Speech API. Зареєструватися: [console.groq.com/keys](https://console.groq.com/keys).

### `GROQ_TRANSCRIBE_MODEL` _(optional)_

Whisper-модель Groq. **Default**: `whisper-large-v3-turbo` — найдешевший варіант з адекватною якістю українською. Альтернатива: `whisper-large-v3` (точніше, але дорожче).

### `TRANSCRIBE_USD_CAP_DAILY_MICROS` _(optional)_

[Hardening карта H9](../security/hardening/H9-transcribe-usd-cap.md) — per-user-per-day USD cap на `/api/transcribe`, у _micros_ (1 USD = 1_000_000 micros).

- **Default**: `1_000_000` = $1.00 / day / user.
- `0` ефективно вимикає cap (e2e/синтетичні тести).
- Vercel preview зазвичай $5–$10 на день для QA. Прод-default лишай $1.

---

## 5. Voyage AI + pgvector — AI memory (ADR-0028)

Серверна episodic-memory (відмінна від Memory Bank — [ADR-0021](../adr/0021-memory-bank.md), local-first). Storage — `ai_memories` table з pgvector `HALFVEC(1024)` + HNSW + hash-partitioning по `user_id`.

### `AI_MEMORY_ENABLED` _(optional, default `false`)_

Майстер-вимикач. False (default) — `remember()` / `recall()` no-op.

### `VOYAGE_API_KEY` _(optional, required if `AI_MEMORY_ENABLED=true`)_

Voyage AI embedding-провайдер. Без ключа клієнт кидає помилку при першому виклику; PR2 поставить memory-write як `failed` (без retry). Безкоштовний trial: [voyageai.com](https://www.voyageai.com/).

### `VOYAGE_EMBEDDING_MODEL`, `VOYAGE_EMBEDDING_DIM` _(optional)_

- `VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite` (default; multilingual, 1024d).
- **УВАГА**: НЕ використовувати `voyage-3-lite` — він видає 512d, що несумісно з `HALFVEC(1024)` у міграції 025. 1024d-сумісні: `voyage-3.5-lite` (default), `voyage-3`, `voyage-3.5`, `voyage-3-large`.
- `VOYAGE_EMBEDDING_DIM=1024` (default).

### `AI_MEMORY_EMBEDDING_VERSION` _(optional)_

Internal semver embedding-схеми. Bumping triggers re-embed. Default: `1`.

### `VOYAGE_TIMEOUT_MS`, `VOYAGE_MAX_RETRIES`, `VOYAGE_BATCH_SIZE` _(optional)_

- `VOYAGE_TIMEOUT_MS=15000` (default; короткий, бо embedding fast).
- `VOYAGE_MAX_RETRIES=2` (default; на transient 5xx/timeout).
- `VOYAGE_BATCH_SIZE=32` (default; Voyage приймає до 128).

### `AI_MEMORY_HNSW_EF_SEARCH`, `AI_MEMORY_TOP_K` _(optional)_

- `AI_MEMORY_HNSW_EF_SEARCH=40` (default) — search-time ef. Більше → краще recall, повільніше.
- `AI_MEMORY_TOP_K=8` (default) — top-K для retrieval (PR3).

### `AI_MEMORY_INGEST_CONCURRENCY`, `AI_MEMORY_INGEST_ATTEMPTS`, `AI_MEMORY_INGEST_MAX_CONTENT_LEN` _(optional)_

Async-черга `ai-memory-ingest` (BullMQ; Redis-keys під префіксом `sergeant:`). Producer-и: mono webhook (finyk), weekly-digest (digest), `POST /api/ai-memory/ingest` (chat/fizruk/nutrition/routine/journal).

- `AI_MEMORY_INGEST_CONCURRENCY=4` (default) — Voyage rate-limit ~3 RPS на free tier; тримай ≤ 4 на одну реплику.
- `AI_MEMORY_INGEST_ATTEMPTS=5` (default) — спроб (BullMQ attempts) на retryable failure (5xx, 429, network). Backoff: 30s → 2min → 8min → 32min → 2h.
- `AI_MEMORY_INGEST_MAX_CONTENT_LEN=8000` (default) — жорсткий ліміт на content-розмір (чарів). Захист від випадкового embed-у гігабайт-payload-у з мобайл-клієнта.

---

## 6. Postgres pool tuning

| Змінна                     | Default | Опис                                                                      |
| -------------------------- | ------- | ------------------------------------------------------------------------- |
| `PG_POOL_SIZE`             | `10`    | Максимум клієнтів у пулі pg. Railway Hobby — 10 комфортно.                |
| `PG_CONNECTION_TIMEOUT_MS` | `5000`  | Таймаут очікування вільного клієнта з пулу.                               |
| `PG_IDLE_TIMEOUT_MS`       | `30000` | Таймаут idle-з'єднання перед закриттям.                                   |
| `PG_STATEMENT_TIMEOUT_MS`  | `30000` | Максимальний час виконання одного SQL-запиту.                             |
| `DB_MAX_RETRIES`           | `3`     | Кількість повторних спроб при transient помилках БД (40001, deadlock).    |
| `LOG_SLOW_QUERIES`         | `true`  | Логування повільних запитів у warn-лог + метрика `db_slow_queries_total`. |
| `SLOW_QUERY_THRESHOLD_MS`  | `100`   | Поріг для slow-query попереджень.                                         |

---

## 7. Observability — логування, metrics

### `LOG_LEVEL`, `LOG_PRETTY` _(optional)_

- `LOG_LEVEL` — рівень pino-логів. Default: `debug` у dev, `info` у production.
- `LOG_PRETTY=1` → human-readable вивід у dev (pino-pretty). **Не вмикати у prod.**

### `METRICS_TOKEN` _(optional)_

Bearer-токен для захисту `/metrics` (Prometheus scrape endpoint). Якщо не заданий — `/metrics` вимкнений. Для Grafana Agent / Railway scraper: `Authorization: Bearer <METRICS_TOKEN>`.

---

## 8. HTTP / runtime tuning

### `REQUEST_TIMEOUT_MS` _(optional)_

Глобальний timeout HTTP-запиту. **Default**: `120000` (2 хв). `0` = вимкнено.

### `COMPRESSION_ENABLED` _(optional)_

`true` (default) — увімкнути gzip/br стиснення відповідей.

### `SHUTDOWN_GRACE_MS`, `SHUTDOWN_HARD_TIMEOUT_MS` _(optional)_

Graceful shutdown.

- `SHUTDOWN_GRACE_MS=15000` (default) — скільки чекати in-flight запитів після SIGTERM, перш ніж force-close.
- `SHUTDOWN_HARD_TIMEOUT_MS=25000` (default) — hard-cut, після якого `process.exit(1)` — захист від зависання.

### `SSE_HEARTBEAT_MS` _(optional)_

Інтервал comment-frame у `/api/chat` SSE-стрімі. **Default**: `15000` ms — щоб проксі/браузер не різав з'єднання за idle timeout.

### `ALLOWED_ORIGIN_REGEX` _(optional)_

Одинокий regex (без прапорців), який повинен матчити допустимі origin-и. Використовується **на доповнення** до `ALLOWED_ORIGINS` (не замість). Приклад: `^https://pr-\d+\.preview\.example\.com$`.

### `SERVER_MODE` _(optional)_

`replit` | `api` | `full`. Авто-детектиться по `REPLIT_DEV_DOMAIN`, якщо не задано.

### `TRUST_PROXY` _(optional)_

Скільки upstream-проксі hops довіряти при парсингу `X-Forwarded-For`. **Дефолт для Railway = 1** (Railway edge proxy). Якщо додаєте Cloudflare — підніміть кількість hops або задайте explicit CIDR allowlist. Невалідне значення (наприклад `true`) падає при boot-у.

Формати:

```
TRUST_PROXY=1                     ← single hop (Railway default)
TRUST_PROXY=2                     ← Cloudflare + Railway
TRUST_PROXY=10.0.0.0/8,192.168.0.0/16
TRUST_PROXY=loopback,uniquelocal  ← express keyword shortcuts
TRUST_PROXY=false                 ← повністю вимкнути XFF-парсинг
```

`true` **НЕ** підтримується — це робить кожен `req.ip` client-controlled.

---

## 9. Redis tuning

| Змінна                         | Default | Опис                                            |
| ------------------------------ | ------- | ----------------------------------------------- |
| `REDIS_MAX_RETRIES`            | `10`    | Макс. спроб реконекту Redis.                    |
| `REDIS_RECONNECT_DELAY_MS`     | `100`   | Початкова затримка реконекту.                   |
| `REDIS_MAX_RECONNECT_DELAY_MS` | `3000`  | Макс. затримка реконекту з exponential backoff. |

---

## 10. CSP — Content Security Policy

### `CSP_REPORT_ONLY` _(optional)_

`CSP_REPORT_ONLY=1` → `Content-Security-Policy-Report-Only` (тільки логування). Поступове розгортання.

`CSP_DISABLE` видалено в M1 — дивись [`docs/security/hardening/M1-csp-disable-runtime-flag.md`](../security/hardening/M1-csp-disable-runtime-flag.md). Для швидкого вимкнення CSP без блокувань — `CSP_REPORT_ONLY=1`.

---

## 11. Vercel Edge Middleware (фронт-only)

### `BACKEND_URL` _(required for Vercel production)_

Base URL Railway-API, який [`apps/web/middleware.ts`](../../apps/web/middleware.ts) проксує під `/api/*` на домен фронта.

- Має бути виставлений у Vercel Production env, інакше middleware no-op і фронт б'є на пусто (відносні `/api/...` без бекенду).
- Без проксі OAuth ламається на 3rd-party cookie.
- Приклад: `BACKEND_URL=https://sergeant-production.up.railway.app`.

---

## 12. Vite / фронтенд (`VITE_*`)

> Усі `VITE_*` потрапляють у клієнтський бандл — не використовуйте для секретів.

### `VITE_API_BASE_URL` _(optional)_

Базова URL API. ⚠ У production на Vercel — **залишити порожнім** або не виставляти: фронт ходить через відносні `/api/...`, які Vercel Edge Middleware проксує на Railway. Це робить auth-cookie 1st-party до домену фронта і лагодить OAuth-флов (Better Auth state cookie + cross-site cookie restrictions).

Заповнюйте лише якщо фронт хоститься поза Vercel. Приклад: `https://your-api.railway.app`.

### `VITE_WEB_VITALS_ENDPOINT` _(optional)_

Збір Core Web Vitals (LCP/INP/CLS/FCP/TTFB) на бекенд у Prometheus (`POST /api/metrics/web-vitals`). **Default**: увімкнено. `0` вимикає збір без re-deploy.

---

## 13. Sentry (error tracking)

### Бекенд (Railway)

| Змінна                      | Default | Опис                                                          |
| --------------------------- | ------- | ------------------------------------------------------------- |
| `SENTRY_DSN`                | _empty_ | DSN із Sentry-проєкту (тип: Node.js). Без DSN — Sentry no-op. |
| `SENTRY_ENVIRONMENT`        | _empty_ | `production` / `staging` / `dev`.                             |
| `SENTRY_RELEASE`            | _empty_ | Версія релізу (commit SHA).                                   |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1`   | Sample rate для performance traces.                           |

### Фронтенд (Vercel)

| Змінна                           | Default | Опис                                                                     |
| -------------------------------- | ------- | ------------------------------------------------------------------------ |
| `VITE_SENTRY_DSN`                | _empty_ | DSN із Sentry-проєкту (тип: React). Префікс `VITE_` → клієнтський бандл. |
| `VITE_SENTRY_ENVIRONMENT`        | _empty_ | Як і backend.                                                            |
| `VITE_SENTRY_RELEASE`            | _empty_ | Версія релізу.                                                           |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.1`   | Sample rate для performance traces.                                      |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | `0`     | Session Replay sample rate. `0` = вимкнено; `0.1` = 10% сесій.           |

---

## 14. PostHog product analytics

### Web (`VITE_*`)

- `VITE_POSTHOG_KEY=phc_…` — Project API Key з PostHog. Public — можна тримати у клієнтському бандлі. Без ключа PostHog SDK не підтягується, трекінг залишається тільки у локальному ring-buffer (`hub_analytics_log_v1`).
- `VITE_POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud, GDPR-friendly). Для US-регіону: `https://us.i.posthog.com`.

### Server-side (GDPR cleanup)

[ADR-0016 §6.3](../adr/0016-user-deletion-and-pii-handling.md).

- `POSTHOG_API_KEY=phx_…` — Personal API key із project-scope доступом до `persons` (write). Використовується в `deletePostHogPerson(userId)` із cleanup-черги при hard-delete акаунта. Без ключа cleanup-job скіпає PostHog (outcome=skipped) — рекомендовано виставити у production.
- `POSTHOG_PROJECT_ID=12345` — числовий ID проєкту (Settings → Project → ID).
- `POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud, парний до `VITE_POSTHOG_HOST`).

---

## 15. Replit (опційно, авто-визначається)

Sergeant може хоститись на Replit dev-середовищі. Sentinel-змінні авто-детектяться:

- `REPLIT_DEV_DOMAIN=your-repl.repl.co`
- `REPLIT_DOMAINS=your-repl.repl.co`

Якщо виставлені — `BETTER_AUTH_URL` і `SERVER_MODE` авто-резолвляться.

---

## 16. Monobank webhook integration

### `MONO_WEBHOOK_ENABLED` _(optional, default `false`)_

Feature flag: увімкнути webhook-based інтеграцію. Коли `true` — `MONO_TOKEN_ENC_KEY` і `PUBLIC_API_BASE_URL` обов'язкові.

### `MONO_TOKEN_ENC_KEY` _(required if webhook enabled)_

32-byte hex ключ для AES-256-GCM шифрування Monobank токенів. Згенерувати: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### `PUBLIC_API_BASE_URL` _(required if webhook enabled)_

Публічна базова URL API (Railway) для реєстрації webhook у Monobank.

- Webhook URL: `${PUBLIC_API_BASE_URL}/api/mono/webhook/${secret}`.
- Production: `https://sergeant-production.up.railway.app`.
- Dev: `https://xxx.trycloudflare.com` (через `cloudflared tunnel --url http://localhost:3000`).

---

## 17. Monobank / PrivatBank legacy polling proxy

> ⚠ Токени банків **НЕ** читаються з env — вони надходять від клієнта через заголовок `X-Token` і форвардяться до upstream. Сервер їх зберігає лише у memory кешу (хешовано); тривалість і таймаути керуються нижче.

### `BANK_FETCH_TIMEOUT_MS` _(optional)_

Per-attempt таймаут запиту до Monobank/PrivatBank API. **Default**: `15000` (15 с).

- Upstream'и зазвичай відповідають за <2 с, але `/personal/statement` із великим періодом може тягнутись довше.
- Floor 1 с, ceiling 60 с; значення поза смугою ігнорується (fallback на 15_000).
- Скоротити в продакшні корисно якщо upstream нестабільний — швидший fail-over на breaker.

### `BANK_CACHE_TTL_MS` _(optional)_

TTL in-memory дедуп-кешу для ідентичних GET-ів (key = upstream + path + query + sha256(token)). **Default**: `60000` (60 с).

- Балансує свіжість балансу та 429-rate limit на `/personal/statement` (1 req/60s/token).
- `0` вимикає кеш (кожен запит йде в upstream).
- Floor 0, ceiling `600_000` ms (10 хв).

---

## 18. Nutrition backups

### `NUTRITION_BACKUP_KEY_SECRET` _(required for prod)_

Серверний секрет для HMAC-SHA256, що формує ім'я файлу nutrition-backup на диску. Без нього `/api/nutrition/backup-{upload,download}` відповідає 503.

У production обов'язковий — інакше шлях до бекапу можна перебрати (історично було 32-bit FNV-1a, IDOR). Згенерувати: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 19. USDA FDC альтернативний ключ

### `USDA_API_KEY` _(optional, alias)_

Деякі внутрішні скрипти використовують `USDA_API_KEY` замість `USDA_FDC_API_KEY`. Значення можна задати однакове — не плутати з `FDC_API_KEY`, який є помилковим історичним ім'ям.

---

## 20. OpenClaw v0 — Telegram-only co-founder bot (ADR-0031)

> Server-side env. Token + Telegram allowlist живуть у `apps/console` (бот працює там). Сервер відповідає за tool execution + audit log.

### `OPENCLAW_FOUNDER_USER_ID` _(required for OpenClaw)_

Better Auth `user.id` founder-а (для join-у з `ai_memories.user_id`, який партиціонується по `hash(user_id)`). Окремий від `OPENCLAW_FOUNDER_TG_USER_ID` (Telegram numeric `user_id`, у `apps/console/.env`).

### `OPENCLAW_DAILY_USD_BUDGET` _(optional)_

Денний USD cap на Anthropic-token-и через OpenClaw. **Default**: `5` ($5).

Pre-call check: `SUM(cost_usd) WHERE invoked_at >= today_kyiv`. Reach → fail-closed.

### `OPENCLAW_MAX_ITERATIONS` _(optional)_

Hard cap на Plan→Act→Reflect ітерації у одному виклику. **Default**: `8`.

### `OPENCLAW_DAILY_MORNING_AT`, `OPENCLAW_WEEKLY_REVIEW_AT`, `OPENCLAW_MONTHLY_OKR_AT` _(optional)_

Schedule env (TZ-aware human-readable strings; Phase 2 wires actual cron):

- `OPENCLAW_DAILY_MORNING_AT=08:30 Europe/Kyiv`
- `OPENCLAW_WEEKLY_REVIEW_AT=Fri 18:00 Europe/Kyiv`
- `OPENCLAW_MONTHLY_OKR_AT=1 09:00 Europe/Kyiv`

### `OPENCLAW_BROADCAST_MODE` _(optional)_

Broadcast policy: `dm` | `digest` (default — weekly+monthly у 📊 Дайджести) | `all`.

### `OPENCLAW_GITHUB_PAT`, `OPENCLAW_GITHUB_REPO`, `OPENCLAW_GITHUB_BASE_BRANCH` _(optional)_

GitHub PAT з `contents:write` для opening PR-ів з decision markdown у `docs/decisions/`.

- Якщо не задано — `record_decision` пише у Postgres з `git_pr_url=NULL` (manual retry у Phase 2).
- Fallback на `Git_PAT` якщо існує.
- `OPENCLAW_GITHUB_REPO=Skords-01/Sergeant`, `OPENCLAW_GITHUB_BASE_BRANCH=main`.

---

## 21. Mobile (Expo, `apps/mobile`)

### `EXPO_PUBLIC_SENTRY_DSN` _(optional)_

Публічний Sentry DSN для RN-клієнта. Інлайниться у бандл на build-time (префікс `EXPO_PUBLIC_` → доступно в `process.env`). Optional — без нього `initObservability()` виконує no-op і жодних подій у Sentry не відправляється. Дивись [`apps/mobile/src/lib/observability.ts`](../../apps/mobile/src/lib/observability.ts).

### `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` _(optional)_

PostHog для mobile FTUX activation funnel (парний до web — той самий project key, що й `VITE_POSTHOG_KEY`).

- Без ключа `initPostHog()` виконує повний no-op: жодних HTTP-викликів, MMKV-записів чи буферизованої черги.
- `source: "mobile-expo"` super-property розділяє mobile-Expo трафік від web / Capacitor-shell у funnel-ах.
- `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud).

Дивись [`apps/mobile/src/observability/posthog.ts`](../../apps/mobile/src/observability/posthog.ts) і [`docs/launch/ftux-sprint-plan.md`](../launch/ftux-sprint-plan.md) §S0.3.

---

## See also

- [`/.env.example`](../../.env.example) — мінімальний `.env` для `pnpm dev`.
- [`docs/integrations/railway-vercel.md`](./railway-vercel.md) — топологія хостингу + проксі.
- [`docs/agents/onboarding.md`](../agents/onboarding.md) — quickstart для AI-агентів.
- [ADR-0028](../adr/0028-pgvector-ai-memory.md) — pgvector + Voyage AI memory.
- [ADR-0031](../adr/0031-openclaw-v0-telegram-cofounder.md) — OpenClaw v0.
- [ADR-0042](../adr/0042-password-hashing-strategy.md) — bcrypt → sha256 pre-hash / Argon2id.
- [`docs/security/hardening/`](../security/hardening/) — карти H5, H6, H9, M1.
