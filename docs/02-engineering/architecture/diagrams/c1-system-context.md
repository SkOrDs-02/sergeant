# C1 — System Context

> **Last touched:** 2026-07-21 by @Skords-01. **Next review:** 2026-10-19.
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
    end

    Postgres[("🗄️ PostgreSQL 18<br/><i>Coolify (Hetzner), pgvector</i>")]
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

    ShellApp -->|embeds| WebApp
    WebApp -->|cookies + JSON| Server
    MobileApp -->|cookies + JSON| Server

    Server -->|SQL| Postgres
    Server -->|jobs| Redis
    Server -->|streaming| Anthropic
    Server -->|spans + errors| Sentry
    Server -->|REST API| Mono
    Mono -->|webhooks| Server
    Server -->|barcode| OFF
    Server -->|auth mail| SMTP
    Server -->|notifications| Push
    Server -->|alerts| Telegram
    n8n -->|HTTP| Server

    classDef sys fill:#0f766e,stroke:#0d9488,color:#fff,stroke-width:2px
    classDef ext fill:#1f2937,stroke:#475569,color:#e5e7eb
    classDef store fill:#7c2d12,stroke:#b45309,color:#fff
    class Sergeant sys
    class Postgres,Redis store
    class Anthropic,Sentry,n8n,Mono,OFF,SMTP,Push,Telegram ext
```

## Зауваження

- Хостинг: бекенд (API + Postgres + Redis) — Hetzner CX23 + Coolify (self-host PaaS, [ADR-0074](../../../04-governance/adr/0074-hosting-hetzner-coolify.md)); Vercel (web hosting + edge-proxy); Sentry SaaS, Anthropic SaaS, Monobank — банк-партнер.
- Sergeant як software system НЕ зберігає секрети у браузері; cookies сесії — `httpOnly` + `secure` (Better Auth standard).
- OpenClaw Gateway **повністю decommissioned** ([ADR-0075](../../../04-governance/adr/0075-openclaw-gateway-decommissioned.md), 2026-07-20) разом з Railway — код (`packages/openclaw-plugin`, `apps/server/src/modules/openclaw`) видалено, тому цей компонент більше не показаний на діаграмі. Telegram Bot API лишається як зовнішня система лише для one-way alert-delivery (`Server -->|alerts| Telegram`, alerts-shipper).
- `apps/mobile-shell` обгортає `apps/web` через Capacitor; це той самий фронтенд-bundle, тільки з нативними API (camera, push).

## Поверхні-каталог

Детальний runtime-каталог (deploy targets, env vars, healthcheck) живе в [`service-catalog.md`](../service-catalog.md).
