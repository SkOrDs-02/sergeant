# Flow — HubChat tool-use cycle

> **Last touched:** 2026-09-17 by @claude (шляхи dispatcher-а/handler-ів, localStorage → SQLite). **Next review:** 2026-12-16.
> **Status:** Active

Один цикл tool-use всередині chat-сесії. Користувач задає питання, що вимагає читання локальних даних (наприклад «скільки я витратив на кафе цього тижня?»), Claude емітує `tool_use`, клієнт виконує handler і повертає результат.

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User
    participant ChatUI as HubChat UI
    participant Server as POST /api/chat
    participant Claude as Anthropic Claude<br/><i>messages.stream</i>
    participant Disp as hubChatActions.ts<br/>dispatcher
    participant Hand as chatActions/finykActions.ts<br/>(приклад)
    participant LS as local store<br/>(SQLite; LS — fallback)

    User->>ChatUI: «скільки витратив у кафе?»
    ChatUI->>Server: POST /api/chat<br/>{messages: [...]}
    Server->>Claude: messages.stream(<br/>tools=[finyk.*, fizruk.*, ...]<br/>)

    activate Claude
    Claude-->>Server: text chunk: «Зараз перевірю...»
    Server-->>ChatUI: SSE: text chunk
    ChatUI-->>User: partial bubble

    Claude-->>Server: tool_use{<br/>id: tool_01,<br/>name: 'finyk.txByCategory',<br/>input: {category: 'cafe', range: 'this_week'}<br/>}
    Server-->>ChatUI: SSE: tool_use block
    deactivate Claude

    ChatUI->>Disp: invoke(name='finyk.txByCategory', input)
    Disp->>Hand: handler('finyk.txByCategory', input)
    Hand->>LS: read finyk transactions (SQLite snapshot)
    LS-->>Hand: [...]
    Hand-->>Disp: stringify(filtered totals)
    Disp-->>ChatUI: tool_result string

    ChatUI->>Server: POST /api/chat (continuation)<br/>{messages: [...,<br/>  {role:assistant, content:[tool_use]},<br/>  {role:user, content:[tool_result]}]}
    Server->>Claude: messages.stream (continuation)

    activate Claude
    Claude-->>Server: text chunk: «На каву ти витратив 480 ₴ цього тижня»
    Server-->>ChatUI: SSE: text chunk
    ChatUI-->>User: final bubble
    Claude-->>Server: stop_reason: end_turn
    deactivate Claude

    Note over Server,Claude: prompt-cache HIT на<br/>tool defs + system block.<br/>Continuation коштує ~1/4 токенів.
```

## Що робить dispatcher

`apps/web/src/core/lib/hubChatActions.ts` — тонкий router (шляхи оновлено 2026-09-17; `chatActions/index.ts` і `chatActions/handlers/<domain>.ts` не існують):

1. Бере `name` з `tool_use` блоку.
2. Шукає handler у `chatActions/{finyk,fizruk,routine,nutrition,cross,server}Actions.ts` (write) або `chatActions/query{Finyk,Fizruk,Routine,Nutrition}Actions.ts` (read-only); великі домени тримають helper-и у підтеці `chatActions/<domain>Actions/`.
3. Викликає → отримує `string`.
4. Пакує у `tool_result` блок із тим самим `tool_use_id`.

Handler-и НЕ викликають мережу (виняток — `serverActions.ts`, який навмисно ходить в API). Усі data reads — локальні (SQLite через domain read helper-и; LS через `ls`/`lsSet` — лише first-paint fallback; або RQ cache snapshot, якщо вже завантажено).

## Хто пише handler

Модульний owner. При додаванні нового tool def на сервері (`modules/chat/toolDefs/<domain>.ts`):

1. Додай Zod-схему вхідних параметрів.
2. Додай handler у `apps/web/src/core/lib/chatActions/<domain>Actions.ts` (helper — у `chatActions/<domain>Actions/`, якщо підтека вже є) із тією ж назвою (`<domain>.<action>`); `toolParity.test.ts` стереже парність із серверними def-ами.
3. Додай happy-path + error-path тест.
4. Якщо handler пише у SQLite domain-таблицю — використовуй domain write helper (він автоматично enqueue-ює op у `sync_op_outbox`). CloudSync v1 `dirtyMap` видалено (ADR-0047).

## Помилки в циклі

| Сценарій                                               | Behavior                                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler не знайдено                                    | dispatcher повертає `tool_result: { error: 'unknown_tool' }`. Claude graceful — пере-формулює без tool.                                                                                |
| Handler throw                                          | catch + повернути error як string у tool_result. Claude бачить помилку.                                                                                                                |
| `tool_use.input` не валідний (за серверною Zod-схемою) | сервер відкине ще ДО client invoke (rare).                                                                                                                                             |
| Stream обірвано                                        | dispatcher (`hubChatActions.ts`) чекає `stream.done` перед invoke handler. Якщо stream впав посеред tool_use — handler не запускається, користувач бачить «Зв'язок розірвано», ретрай. |

## Performance / cost

- Каждна tool-use ітерація = 1 додатковий round-trip + 1 Anthropic continuation запит.
- Median: 1-2 tool_use на запит. Tax ~2× латентність першого token, але cache HIT компенсує токен-вартість.
- Track у PostHog: `chat.tool_use_count` per session.
- Sentry: `chat.tool_use.handler_error` aggregated by handler name.
