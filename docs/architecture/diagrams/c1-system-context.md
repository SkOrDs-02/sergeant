# C1 — System Context

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

Sergeant у контексті користувача та зовнішніх систем.

```mermaid
flowchart TB
    User(["👤 Користувач<br/><i>веб / мобайл / Telegram</i>"])

    subgraph Sergeant["Sergeant — особистий productivity & health hub"]
        direction TB
        WebApp["apps/web<br/><i>Vite SPA + PWA</i>"]
        MobileApp["apps/mobile<br/><i>Expo (iOS / Android)</i>"]
        ShellApp["apps/mobile-shell<br/><i>Capacitor wrapper</i>"]
        Server["apps/server<br/><i>Express API + BullMQ workers</i>"]
        Console["apps/console<br/><i>Telegram бот (ops + marketing)</i>"]
    end

    Postgres[("🗄️ PostgreSQL<br/><i>Railway managed</i>")]
    Redis[("⚡ Redis<br/><i>BullMQ queues</i>")]
    Anthropic{{"🤖 Anthropic Claude API<br/><i>chat, coach, weekly-digest</i>"}}
    Sentry{{"🔭 Sentry<br/><i>error & perf telemetry</i>"}}
    n8n{{"⏰ n8n workflows<br/><i>cron + webhook</i>"}}
    Mono{{"💳 Monobank API<br/><i>transactions + webhooks</i>"}}
    OFF{{"🥗 OpenFoodFacts<br/><i>barcode lookup</i>"}}
    SMTP{{"📧 SMTP<br/><i>Better Auth mail</i>"}}
    Push{{"📲 APNs / FCM<br/><i>push delivery</i>"}}
    Telegram{{"💬 Telegram Bot API"}}

    User -->|HTTPS| WebApp
    User -->|native| MobileApp
    User -->|native shell| ShellApp
    User -->|chat| Telegram

    ShellApp -->|embeds| WebApp
    WebApp -->|cookies + JSON| Server
    MobileApp -->|cookies + JSON| Server
    Telegram --> Console

    Server -->|SQL| Postgres
    Server -->|jobs| Redis
    Server -->|streaming| Anthropic
    Server -->|spans + errors| Sentry
    Server -->|webhooks| Mono
    Server -->|barcode| OFF
    Server -->|auth mail| SMTP
    Server -->|notifications| Push
    n8n -->|HTTP| Server
    Console -->|SQL| Postgres
    Console -->|streaming| Anthropic

    classDef sys fill:#0f766e,stroke:#0d9488,color:#fff,stroke-width:2px
    classDef ext fill:#1f2937,stroke:#475569,color:#e5e7eb
    classDef store fill:#7c2d12,stroke:#b45309,color:#fff
    class Sergeant sys
    class Postgres,Redis store
    class Anthropic,Sentry,n8n,Mono,OFF,SMTP,Push,Telegram ext
```

## Зауваження

- Всі external systems — managed: Railway (Postgres, Redis, n8n self-host), Vercel (web hosting), Sentry SaaS, Anthropic SaaS, Monobank — банк-партнер.
- Sergeant як software system НЕ зберігає секрети у браузері; cookies сесії — `httpOnly` + `secure` (Better Auth standard).
- `apps/console` — окремий surface для внутрішніх ops/marketing задач, не для kінцевого користувача.
- `apps/mobile-shell` обгортає `apps/web` через Capacitor; це той самий фронтенд-bundle, тільки з нативними API (camera, push).

## Поверхні-каталог

Детальний runtime-каталог (deploy targets, env vars, healthcheck) живе в [`service-catalog.md`](../service-catalog.md).
