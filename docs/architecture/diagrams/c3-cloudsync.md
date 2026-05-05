# C3 — CloudSync (web)

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

Внутрішня структура CloudSync у `apps/web`. Це **local-first sync v1** — UI пише в локальне сховище (localStorage), сервер обробляє push-блоби й pull-блоби з LWW-резолюцією.

```mermaid
flowchart LR
    subgraph UI["UI шар (modules)"]
        FinykUI["Finyk forms"]
        FizrukUI["Fizruk timer / sets"]
        NutritionUI["Nutrition mealsheet"]
        RoutineUI["Routine heatmap"]
    end

    subgraph SyncCore["apps/web/src/core/cloudSync"]
        direction TB
        Hook["useCloudSync.ts<br/><i>(barrel re-export)</i>"]
        DirtyMap["dirtyMap<br/><i>per-module dirty bits</i>"]
        Engine["syncEngine<br/><i>orchestrator</i>"]
        Collect["queue/collectQueued.ts<br/><i>build push payload</i>"]
        OfflineQ["queue/offlineQueue.ts<br/><i>persist failed pushes</i>"]
        Resolver["conflict/resolver.ts<br/><i>LWW per slice</i>"]
        PushOK["conflict/pushSuccess.ts<br/><i>commit local writes</i>"]
        ParseDate["conflict/parseDate.ts<br/><i>updatedAt normalize</i>"]
    end

    APIClient["packages/api-client<br/><i>fetch wrapper</i>"]

    subgraph Server["apps/server"]
        SyncRoute["routes/sync.ts<br/><i>POST /api/sync</i>"]
        SyncMod["modules/sync/*<br/><i>v1 + v2 handlers</i>"]
    end

    PG[("PostgreSQL")]

    UI -->|"setX(value)"| Hook
    Hook -->|"mark dirty"| DirtyMap
    DirtyMap -->|"trigger"| Engine
    Engine -->|"collect"| Collect
    Collect -->|"push payload"| APIClient
    APIClient -->|"POST /api/sync"| SyncRoute
    SyncRoute --> SyncMod
    SyncMod -->|"upsert / conflict"| PG
    SyncMod -->|"pull payload"| APIClient
    APIClient --> Engine
    Engine -->|"reconcile"| Resolver
    Resolver --> ParseDate
    Resolver --> PushOK
    Engine -->|"on failure"| OfflineQ
    OfflineQ -->|"replay"| Engine
    PushOK -->|"clear bits"| DirtyMap

    classDef ui fill:#1d4ed8,stroke:#1e40af,color:#fff
    classDef core fill:#0f766e,stroke:#0d9488,color:#fff
    classDef server fill:#7c2d12,stroke:#b45309,color:#fff
    class FinykUI,FizrukUI,NutritionUI,RoutineUI ui
    class Hook,DirtyMap,Engine,Collect,OfflineQ,Resolver,PushOK,ParseDate,APIClient core
    class SyncRoute,SyncMod,PG server
```

## Ключові структури

| Файл / директорія                        | Відповідає за                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `core/cloudSync/queue/collectQueued.ts`  | Збирає dirty-зрізи в push payload (1 payload = 1 транзакція push).             |
| `core/cloudSync/queue/offlineQueue.ts`   | Persists невдалі push-и у localStorage; replays їх на наступному online-вікні. |
| `core/cloudSync/conflict/resolver.ts`    | LWW (last-write-wins) per data slice. Базується на `updatedAt`.                |
| `core/cloudSync/conflict/parseDate.ts`   | Нормалізує `updatedAt` → number (ms epoch) для порівняння.                     |
| `core/cloudSync/conflict/pushSuccess.ts` | Після успішного push-у: commit локальних writes, скидає dirty-bits.            |
| `core/useCloudSync.ts`                   | Barrel re-export для зручного import-у з UI.                                   |

## Ризики (з diagnostic §2.3)

- **Split-brain** — два пристрої одночасно edit-ять той самий зріз → LWW дає переможцю по часу, але є вікно «обидва виграли локально». Тестів на цей сценарій ще немає (item #9 у roadmap).
- **localStorage quota** на main thread → блокує UI під час великих pushes. Розмір нинішнього footprint-у відстежується через `pnpm lint:localstorage-allowlist` ([item #6 done](../../audits/2026-05-03-web-deep-dive/00-overview.md)).
- **v2 vs v1 sync coexistence** — v1 досі primary; v2 з operation-log частково розгорнуто. Cleanup у §2.3.

## Як змінити

1. Будь-яка зміна shape pushed payload → одразу update server route, snapshot, type у `api-client`.
2. Conflict resolver — purely deterministic; зміни тут вимагають property-based тестів на `resolver.test.ts`.
3. `dirtyMap` ключі ідуть через типізовані factories — НЕ stringify ad-hoc.
