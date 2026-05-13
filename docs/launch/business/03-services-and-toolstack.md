# 03. Сервіси та тулстек

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> Повний аудит зовнішніх сервісів, інфраструктури, dev-інструментів: що є, що додати, що змінити.
> Кожен запис — з офіційним посиланням, фактичною ціною (Date checked: 2026-04), статусом у Sergeant.
> Джерело: `sergeant-services-audit.md` + `sergeant-toolstack.md` + перевірка `package.json`, `railway.toml`, `vercel.json`, `apps/server/src/lib/**`, `apps/server/src/env.ts`, `ops/`.

---

## 1. Архітектурна карта (поточний стек)

```
                   FRONTEND                          BACKEND                          DATA
              +-------------------+             +---------------------+         +----------------+
              | apps/web          |    HTTPS    | apps/server         |         | PostgreSQL     |
              | Vite + React 18   |------------>| Express + Node 20   |-------->| Railway managed|
              | PWA (Workbox)     |   API       | Better Auth         |         | + pgvector ext.|
              | Tailwind CSS 4    |             | Pino logging        |         | Migrations 044+|
              | Sentry (@sentry/  |             | Helmet + CSP        |         +----------------+
              |   react)          |             | Sentry (@sentry/    |                |
              | TanStack Query    |             |   node)             |         +----------------+
              | PostHog (posthog- |             | prom-client         |         | Redis          |
              |   js)             |             | OpenTelemetry SDK   |         | Railway        |
              | Vercel Analytics  |             | PostHog (server)    |         | Rate limiting  |
              +-------------------+             | BullMQ + ioredis    |         | BullMQ queues  |
              | Vercel (Hobby)    |             +---------------------+         | In-mem fallback|
              +-------------------+             | Railway             |         +----------------+
                                                | (Dockerfile.api)    |
                                                +---------------------+

              MOBILE                             EXTERNAL APIs
              +-------------------+             +---------------------+
              | apps/mobile       |             | Anthropic Claude    |  AI chat, coach, nutrition
              | Expo 52 + RN 0.76 |             | Voyage AI           |  Embeddings (AI memory)
              | NativeWind + MMKV |             | Monobank API        |  Банк-синк (webhooks)
              +-------------------+             | USDA FoodData       |  Barcode / nutrition
              | apps/mobile-shell |             | OpenFoodFacts       |  Barcode fallback
              | Capacitor wrapper |             | FCM (Android push)  |  via google-auth-library
              +-------------------+             | APNs (iOS push)     |  via @parse/node-apn
                                                | Resend              |  Transactional email
              OPS / CONSOLE                     | Web Push (VAPID)    |  via web-push
              +-------------------+             +---------------------+
              | tools/openclaw     |
              | grammy (Telegram) |             CI / CD
              | + OpenClaw bot    |             +-------------------+
              | Anthropic SDK     |             | GitHub Actions    |
              +-------------------+             | Turborepo cache   |
              | n8n (26 workflows |             | Husky + lint-stgd |
              |   in ops/n8n-…/)  |             | Storybook+Argos CI|
              +-------------------+             | Detox (Android+iOS)|
              | Grafana + Alloy + |             +-------------------+
              | Prometheus scrape |
              +-------------------+
```

### Верифікація стеку проти кодової бази

| Сервіс / бібліотека         | Де в коді                                                                                                        | Статус    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| Vite + React 18 SPA         | `apps/web/package.json` → `vite`, `react ^18`                                                                    | in use    |
| Express + Node 20           | `apps/server/package.json` → `express ^4.22`                                                                     | in use    |
| PostgreSQL (pg + pgvector)  | `apps/server/package.json` → `pg ^8.20`; `docker-compose.yml` → `pgvector/pgvector:pg16`                         | in use    |
| Redis (ioredis)             | `apps/server/src/lib/redis.ts`, `ioredis ^5.6`                                                                   | in use    |
| Better Auth                 | `apps/server/package.json` → `better-auth ^1.6`                                                                  | in use    |
| Anthropic Claude            | `apps/server/src/lib/anthropic.ts`                                                                               | in use    |
| **Voyage AI (embeddings)**  | env `VOYAGE_API_KEY`; `apps/server/src/modules/ai-memory/**` (pgvector + RAG)                                    | in use    |
| Sentry (web + server)       | `@sentry/react ^8.55`, `@sentry/node ^8.55`                                                                      | in use    |
| **PostHog (web + server)**  | `posthog-js ^1.372`; `apps/server/src/lib/posthog.ts`; `apps/web/src/core/observability/posthog.ts`              | in use    |
| **PostHog (mobile)**        | `apps/mobile/src/observability/posthog.ts` (env `EXPO_PUBLIC_POSTHOG_KEY`)                                       | in use    |
| Vercel Analytics            | `@vercel/analytics ^2.0` у `apps/web`                                                                            | in use    |
| **OpenTelemetry**           | `@opentelemetry/sdk-node ^0.57`; `apps/server/src/obs/tracing.ts`                                                | in use    |
| Web Push (VAPID)            | `apps/server/package.json` → `web-push ^3.6`                                                                     | in use    |
| APNs                        | `@parse/node-apn ^8.1`                                                                                           | in use    |
| FCM                         | `google-auth-library ^10.6`                                                                                      | in use    |
| Prometheus                  | `prom-client ^15.1`; `ops/prometheus/`                                                                           | in use    |
| Pino                        | `pino ^10.3`, `pino-http ^11.0`                                                                                  | in use    |
| Helmet                      | `helmet ^8.1`                                                                                                    | in use    |
| Resend                      | env `RESEND_API_KEY`; `authTransactionalMail.ts`                                                                 | in use    |
| Monobank webhook            | env `MONO_WEBHOOK_ENABLED`; `bankProxy.ts`                                                                       | in use    |
| USDA / OpenFoodFacts        | `apps/server/src/lib/nutritionResponse.ts`                                                                       | in use    |
| PWA (vite-plugin-pwa)       | `apps/web/vite.config.js`                                                                                        | in use    |
| Vercel (Hobby)              | `vercel.json` (root + `apps/web`)                                                                                | in use    |
| Railway (Dockerfile.api)    | `railway.toml` → `Dockerfile.api`                                                                                | in use    |
| Turborepo                   | root `package.json` → `turbo ^2.9`                                                                               | in use    |
| TanStack Query              | `@tanstack/react-query ^5.99`                                                                                    | in use    |
| Expo 52 + React Native 0.76 | `apps/mobile/package.json`                                                                                       | in use    |
| Capacitor (mobile-shell)    | `apps/mobile-shell/`                                                                                             | in use    |
| **BullMQ**                  | `apps/server/package.json` → `bullmq ^5.0`; `apps/server/src/lib/jobs/**` (authMail, ftuxDrip, ai-memory ingest) | in use    |
| **Telegram bot (grammy)**   | `tools/openclaw` → `grammy ^1.31`; OpenClaw cofounder bot (ADR-0031)                                             | in use    |
| **n8n workflows**           | `ops/n8n-workflows/` — 26 workflow-ів (manifest.json) ; ADR-0026                                                 | in use    |
| **Grafana + Alloy**         | `ops/grafana/dashboards/**`, `ops/grafana-alloy/` (Prometheus → Grafana Cloud scrape)                            | in use    |
| **Storybook + Argos**       | `apps/web` → `storybook ^10.3`, `@argos-ci/playwright ^6.6` (visual regression)                                  | in use    |
| **Detox E2E**               | `.github/workflows/detox-{android,ios}.yml`                                                                      | in use    |
| **Drizzle ORM**             | `packages/db-schema` → `drizzle-orm ^0.45`                                                                       | in use    |
| Stripe                      | _немає в коді_                                                                                                   | to add    |
| React Email                 | _немає в коді_                                                                                                   | to add    |
| Loops (drip)                | _немає в коді_                                                                                                   | to add    |
| Crisp                       | _немає в коді_                                                                                                   | to add    |
| Tally                       | _немає в коді_                                                                                                   | to add    |
| UptimeRobot                 | _не налаштовано_ (згадано в ops-доках)                                                                           | to add    |
| Termly / CookieYes          | _не використовується_                                                                                            | to add    |
| Cloudflare R2               | _немає в коді_                                                                                                   | evaluated |

---

## 2. Каталог сервісів за категоріями

### 2.1 Хостинг і деплой

| Сервіс            | Сайт                                                                  | Free tier                                                                       | Paid tier                                                                                                       | Date checked | Why this / Why not                                                                                      | Status    |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- | --------- |
| **Vercel**        | [vercel.com](https://vercel.com)                                      | Hobby: 100 GB bandwidth, 1M invocations, 6 000 build-min/mo, 1 concurrent build | Pro: $20/user/mo + usage; 1 TB bandwidth, 12 concurrent builds                                                  | 2026-04      | CDN + preview deploys + immutable caching; ідеально для SPA/PWA. Для одного розробника Hobby вистачає.  | in use    |
| **Railway**       | [railway.app](https://railway.app)                                    | Trial: $5 credit, 512 MB RAM                                                    | Hobby: $5/mo + usage ($5 credit); 8 GB RAM, 10 GB disk. Pro: $20/mo + usage ($20 credit); 32 GB RAM, 50 GB disk | 2026-04      | Backend + managed Postgres + Redis в одному місці; auto-deploy з GitHub. Usage-based, прозорий pricing. | in use    |
| **EAS Build**     | [expo.dev/eas](https://expo.dev/eas)                                  | Free: 15 Android + 15 iOS builds/mo, low-priority queue, 45-min timeout         | Starter: $19/mo ($45 credit); Production: $199/mo ($225 credit), 50K MAU                                        | 2026-04      | Потрібен для нативних білдів Expo 52. Free tier достатній для розробки; Production — для CI/CD.         | to add    |
| **Cloudflare R2** | [developers.cloudflare.com/r2](https://developers.cloudflare.com/r2/) | 10 GB storage, 1M Class A ops, 10M Class B ops/mo, $0 egress                    | $0.015/GB-mo storage, $4.50/1M Class A, $0.36/1M Class B                                                        | 2026-04      | S3-compatible + нуль egress fees. Для фото їжі, PDF-експорту. Не MVP — Phase 2+.                        | evaluated |

### 2.2 CI / CD

| Сервіс             | Сайт                                                               | Free tier                                                              | Paid tier                                              | Date checked | Why this / Why not                                                                                     | Status |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| **GitHub Actions** | [github.com/features/actions](https://github.com/features/actions) | Free: 2 000 Linux min/mo, 500 MB storage (public repos: unlimited min) | Team: $4/user/mo, 3 000 min. Overage: $0.006/min Linux | 2026-04      | Вже в CI (`ci.yml`): lint, test, build, typecheck, a11y, coverage, license, security audit, Detox E2E. | in use |
| **Turborepo**      | [turbo.build](https://turbo.build)                                 | Remote cache: free for Vercel users                                    | Pro: included with Vercel Pro                          | 2026-04      | Monorepo task orchestration. Значно прискорює CI через remote cache.                                   | in use |

### 2.3 Моніторинг / observability

| Сервіс                         | Сайт                                         | Free tier                                                               | Paid tier                                                    | Date checked | Why this / Why not                                                                                                                                                  | Status |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Sentry**                     | [sentry.io](https://sentry.io)               | Developer: 1 user, 5K errors/mo, 5M spans, 50 replays, 30-day retention | Team: $26/mo, 50K errors, 90-day retention. Business: $80/mo | 2026-04      | Error tracking web + server. SDK вже інтегровано (`@sentry/react`, `@sentry/node`). Free tier достатній для раннього етапу.                                         | in use |
| **Prometheus** + `prom-client` | [prometheus.io](https://prometheus.io)       | Self-hosted, $0                                                         | N/A (open-source)                                            | 2026-04      | HTTP RED metrics, DB, AI quota. `/metrics` ендпоінт вже є. Конфіг скрейпера — `ops/prometheus/`.                                                                    | in use |
| **Grafana + Alloy**            | [grafana.com](https://grafana.com)           | Forever free: 10K metrics, 50 GB logs, 50 GB traces                     | Pro: $29/mo + usage                                          | 2026-05      | Дашборди + alloy collector. Конфіг — `ops/grafana/dashboards/**` + `ops/grafana-alloy/`. Cloud-стек налаштовано (`grafana` секрет у env).                           | in use |
| **OpenTelemetry**              | [opentelemetry.io](https://opentelemetry.io) | Open-source, $0                                                         | N/A                                                          | 2026-05      | Distributed tracing на сервері (`@opentelemetry/sdk-node`, `apps/server/src/obs/tracing.ts`). Експортер OTLP → Grafana Tempo / Honeycomb / etc.                     | in use |
| **UptimeRobot**                | [uptimerobot.com](https://uptimerobot.com)   | 50 monitors, 5-min interval                                             | Pro: $7/mo, 1-min interval                                   | 2026-04      | Зовнішній uptime моніторинг + status page. Деталі конфігурації алертів — див. [05-operations-and-automation.md](./05-operations-and-automation.md#зона-1--product). | to add |

### 2.4 Платежі

| Сервіс     | Сайт                             | Free tier                             | Paid tier                                                                 | Date checked | Why this / Why not                                                                                                                                                                                 | Status |
| ---------- | -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Stripe** | [stripe.com](https://stripe.com) | Безкоштовний акаунт, без monthly fees | 2.9% + 30c per tx (US domestic cards). Billing: +0.7%. Disputes: $15 each | 2026-04      | Підписки Pro, Checkout, Customer Portal, webhooks. Глобальний стандарт. Порівняння з LiqPay/Fondy — див. [01-monetization-and-pricing.md](./01-monetization-and-pricing.md#4-платіжні-провайдери). | to add |

**Що створити для Stripe:**

- Stripe Account + Product + Price (monthly ₴99 + yearly ₴799)
- `apps/server/src/routes/internal/billing.ts` — checkout, portal, plan endpoints
- `apps/server/src/routes/stripe-webhook.ts` — webhook handler з `stripe.webhooks.constructEvent()`
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_YEARLY`
- Деталі edge cases (chargeback, webhook miss) — див. [04-launch-readiness.md](./04-launch-readiness.md#21-billing-edge-cases)

### 2.5 AI

| Сервіс                   | Сайт                                                                | Free tier                        | Paid tier                                                                                                             | Date checked | Why this / Why not                                                                                                                        | Status |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Anthropic Claude API** | [anthropic.com](https://docs.anthropic.com/en/about-claude/pricing) | Немає безкоштовного tier для API | Sonnet 4.6: $3/$15 per MTok (input/output). Haiku 4.5: $1/$5 per MTok. Batch: -50%. Prompt caching: -90% cached input | 2026-04      | AI chat, coach, nutrition-фото, weekly digest. Вже інтегровано (`anthropic.ts`). Оптимізація: prompt caching + Haiku для простих запитів. | in use |

**Прогноз витрат Anthropic:**

| MAU    | Avg msgs/user/day | Модель                       | ~Tokens/msg      | Estimated $/mo |
| ------ | ----------------- | ---------------------------- | ---------------- | -------------- |
| 100    | 3                 | Sonnet 4.6                   | ~2K in + ~1K out | $5-15          |
| 1 000  | 3                 | Sonnet 4.6 mix Haiku         | ~2K + ~1K        | $30-80         |
| 10 000 | 2                 | Haiku primary + Sonnet coach | ~2K + ~1K        | $150-400       |

### 2.6 Аналітика

| Сервіс                    | Сайт                                                                         | Free tier                                                              | Paid tier                                         | Date checked | Why this / Why not                                                                                                                                                                       | Status    |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **PostHog**               | [posthog.com](https://posthog.com/pricing)                                   | 1M events, 5K recordings, 1M feature flag requests, 100K exceptions/mo | Pay-as-you-go: from $0.00005/event past free tier | 2026-05      | Funnels + retention + feature flags + session replay + A/B tests. EU-host. Інтегровано на трьох поверхнях: web (`posthog-js`), server (`apps/server/src/lib/posthog.ts`), mobile (Expo). | in use    |
| **Vercel Analytics**      | [vercel.com/analytics](https://vercel.com/analytics)                         | 2.5K events/mo (Hobby)                                                 | Pro: included                                     | 2026-05      | Web Vitals + pageviews. Працює як додатковий privacy-friendly канал поряд з PostHog (`@vercel/analytics ^2.0`).                                                                          | in use    |
| **Plausible**             | [plausible.io](https://plausible.io)                                         | Немає free tier                                                        | From EUR 9/mo (10K pageviews)                     | 2026-04      | Privacy-first. Простіший, але без funnels/feature flags. Не використовується (PostHog покриває).                                                                                         | evaluated |
| **Mixpanel**              | [mixpanel.com](https://mixpanel.com)                                         | 20M events/mo                                                          | Growth: from $28/mo (100M events)                 | 2026-04      | Потужна event-аналітика. Складніший за PostHog для одного розробника.                                                                                                                    | evaluated |
| **Google Search Console** | [search.google.com/search-console](https://search.google.com/search-console) | Повністю безкоштовний                                                  | N/A                                               | 2026-04      | SEO: індексація, позиції, кліки. Обов'язково для landing/blog.                                                                                                                           | to add    |

> **Поточний стан:** PostHog активний (project `Default project` на EU-host, секрет `posthog_api`). Web/Mobile event capture (`VITE_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`), server-side cleanup (`POSTHOG_API_KEY` для GDPR delete-person), GitHub Actions release annotation (`.github/workflows/posthog-release-annotation.yml`), n8n workflow `16-posthog-daily-metrics.json` для Telegram-дайджесту.

### 2.7 Email

| Сервіс          | Сайт                                     | Free tier                                                 | Paid tier                                  | Date checked | Why this / Why not                                                                                                                       | Status |
| --------------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Resend**      | [resend.com](https://resend.com/pricing) | 3 000 emails/mo (100/day cap), 1 domain, 30-day retention | Pro: $20/mo (50K emails), $0.90/1K overage | 2026-04      | Transactional email (auth: password reset, email verify). Вже інтегровано. Для billing-emails — розширити або створити `billingMail.ts`. | in use |
| **React Email** | [react.email](https://react.email)       | Open-source, $0                                           | N/A                                        | 2026-04      | JSX-to-HTML шаблони. Красиві billing emails (welcome, payment confirmation, failed, canceled).                                           | to add |
| **Loops**       | [loops.so](https://loops.so)             | Free до 1 000 contacts                                    | Starter: $49/mo (5K contacts)              | 2026-04      | Email drip campaigns (onboarding, re-engagement, winback). Окрема потреба від transactional.                                             | to add |

> **Зв'язка:** Resend (transactional) + Loops (marketing drip).

### 2.8 Push-сповіщення

| Сервіс               | Сайт                                                                                         | Free tier                              | Paid tier | Date checked | Why this / Why not                                                                             | Status |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- | --------- | ------------ | ---------------------------------------------------------------------------------------------- | ------ |
| **Web Push (VAPID)** | [web.dev/push-notifications](https://web.dev/push-notifications-overview/)                   | Безкоштовно (стандарт W3C)             | N/A       | 2026-04      | PWA push. Реалізовано через `web-push` npm.                                                    | in use |
| **FCM**              | [firebase.google.com/docs/cloud-messaging](https://firebase.google.com/docs/cloud-messaging) | Безкоштовно (без лімітів)              | N/A       | 2026-04      | Android push. Через `google-auth-library`. Потрібен `google-services.json` в Firebase project. | in use |
| **APNs**             | [developer.apple.com/notifications](https://developer.apple.com/notifications/)              | Безкоштовно (Apple Developer $99/year) | N/A       | 2026-04      | iOS push. Через `@parse/node-apn`. Потрібен Apple Developer акаунт.                            | in use |

### 2.9 Автентифікація

| Сервіс          | Сайт                                            | Free tier       | Paid tier | Date checked | Why this / Why not                                                                                                                                                               | Status |
| --------------- | ----------------------------------------------- | --------------- | --------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Better Auth** | [better-auth.com](https://www.better-auth.com/) | Open-source, $0 | N/A       | 2026-04      | Email+pwd, bearer, Expo plugin. Self-hosted, повний контроль. `deleteUser` для GDPR. Деталі GDPR — див. [04-launch-readiness.md](./04-launch-readiness.md#14-gdpr--data-rights). | in use |

### 2.10 Банківська інтеграція

| Сервіс           | Сайт                                                  | Free tier                   | Paid tier | Date checked | Why this / Why not                                                                    | Status |
| ---------------- | ----------------------------------------------------- | --------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------- | ------ |
| **Monobank API** | [api.monobank.ua/docs](https://api.monobank.ua/docs/) | Безкоштовно (особистий API) | N/A       | 2026-04      | Webhook-інтеграція для авто-синхронізації транзакцій. Єдиний UA-банк з відкритим API. | in use |

### 2.11 Їжа / Nutrition APIs

| Сервіс                    | Сайт                                                        | Free tier                           | Paid tier | Date checked | Why this / Why not                                     | Status |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------- | --------- | ------------ | ------------------------------------------------------ | ------ |
| **USDA FoodData Central** | [fdc.nal.usda.gov](https://fdc.nal.usda.gov/)               | Безкоштовно (API key, 3 600 req/hr) | N/A       | 2026-04      | Барокод + нутрієнти. Найповніша база для US-продуктів. | in use |
| **OpenFoodFacts**         | [world.openfoodfacts.org](https://world.openfoodfacts.org/) | Безкоштовно (open data)             | N/A       | 2026-04      | Барокод fallback. Краще покриття EU/UA продуктів.      | in use |

### 2.12 Cron / Scheduled jobs / workflow automation

| Сервіс           | Сайт                                                                                 | Free tier                        | Paid tier          | Date checked | Why this / Why not                                                                                                                                                                                          | Status    |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **BullMQ**       | [docs.bullmq.io](https://docs.bullmq.io/)                                            | Open-source, $0 (потребує Redis) | N/A                | 2026-05      | Інтегровано (`bullmq ^5.0`). Черги: `auth-mail`, `ftux-drip`, `ai-memory-ingest`, `mono-enrichment`. Worker — у тому ж процесі сервера, fallback на in-process direct dispatch якщо `REDIS_URL` не заданий. | in use    |
| **n8n**          | [n8n.io](https://n8n.io)                                                             | Self-hosted, $0                  | Cloud: from $20/mo | 2026-05      | 26 workflow-ів у `ops/n8n-workflows/` (billing, failed-payment, sentry routing, backup verification, daily metrics, growth funnel snapshot, etc.). Source-of-truth — git (ADR-0026). Секрет: `n8n_API`.     | in use    |
| **Railway Cron** | [docs.railway.app/reference/cron-jobs](https://docs.railway.app/reference/cron-jobs) | Включено в Hobby                 | Включено в Pro     | 2026-04      | Альтернатива для простих per-час задач. Зараз не використовується — replaceable через BullMQ repeatable jobs / n8n schedule trigger.                                                                        | evaluated |

> **Розподіл відповідальності:**
>
> - **BullMQ** — internal background jobs всередині сервера (auth email, FTUX drip, AI-memory embedding ingest, Mono-AI enrichment).
> - **n8n** — cross-system workflow automation (Stripe webhook → DB + Telegram, Sentry alerts → Telegram, daily/weekly digests, GitHub PR stale alerts, security audit).
>
> Деталі автоматизації — див. [05-operations-and-automation.md](./05-operations-and-automation.md#зона-6--automation-мета-зона) і [`ops/n8n-workflows/manifest.json`](../../../ops/n8n-workflows/manifest.json).

### 2.13 File storage (Phase 2+)

| Сервіс            | Сайт                                                                  | Free tier        | Paid tier    | Date checked | Why this / Why not                                                              | Status    |
| ----------------- | --------------------------------------------------------------------- | ---------------- | ------------ | ------------ | ------------------------------------------------------------------------------- | --------- |
| **Cloudflare R2** | [developers.cloudflare.com/r2](https://developers.cloudflare.com/r2/) | 10 GB, $0 egress | $0.015/GB-mo | 2026-04      | Для AI-фото їжі (зараз base64 -> Anthropic), аватарки, CSV/PDF експорт. Не MVP. | evaluated |

### 2.14 Підтримка юзерів

| Сервіс           | Сайт                                                         | Free tier                               | Paid tier            | Date checked | Why this / Why not                                                                                                                                                                         | Status |
| ---------------- | ------------------------------------------------------------ | --------------------------------------- | -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **Crisp**        | [crisp.chat](https://crisp.chat/)                            | 2 оператори, live chat + knowledge base | Pro: $25/mo/operator | 2026-04      | In-app чат. Деталі workflow — див. [05-operations-and-automation.md](./05-operations-and-automation.md#зона-5--support).                                                                   | to add |
| **Canny**        | [canny.io](https://canny.io/)                                | Free до 100 постів                      | Starter: $79/mo      | 2026-04      | Feature requests + голосування.                                                                                                                                                            | to add |
| **Telegram бот** | [core.telegram.org/bots](https://core.telegram.org/bots/api) | Безкоштовно                             | N/A                  | 2026-05      | `tools/openclaw` (grammy + Anthropic) — internal ops/marketing console, OpenClaw cofounder bot з memory recall + decision-PR (ADR-0031, ADR-0032). Telegram alert routing через n8n WF-03. | in use |

### 2.15 Юридичне

| Сервіс        | Сайт                                        | Free tier                              | Paid tier                           | Date checked | Why this / Why not                                                                                                                | Status |
| ------------- | ------------------------------------------- | -------------------------------------- | ----------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Termly**    | [termly.io](https://termly.io/)             | Free: Privacy Policy + Terms generator | Pro: $15/mo (cookie consent + more) | 2026-04      | Генератор Privacy Policy + Terms. Деталі вимог — див. [04-launch-readiness.md](./04-launch-readiness.md#11-обовязкові-документи). | to add |
| **CookieYes** | [cookieyes.com](https://www.cookieyes.com/) | Free до 100 pageviews/mo               | Starter: $9/mo                      | 2026-04      | Cookie consent banner для GDPR.                                                                                                   | to add |

### 2.16 Фідбек та дослідження

| Сервіс                     | Сайт                                              | Free tier                                  | Paid tier                           | Date checked | Why this / Why not                           | Status |
| -------------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------- | ------------ | -------------------------------------------- | ------ |
| **Tally**                  | [tally.so](https://tally.so/)                     | Безлімітні форми та відповіді              | Pro: $29/mo (custom domains, logic) | 2026-04      | Форми, NPS, waitlist. Безлімітний free tier. | to add |
| **PostHog Session Replay** | [posthog.com](https://posthog.com/session-replay) | 5K recordings/mo (включено в PostHog free) | Pay-as-you-go past free             | 2026-04      | Замість Hotjar. Вже включено в PostHog.      | to add |

### 2.17 Домен та DNS

| Сервіс               | Сайт                                          | Free tier                  | Paid tier                    | Date checked | Why this / Why not                                                                            | Status |
| -------------------- | --------------------------------------------- | -------------------------- | ---------------------------- | ------------ | --------------------------------------------------------------------------------------------- | ------ |
| **Cloudflare** (DNS) | [cloudflare.com](https://www.cloudflare.com/) | Free: DNS, DDoS, basic CDN | Pro: $20/mo                  | 2026-04      | DNS + DDoS protection. Free tier достатній.                                                   | to add |
| **Домен** (nic.ua)   | [nic.ua](https://nic.ua/)                     | N/A                        | ~$10-20/year (.ua / .com.ua) | 2026-04      | Реєстрація sergeant.com.ua або sergeant.ua.                                                   | to add |
| **Vercel Domains**   | [vercel.com](https://vercel.com/)             | Включено в Hobby           | Включено в Pro               | 2026-04      | Custom domain для фронтенду. Вже налаштовано в `vercel.json` (`.well-known/assetlinks.json`). | in use |

### 2.18 Project management

| Сервіс                       | Сайт                              | Free tier              | Paid tier | Date checked | Why this / Why not                                  | Status |
| ---------------------------- | --------------------------------- | ---------------------- | --------- | ------------ | --------------------------------------------------- | ------ |
| **GitHub Issues + Projects** | [github.com](https://github.com/) | Включено в GitHub Free | N/A       | 2026-04      | Tasks, roadmap, bug tracking. Вже використовується. | in use |

---

## 3. Що додати (action items)

> **Status legend:** `[ ]` — pending, `[x]` — done, `[~]` — partial / in progress.
>
> Підсумок (станом на 2026-05-05): **3 з 10 завершено** (PostHog, BullMQ, Telegram бот), **1 partial** (Grafana Cloud — local-config готова, cloud-стек активний), **6 залишилось** (Stripe, React Email, Loops, Termly+CookieYes, Search Console, EAS Build, Crisp). **Stripe** — головний P0 блокер монетизації.

| #   | Сервіс                         | Пріоритет                         | Done? | Owner-нотатка                                                                                                                                                                                                                           | Cross-link                                                                         |
| --- | ------------------------------ | --------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **Stripe** (payments)          | P0 — блокер монетизації           | `[ ]` | Не інтегровано. Створити акаунт + Product/Price. Міграція `subscriptions`. Модуль `billing.ts` + webhook + `requirePlan()` middleware. n8n workflow-и `01-billing-pipeline` / `02-failed-payment-recovery` вже чекають Stripe webhooks. | [01 -> paywall](./01-monetization-and-pricing.md#6-технічна-реалізація-paywall)    |
| 2   | **PostHog** (analytics)        | P0 — потрібен для funnel tracking | `[x]` | Готово на трьох поверхнях (web/mobile/server) + GitHub release annotation + n8n daily-metrics workflow. EU-host, project `Default project`.                                                                                             | —                                                                                  |
| 3   | **BullMQ** (job queue)         | P1 — subscription lifecycle       | `[x]` | Інтегровано (`bullmq ^5.0`). Активні черги: `auth-mail`, `ftux-drip`, `ai-memory-ingest`, `mono-enrichment`. Subscription-lifecycle черги — додамо разом зі Stripe.                                                                     | [05 -> automation](./05-operations-and-automation.md#зона-6--automation-мета-зона) |
| 4   | **React Email** (templates)    | P1 — billing emails               | `[ ]` | Welcome, payment confirmation, failed, canceled, weekly digest. Розширити `authTransactionalMail.ts` або створити `billingMail.ts`. Чекає на Stripe.                                                                                    | —                                                                                  |
| 5   | **Grafana Cloud** (dashboards) | P2 — production visibility        | `[~]` | Local-конфіг готовий: `ops/grafana/dashboards/n8n-overview.json` + `ops/grafana-alloy/` Prometheus scraper. Cloud-стек налаштовано (`grafana` секрет). Залишилось — провалідувати dashboards активні.                                   | [05 -> product zone](./05-operations-and-automation.md#зона-1--product)            |
| 6   | **Loops** (email marketing)    | P2 — onboarding drip              | `[ ]` | Onboarding sequence, re-engagement, winback. Free до 1K contacts.                                                                                                                                                                       | —                                                                                  |
| 7   | **Termly** + **CookieYes**     | P1 — legal blocker                | `[ ]` | Privacy Policy, Terms, Cookie banner. Вимоги: Google Play, Stripe, GDPR.                                                                                                                                                                | [04 -> legal](./04-launch-readiness.md#11-обовязкові-документи)                    |
| 8   | **Google Search Console**      | P2 — SEO baseline                 | `[ ]` | Підключити домен. Безкоштовно.                                                                                                                                                                                                          | —                                                                                  |
| 9   | **EAS Build**                  | P1 — mobile launch                | `[ ]` | Free: 15+15 builds/mo. Для CI/CD мобілки.                                                                                                                                                                                               | —                                                                                  |
| 10  | **Telegram бот** (support)     | P2 — support                      | `[x]` | `tools/openclaw` (grammy) + OpenClaw cofounder bot. Telegram alert routing — n8n WF-03 (Sentry → topic). **Crisp** (in-app webchat) — окремо, ще `[ ]`.                                                                                 | [05 -> support zone](./05-operations-and-automation.md#зона-5--support)            |

---

## 4. Що змінити в існуючому

### 4.1 Database (PostgreSQL)

| Зміна                          | Пріоритет | Деталі                                                                                                                    |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Додати таблицю `subscriptions` | P0        | Міграція `009_subscriptions.sql` — основа paywall. Деталі тірів — [01](./01-monetization-and-pricing.md#2-тарифні-плани). |
| Railway backups                | P0        | Перевірити що automated daily backups увімкнені. Для production з платежами — обов'язково.                                |
| Connection pooling             | P2        | Зараз `pg Pool` direct. При >50 юзерів — PgBouncer / Railway built-in pooler.                                             |
| Read replicas                  | P3        | Не потрібно до ~10K MAU.                                                                                                  |

### 4.2 Backend (Express / Railway)

| Зміна                      | Пріоритет | Деталі                                                                                                             |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Billing routes             | P0        | `/api/billing/*` — checkout, portal, plan. `/api/webhooks/stripe` — webhook handler.                               |
| `requirePlan()` middleware | P0        | Gate по фічах (cloudSync, aiBriefing тощо).                                                                        |
| Динамічні AI-ліміти        | P0        | `aiQuota.ts` -> `effectiveLimits()` читає план. Зараз hardcoded: user=120, anon=40. Target: Free=5, Pro=unlimited. |
| Stripe webhook security    | P0        | `stripe.webhooks.constructEvent(body, sig, secret)` — захист від спуфінгу.                                         |
| Health check розширити     | P2        | Додати в `/health` перевірку Redis, Stripe connectivity.                                                           |
| Structured billing logs    | P2        | Pino вже є — додати structured events (`subscription_created`, `payment_failed`, ...).                             |
| Railway horizontal scaling | P3        | При >1K MAU. Перевірити що rate-limit через Redis (не in-memory).                                                  |

### 4.3 Frontend (Vite / React / Vercel)

| Зміна            | Пріоритет | Деталі                                                                                |
| ---------------- | --------- | ------------------------------------------------------------------------------------- |
| `usePlan()` hook | P0        | React Query hook для `GET /api/billing/plan`.                                         |
| `<PaywallGate>`  | P0        | Обгортка: children для Pro, paywall card для Free.                                    |
| `BillingSection` | P0        | Нова секція в Settings: план, upgrade, manage, cancel.                                |
| Analytics swap   | P1        | `analytics.ts` -> PostHog. Tracking: `paywall_hit`, `plan_upgraded`, `plan_canceled`. |
| Lock icons       | P2        | Quick actions у `assistantCatalogue` — замок для Pro-only.                            |
| Pricing page     | P2        | Landing-like сторінка або модалка з порівнянням Free vs Pro.                          |

### 4.4 Mobile (Expo / Capacitor)

| Зміна                  | Пріоритет | Деталі                                           |
| ---------------------- | --------- | ------------------------------------------------ |
| Plan check в нативці   | P2        | Expo: `usePlan()` -> той самий API endpoint.     |
| `PaywallGate` (RN)     | P2        | React Native версія компонента.                  |
| `google-services.json` | P1        | Для FCM push. Створити Firebase project.         |
| Google Play billing    | P3        | Google Play Billing API — якщо вимагатимуть IAP. |

### 4.5 CI / CD

| Зміна                 | Пріоритет | Деталі                                                                   |
| --------------------- | --------- | ------------------------------------------------------------------------ |
| Stripe test keys в CI | P1        | GitHub Secrets: `STRIPE_SECRET_KEY_TEST`. Для integration tests billing. |
| Staging environment   | P2        | Railway staging (Stripe test mode). Зараз тільки production.             |
| E2E billing test      | P3        | Playwright: free user -> paywall -> Stripe test checkout -> verify Pro.  |

### 4.6 Security

| Зміна                       | Пріоритет | Деталі                                                                                                                       |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Stripe webhook verification | P0        | `stripe.webhooks.constructEvent()`. Endpoint без auth, але з signature verification.                                         |
| Privacy Policy page         | P0        | Потрібна для Google Play + Stripe + GDPR. Деталі — [04](./04-launch-readiness.md#11-обовязкові-документи).                   |
| Terms of Service            | P0        | Потрібні для платних підписок.                                                                                               |
| GDPR data export            | P1        | `deleteUser` вже є в Better Auth. Додати data export endpoint. Деталі — [04](./04-launch-readiness.md#14-gdpr--data-rights). |

---

## 5. Env-змінні — повний список для production

### Вже є (перевірити що всі заповнені)

```env
# Core
DATABASE_URL=                    # Railway Postgres (direct, для міграцій)
DATABASE_URL_POOL=               # pgBouncer pool URL (optional, runtime queries)
DATABASE_URL_REPLICA=            # Read-replica (optional, analytics offload)
REDIS_URL=                       # Railway Redis (optional, fallback in-memory)
NODE_ENV=production
PORT=3000                        # Railway auto

# Auth
BETTER_AUTH_URL=                 # Railway API URL
BETTER_AUTH_SECRET=              # 32+ char random
ALLOWED_ORIGINS=                 # Vercel domain(s)

# AI
ANTHROPIC_API_KEY=               # Claude API
AI_DAILY_USER_LIMIT=120          # Стане динамічним (plan-based)
AI_DAILY_ANON_LIMIT=40           # Стане динамічним

# AI memory (pgvector + Voyage)
AI_MEMORY_ENABLED=               # майстер-вимикач RAG-pipeline
VOYAGE_API_KEY=                  # Voyage AI embeddings (voyage-3.5-lite)
VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite

# Push
VAPID_PUBLIC_KEY=                # Web Push
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
FCM_SERVICE_ACCOUNT_JSON=        # Android push (google-auth-library)
APNS_P8_KEY=                     # iOS push (@parse/node-apn)

# Email
RESEND_API_KEY=                  # Transactional email

# Mono
MONO_WEBHOOK_ENABLED=
MONO_TOKEN_ENC_KEY=              # 32-byte hex
PUBLIC_API_BASE_URL=             # Railway public URL

# Internal API (machine-to-machine, n8n)
INTERNAL_API_KEY=                # Bearer для /api/internal/* з n8n

# Observability
SENTRY_DSN=
METRICS_TOKEN=                   # Bearer for /metrics

# Analytics (PostHog — вже інтегровано)
VITE_POSTHOG_KEY=                # phc_... (frontend, public)
VITE_POSTHOG_HOST=               # https://eu.i.posthog.com (default)
EXPO_PUBLIC_POSTHOG_KEY=         # mobile capture
EXPO_PUBLIC_POSTHOG_HOST=        # mobile host (default EU)
POSTHOG_API_KEY=                 # server-side (для GDPR delete-person)
POSTHOG_PROJECT_ID=              # для release-annotation workflow
POSTHOG_HOST=                    # server host

# OpenClaw (Telegram cofounder bot)
OPENCLAW_FOUNDER_USER_ID=
OPENCLAW_DAILY_USD_BUDGET=5
OPENCLAW_GITHUB_APP_ID=           # GitHub App для decision PR-ів
OPENCLAW_GITHUB_APP_PRIVATE_KEY=
OPENCLAW_GITHUB_APP_INSTALLATION_ID=
```

### Додати під монетизацію

```env
# Payments (Stripe) — НЕ інтегровано
STRIPE_SECRET_KEY=               # sk_live_...
STRIPE_WEBHOOK_SECRET=           # whsec_...
STRIPE_PRICE_ID_PRO_MONTHLY=     # price_...
STRIPE_PRICE_ID_PRO_YEARLY=      # price_...

# Mobile (коли публікуватимеш)
GOOGLE_PLAY_SERVICE_ACCOUNT=     # JSON credentials для EAS Submit
```

---

## 6. Прогноз місячних витрат

```
                    Pre-launch   Launch       Growth       Scale
                    (month -1)   (month 1)    (month 3)    (month 12)
                    ----------   ---------    ---------    ----------
Infrastructure
  Vercel (Hobby)    $0           $0           $0           $0-20
  Railway (server)  $5           $5-10        $10-20       $30-50
  Railway (Postgres)$5           $5           $5-10        $10-20
  Railway (Redis)   $3           $3           $3-5         $5-10
                    ----------   ---------    ---------    ----------
  Subtotal infra    $13          $13-18       $18-35       $45-100

External APIs
  Anthropic         $5-15        $15-50       $50-200      $100-400
  Stripe            $0           2.9%+30c/tx  2.9%+30c/tx  negotiate
                    ----------   ---------    ---------    ----------
  Subtotal APIs     $5-15        $15-50       $50-200      $100-400

Paid tools
  EAS Build         $0           $0           $0-19        $19-199
  All others free   $0           $0           $0           $0
                    ----------   ---------    ---------    ----------
  Subtotal tools    $0           $0           $0-19        $19-199

Marketing
  Ads budget        ----         ----         5-15K UAH    15-50K UAH
  Content (Claude)  $0           $0           $20          $20
                    ----------   ---------    ---------    ----------

Legal (one-time)    ~5K UAH      ---          ---          ---

TOTAL fixed         ~$18-28/mo   ~$28-68/mo   ~$88-274/mo  ~$184-719/mo
                    + 5K UAH     + Stripe %   + 5-15K UAH  + 15-50K UAH
                    once                      ads          ads

Revenue target      0 UAH        0-3K UAH     10-25K UAH   100K+ UAH
Breakeven subs      ---          ~30 Pro      ~100 Pro     profitable
(at 99 UAH/mo)
```

### Поточні сервіси: зараз vs після монетизації

| Сервіс             | Зараз ($/mo) | Після монетизації ($/mo) | Примітки                                               |
| ------------------ | ------------ | ------------------------ | ------------------------------------------------------ |
| Vercel (frontend)  | $0           | $0                       | Hobby до 100 GB bandwidth                              |
| Railway (server)   | ~$5          | $10-20                   | Залежить від CPU/memory                                |
| Railway (Postgres) | ~$5          | $5-10                    | Usage-based                                            |
| Railway (Redis)    | ~$3          | $3-5                     | BullMQ + AI-memory ingest queue збільшать навантаження |
| Railway (n8n)      | ~$3-5        | $3-5                     | Self-host n8n у тому ж проекті                         |
| Anthropic (AI)     | ~$10-50      | $50-200                  | Залежить від MAU та моделі                             |
| Voyage (embed)     | ~$0-5        | $5-15                    | $0.02/1M tokens, lite-tier                             |
| Resend (email)     | $0           | $0                       | Free tier: 3K emails/mo                                |
| Sentry             | $0           | $0                       | Developer: 5K errors/mo                                |
| Grafana Cloud      | $0           | $0                       | Forever-free tier: 10K metrics                         |
| PostHog            | $0           | $0                       | Free tier: 1M events/mo (вже активний)                 |
| Vercel Analytics   | $0           | $0                       | 2.5K events/mo                                         |
| Stripe             | ---          | 2.9% + 30c               | Per transaction (НЕ інтегровано)                       |
| Firebase / FCM     | $0           | $0                       | Push (безлімітно)                                      |
| **TOTAL**          | **~$26-68**  | **~$76-260**             | Breakeven ~30 Pro subs                                 |

---

## 7. Роадмеп по тижнях

```
WEEK 1: Payments foundation
  +-- Stripe акаунт + Product/Price створити
  +-- Міграція 009_subscriptions.sql
  +-- shared: PlanId, PLAN_GATES, hasAccess()
  +-- server: billing.ts module + routes

WEEK 2: Billing integration
  +-- server: Stripe webhook handler + signature verification
  +-- server: requirePlan() middleware
  +-- server: aiQuota -> динамічні ліміти
  +-- web: usePlan(), PaywallGate, BillingSection

WEEK 3: Frontend + analytics
  +-- web: підключити PaywallGate до UI
  +-- web: lock icons на Pro-фічах
  +-- web: Pricing модалка / сторінка
  +-- PostHog інтеграція (analytics.ts swap)

WEEK 4: Legal + polish + E2E
  +-- Privacy Policy + Terms of Service сторінки
  +-- Billing email templates (Resend + React Email)
  +-- Staging environment на Railway
  +-- E2E тестування повного flow
```

---

## 8. Рекомендований мінімальний стек

```
CATEGORY         SERVICE                  COST           STATUS
-----------      --------------------     -----------    ----------
Dev              Vercel + Railway + GH    ~$13-26/mo     in use
                 Actions + Turborepo + n8n
Payments         Stripe                   % per tx       to add
Analytics        PostHog free tier        $0             in use
                 + Vercel Analytics       $0             in use
Email            Resend                   $0             in use
                 + Loops free             $0             to add
Marketing        Telegram + X + Buffer    $0             to add
Support          Telegram bot (grammy)    $0             in use
                 + OpenClaw cofounder     $0             in use
                 + Crisp free webchat     $0             to add
AI               Anthropic Claude         $10-50/mo      in use
                 + Voyage AI (embed)      $0-5/mo        in use
Monitoring       Sentry                   $0             in use
                 + Grafana + Alloy        $0             in use
                 + Prometheus             $0             in use
                 + OpenTelemetry          $0             in use
                 + UptimeRobot free       $0             to add
QA               Storybook + Argos        $0             in use
                 + Detox E2E              $0             in use
Workflow auto    n8n (26 workflows)       $0 (self-host) in use
                 + BullMQ                 $0 (self-host) in use
Legal            Termly free              $0             to add
Feedback         Tally + PostHog replay   $0             to add
SEO              Google Search Console    $0             to add
--------------------------------------------------------------
TOTAL FIXED      ~$26-68/mo  (infrastructure already paid)
                 + Stripe % from transactions
                 + ~5K UAH one-time (legal / FOP)
                 = Practically $0 additional fixed costs
```

---

## Посилання

- Бізнес-модель, тіри, payment provider порівняння -> [01-monetization-and-pricing.md](./01-monetization-and-pricing.md)
- Маркетингові канали, growth engine, partnerships -> [02-go-to-market.md](./02-go-to-market.md)
- Legal, GDPR, billing edge cases, метрики, чеклист -> [04-launch-readiness.md](./04-launch-readiness.md)
- Коли мігрувати між managed / self-host (фази 1-4, тригери) -> [architecture/hosting-evolution.md](../../architecture/hosting-evolution.md)
- Операційні зони, алерти, n8n/OpenClaw автоматизація -> [05-operations-and-automation.md](./05-operations-and-automation.md)
