# C2 — Containers

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Деплоймент-топологія Sergeant. Кожен контейнер — окремий процес або deploy target.

```mermaid
flowchart TB
    User(["👤 Користувач"])

    subgraph Vercel["Vercel"]
        Web["apps/web<br/><i>Vite SPA + PWA<br/>(Workbox SW + manifest)</i>"]
    end

    subgraph Capacitor["Capacitor (iOS / Android stores)"]
        Shell["apps/mobile-shell<br/><i>Capacitor бандл,<br/>embed apps/web</i>"]
    end

    subgraph Native["Native stores"]
        Mobile["apps/mobile<br/><i>Expo + RN 0.76</i>"]
    end

    subgraph Railway["Railway (production region: eu-west)"]
        direction TB
        Server["apps/server<br/><i>Express + better-auth<br/>+ BullMQ workers in-process</i>"]
        N8N["n8n service<br/><i>cron, mono enrich,<br/>morning briefing</i>"]
        Console["tools/openclaw<br/><i>Telegram bot (grammy)</i>"]

        subgraph DB["Stateful"]
            PG[("PostgreSQL 16<br/><i>+ pgvector</i>")]
            R[("Redis<br/><i>BullMQ queues</i>")]
        end
    end

    Anthropic{{"Anthropic API"}}
    Sentry{{"Sentry SaaS"}}
    Mono{{"Monobank"}}
    OFF{{"OpenFoodFacts"}}
    SMTP{{"SMTP relay<br/><i>(Better Auth mail)</i>"}}
    APNs{{"APNs"}}
    FCM{{"FCM"}}
    Telegram{{"Telegram Bot API"}}

    User -->|HTTPS| Web
    User -->|app store| Shell
    User -->|app store| Mobile
    User <-->|chat| Telegram

    Web -->|/api/* fetch<br/>cookies| Server
    Mobile -->|/api/* fetch<br/>cookies| Server
    Shell -->|embeds| Web

    Server -->|SQL pool| PG
    Server -->|jobs| R
    Server -->|messages stream| Anthropic
    Server -->|errors / spans| Sentry
    Server -->|webhook + REST| Mono
    Server -->|barcode lookup| OFF
    Server -->|sign-in mail| SMTP
    Server -->|web-push / device tokens| APNs
    Server -->|web-push / device tokens| FCM

    N8N -->|HTTP `/api/internal/*`<br/>internal token| Server
    Mono -->|webhook| Server

    Console <-->|long-poll| Telegram
    Console -->|SQL| PG
    Console -->|messages| Anthropic

    classDef cont fill:#0f766e,stroke:#0d9488,color:#fff
    classDef store fill:#7c2d12,stroke:#b45309,color:#fff
    classDef ext fill:#1f2937,stroke:#475569,color:#e5e7eb
    class Web,Shell,Mobile,Server,N8N,Console cont
    class PG,R store
    class Anthropic,Sentry,Mono,OFF,SMTP,APNs,FCM,Telegram ext
```

## BullMQ workers

Зараз `apps/server` стартує BullMQ Queue + Worker **у тому самому процесі**, що й Express:

| Queue              | Файл                                               | Що робить                                                                       |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ai-memory-ingest` | `apps/server/src/modules/ai-memory/ingestQueue.ts` | Embeddings (Voyage AI) для memory-bank entries → Postgres pgvector.             |
| `auth-mail`        | `apps/server/src/lib/jobs/authMail.ts`             | Email magic-link / verification через Better Auth → SMTP (Resend).              |
| `mono-enrich`      | `apps/server/src/modules/mono/enrichmentWorker.ts` | AI-категоризація Monobank транзакцій (Anthropic tool-call per batch). DB-queue. |

> `mono-enrich` зараз — **DB-queue** (`apps/server/src/modules/mono/enrichmentWorker.ts`): polling Postgres замість Redis BullMQ (спрощення після аудиту). Не потребує Redis для роботи. `sampleEnrichmentQueueDepth()` репортить Prometheus gauge.

**Ризик** — крах в worker-loop може уронити API. Виокремлення у standalone worker process — у [`docs/audits/2026-05-03-web-deep-dive` §1.6](../../audits/2026-05-03-web-deep-dive/02-architecture-and-state.md). Поки workers in-process, моніторити Sentry на crashes у `bullmq.Worker.run`.

## Нові server modules (з 2026-04)

Усі розміщені у `apps/server/src/modules/`:

| Module          | Endpoint prefix                      | Опис                                                                                  |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `billing`       | `/api/billing/*`                     | Stripe checkout + subscription state. `billing_subscriptions` table (047).            |
| `transcribe`    | `/api/transcribe`                    | Whisper audio → text з USD-cap per user/day (bucket `transcribe:<model>`, fixed 049). |
| `waitlist`      | `/api/waitlist`                      | Waitlist sign-up і management.                                                        |
| `openclaw`      | internal (console bot)               | GitHub App-flow авторизація (Hard Rule #20) + tools для co-founder bot.               |
| `topic-archive` | internal                             | `tg_topic_archive` — append-only history для Sergeant_ops supergroup topics (048).    |
| `alerts`        | `/api/csp-report`, `/api/web-vitals` | CSP report endpoint + web-vitals ingestion.                                           |
| `observability` | internal                             | Server-side observability helpers: prom-client metrics, store wrappers.               |

## Зовнішні залежності, з яких є SLA-ризик

- **Anthropic API** — chat/coach/digest повністю залежать. У разі 5xx — graceful fallback у `chatHandler` через retry-after.
- **Postgres** — vital. У разі недоступності api-сервер падає healthcheck.
- **Redis** — guards для BullMQ. Якщо Redis unavailable — auth-mail jobs не enqueue-ються, але login flow degrade-аеться gracefully (synchronous send).
- **Mono** — best-effort sync. Webhook-и з ретраями; manual reconciliation за необхідністю.

## Network boundaries

- `User → Web/Mobile/Shell`: HTTPS (Vercel cert / app store).
- `Web/Mobile → Server`: HTTPS through Vercel proxy → Railway internal HTTP. CSP заблокує усе нелисловане (див. `helmet` setup).
- `n8n → Server`: same Railway VPC, але запит проходить публічний URL із **internal token** (`SERGEANT_INTERNAL_TOKEN`).
- `Server → Postgres / Redis`: Railway internal network, `*.railway.internal` DNS.

## Деталі деплоя

Детальніше — у [`service-catalog.md`](../service-catalog.md), [`hosting-evolution.md`](../hosting-evolution.md), [`platforms.md`](../platforms.md).
