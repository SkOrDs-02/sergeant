# Flow — Sync v2 push/pull

> **Last validated:** 2026-05-07 by @Skords-01. **Next review:** 2026-08-05.
> **Status:** Active

Sync v2: UI пише у локальний SQLite-WASM, `SyncEnginePushScheduler` батчить операції з `sync_op_outbox` та пушить на сервер; pull тягне зміни інших пристроїв. CloudSync v1 (`POST /api/sync`) знятий (ADR-0047) і повертає `410 Gone`.

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User
    participant UI as Module UI<br/><i>(finyk/fizruk/...)</i>
    participant SQLite as SQLite-WASM<br/><i>(domain tables + sync_op_outbox)</i>
    participant Engine as SyncEnginePushScheduler<br/><i>core/syncEngine</i>
    participant API as apps/server<br/>/api/v2/sync
    participant DB as Postgres<br/><i>sync_op_log + domain tables</i>

    rect rgba(34,197,94,0.08)
    Note over UI,SQLite: Локальний запис
    User->>UI: змінює дані (нова витрата, set, звичка, тощо)
    UI->>SQLite: domain write helper → INSERT/UPDATE у domain table
    SQLite->>SQLite: enqueue op у sync_op_outbox<br/><i>(status=pending, idempotency_key=uuid)</i>
    SQLite-->>Engine: notifyEnqueued()
    end

    rect rgba(59,130,246,0.08)
    Note over Engine,DB: Push (online path)
    Engine->>SQLite: fetch pending ops (batch)
    SQLite-->>Engine: [{table, op, row, idempotency_key}, ...]
    Engine->>SQLite: mark in_flight
    Engine->>API: POST /api/v2/sync/push<br/>{ops: [...], device_id, cursor}
    alt 200 OK
        API->>DB: apply per-row з LWW-guard + soft-delete<br/>INSERT INTO sync_op_log
        DB-->>API: { applied, rejected, duplicate }
        API-->>Engine: { applied: [...], rejected: [...], duplicate: [...] }
        Engine->>SQLite: mark applied / dead_letter
    else offline / 5xx / timeout
        Engine->>SQLite: mark pending (retry later)
        Note right of Engine: SyncEngineFlushOnReconnect<br/>повторить при online
    end
    end

    rect rgba(168,85,247,0.08)
    Note over Engine,DB: Pull (інші пристрої)
    Engine->>API: GET /api/v2/sync/pull?since=<cursor>
    API->>DB: SELECT ops FROM sync_op_log<br/>WHERE user_id=? AND server_ts > cursor
    DB-->>API: [{table, op, row, server_ts}, ...]
    API-->>Engine: { ops: [...], next_cursor }
    Engine->>SQLite: apply remote ops до domain tables
    Engine->>SQLite: зберегти next_cursor
    end
```

## Тригери push

- `notifyEnqueued()` — кожен domain write автоматично повідомляє engine.
- Debounce (≈200 ms після останнього `notifyEnqueued()`) → один batch декількох ops.
- Manual: `SyncEngineWriterRuntime.flushNow()` — для тестів і ручного тригера (наприклад, перед logout).
- `SyncEngineFlushOnReconnect` — автоматичний flush при `window.addEventListener('online')`.

## Тригери pull

- Після успішного push (cursor update).
- На старті PWA (після session refresh у `AuthProvider`).
- Manual: `flushNow()` включає pull цикл.

## Idempotency та dead-letter

- `(user_id, idempotency_key)` UNIQUE у `sync_op_log` — повторний push однієї ops → `status: duplicate`, не double-apply.
- `status=dead_letter` — op rejected після max retries. Відновлюється через `recoverAllDeadLetters()` → `pending`.

## Конфлікти (per-row LWW)

- Server порівнює `client_ts` нової операції з `server_ts` останнього applied row.
- Якщо `client_ts < server_ts` останнього op — `status: rejected` (remote newer wins).
- UI бачить відхилення через `useSyncStatus()` — в майбутньому планується conflict UX.

## Порівняння з v1

| v1 (ADR-0047, знятий)                | v2 (поточний)                                            |
| ------------------------------------- | -------------------------------------------------------- |
| `POST /api/sync` → 410 Gone           | `POST /api/v2/sync/push`                                 |
| Whole-module blob                     | Per-row operation log                                    |
| LWW на blob timestamp                 | LWW per row з `idempotency_key`                          |
| offlineQueue у localStorage           | `sync_op_outbox` у SQLite-WASM (OPFS)                    |
| `module_data` JSONB (дропнута, 046)   | Normalized per-domain tables + `sync_op_log`             |

## Failure handling

| Failure          | Behaviour                                                        | Recovery                                  |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Offline          | ops лишаються `pending` у outbox                                 | flush при `online` event                  |
| 5xx / timeout    | ops позначаються `pending` (retry з backoff)                     | exp.backoff у `SyncEnginePushScheduler`   |
| 401              | drop payload, force re-auth                                      | redirect до /login                        |
| `rejected`       | op позначається `dead_letter`                                    | `recoverAllDeadLetters()` / manual replay |
| `duplicate`      | no-op (idempotent), позначається `duplicate` у outbox            | —                                         |

## Спостережуваність

- `useSyncStatus()` — React hook, повертає `{ pending, in_flight, dead_letter }` counts.
- PostHog event `cloud_sync.push_v2` (`status`, `ops_count`, `latency_ms`).
- Sentry breadcrumb `cloud_sync.v2.failed` із deduped `requestId`.
