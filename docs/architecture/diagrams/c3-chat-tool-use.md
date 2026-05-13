# C3 — HubChat tool-use loop

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Як працює tool-use цикл всередині однієї chat-сесії. HubChat — це AI-помічник, що бачить локальні дані користувача через tool-handlers на клієнті.

```mermaid
flowchart TB
    User(["👤 User"])

    subgraph Web["apps/web (browser)"]
        ChatUI["HubChat UI<br/><i>core/chat/*</i>"]
        Stream["fetch /api/chat<br/><i>SSE streaming</i>"]
        ToolDisp["tool dispatcher<br/><i>core/lib/chatActions/index.ts</i>"]
        Handlers["handlers/<br/><i>finyk, fizruk, routine, nutrition,<br/>memory, utility, navigation</i>"]
        LS["localStorage<br/><i>(via ls / lsSet helpers)</i>"]
    end

    subgraph Server["apps/server"]
        ChatRoute["routes/chat.ts"]
        ChatHandler["modules/chat/chat.ts<br/><i>prompt-cache + tool defs</i>"]
        ToolDefs["modules/chat/toolDefs/<br/><i>per-domain Zod tool schemas</i>"]
        AnthClient["lib/anthropic.ts<br/><i>messages + stream</i>"]
    end

    Anthropic{{"Anthropic Claude<br/><i>(streaming + tool_use)</i>"}}

    User -->|"повідомлення"| ChatUI
    ChatUI -->|"POST /api/chat"| Stream
    Stream -->|"SSE chunks"| ChatRoute
    ChatRoute --> ChatHandler
    ChatHandler --> ToolDefs
    ChatHandler --> AnthClient
    AnthClient -->|"messages.stream"| Anthropic
    Anthropic -->|"text + tool_use blocks"| AnthClient
    AnthClient -->|"chunks"| ChatHandler
    ChatHandler -->|"SSE: text"| Stream
    ChatHandler -->|"SSE: tool_use"| Stream
    Stream -->|"on tool_use"| ToolDisp
    ToolDisp -->|"by name"| Handlers
    Handlers -->|"read / write"| LS
    Handlers -->|"return string"| ToolDisp
    ToolDisp -->|"POST /api/chat<br/>+ tool_result"| Stream
    Stream -->|"continuation"| ChatRoute
    Anthropic -.->|"final text"| User

    classDef web fill:#1d4ed8,stroke:#1e40af,color:#fff
    classDef server fill:#7c2d12,stroke:#b45309,color:#fff
    classDef ext fill:#1f2937,stroke:#475569,color:#e5e7eb
    class ChatUI,Stream,ToolDisp,Handlers,LS web
    class ChatRoute,ChatHandler,ToolDefs,AnthClient server
    class Anthropic ext
```

## Контракт `tool_use` ↔ `tool_result`

1. Сервер віддає `tool_use` блоки в SSE stream. Кожен блок має `id`, `name`, `input`.
2. Клієнт у `core/lib/chatActions/index.ts` дивиться `name` → знаходить handler у `handlers/{finyk,fizruk,routine,nutrition,memory,utility,navigation}.ts`.
3. Handler виконується синхронно над `localStorage` (через `ls`/`lsSet` helpers — НЕ raw `localStorage.setItem`). Повертає `string`.
4. Клієнт відправляє новий `POST /api/chat` із `tool_result` блоком (referencing `tool_use.id`). Сервер продовжує stream (наступний прохід Anthropic тепер бачить результат).
5. Цикл повторюється до моменту, коли Anthropic повертає `stop_reason: end_turn` (тільки text).

## Чому handler-и на клієнті, а не на сервері

- Sergeant — **local-first**. Більшість даних (finyk transactions, fizruk sets, routine streaks) живуть у localStorage веб-клієнта.
- Server не має реплікованої копії всіх локальних даних — лише cloud-synced частину (через CloudSync).
- Перенесення handler-ів на сервер вимагало б реплікації всіх локальних state-ів → суперечить local-first архітектурі.

Як побічний ефект: сервер не виконує жодних мутацій від імені користувача → принципово ускладнює supply-chain атаки на tool-handlers.

## Prompt-каше breakpoints

`apps/server/src/modules/chat/chat.ts` ставить **дві каже-точки** у Anthropic prompt:

1. Перша — на блоці tool definitions (`toolDefs/`) — стабільні, рідко змінюються → max cache hit rate.
2. Друга — на `system` блоці з контекстом користувача (профіль + memory entries).

Кожна зміна формату tool def або system prompt → інвалідує cache → коштує токенів. Перевір cache HIT % через PostHog event `chat.cache_hit_rate`.

## Тестування

- `apps/server/src/modules/chat/chat.test.ts` + `chat.stream.test.ts` — server-side stream parsing, tool_use detection.
- `apps/web/src/core/lib/chatActions/handlers/*.test.ts` — happy path + error path кожного handler-а.
- Property-based: handler не повинен writes у localStorage поза `ls`/`lsSet` helpers (eslint-rule `no-raw-local-storage`).

## Дані-залежності

- Server: tools-defs у `modules/chat/toolDefs/` (per-domain). Будь-яка зміна Zod-схеми тут — це **public API change** з точки зору AI.
- Client: handler-и у `core/lib/chatActions/handlers/`. Назви функцій матчаться по `tool.name` із def-ів — змінюй обидві сторони в одному PR.
