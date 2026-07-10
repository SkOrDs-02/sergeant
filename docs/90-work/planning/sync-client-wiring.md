# Sync client wiring — multi-device op-log після SQLite cut-over

> **Status:** Active
> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-03.
> Трек-документ follow-up ініціативи після [`dualwrite-teardown.md`](./dualwrite-teardown.md) (SQLite — єдиний writer модульних даних на клієнті) і [`storage-roadmap.md`](./storage-roadmap.md) (Stage 5 sync v2 server-side). **Проблема:** server push/pull/SSE готові, але клієнт майже не enqueue-ить у `sync_op_outbox` і не має pull/SSE consumer — фактично **single-device local-first**, не multi-device sync.

---

## 1. Контекст і мета

### Що вже зроблено (baseline 2026-07-10)

| Шар                                                    | Стан                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Клієнтський SQLite** (web OPFS / mobile expo-sqlite) | ✅ SoT для finyk / fizruk / nutrition / routine                                 |
| **`sqliteWriter/`** (колишній dualWrite)               | ✅ Усі production-мутації модульних даних                                       |
| **Server sync v2 API**                                 | ✅ `POST /api/v2/sync/push`, `GET /api/v2/sync/pull`, `GET /api/v2/sync/stream` |
| **`OP_LOG_TABLE_REGISTRY`**                            | ✅ 27 таблиць з apply-функціями на сервері                                      |
| **Push scheduler**                                     | ✅ Boot на web (`main.tsx`) і mobile (`_layout.tsx`)                            |
| **CloudSync v1**                                       | ✅ Видалено (`module_data` dropped, `/api/sync/*` → 410)                        |

### Що не зроблено (gap)

| Gap                                   | Наслідок                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Client pull loop відсутній**        | Другий пристрій не отримує зміни                                                                          |
| **Outbox producers ≈ 0**              | Push scheduler працює вхолосту                                                                            |
| **Mobile routine без outbox enqueue** | Навіть web-only completion sync не parity                                                                 |
| **Registry ⊂ SQLite schema**          | Багато локальних таблиць (routine habits/tags/…, fizruk misc, nutrition water/shopping) **не** sync-яться |
| **SSE consumer відсутній**            | Real-time pull — design-only на клієнті                                                                   |

**Мета ініціативи:** зробити **end-to-end multi-device sync** для продуктового модульного стану: мутація на device A → Postgres op-log → pull на device B → SQLite apply → UI overlay.

### Чому зараз

- Dual-write teardown закрив local-first на одному пристрої — наступний логічний крок.
- Server sync v2 уже протестований (unit + Testcontainers + api-client contracts).
- Прод-користувачів поки нема — можна wire-ити без backward-compat болю для реальних даних.

---

## 2. Definition of Done

Ініціатива завершена, коли виконано **все** нижче:

1. **Client pull loop** — `GET /api/v2/sync/pull` з cursor (`sync_op_cursor`), apply ops у SQLite, invalidate warm cache. Web **і** mobile.
2. **Outbox enqueue** — кожна production-мутація через `sqliteWriter` для таблиць з `OP_LOG_TABLE_REGISTRY` enqueue-ить op у `sync_op_outbox` (web + mobile).
3. **E2E parity test** — integration або manual runbook: зміна habit на web → pull на mobile (або другий web profile) → habit видимий після overlay refresh.
4. **Registry parity** — усі таблиці, що є в client SQLite **і** мають бути multi-device, мають apply-fn на сервері **і** enqueue на клієнті. Gap-лист задокументований для свідомо local-only таблиць (`kv_store`, `finyk_mono_transactions` client mirror, …).
5. **`pnpm check` зелений**; contract triplet для sync endpoints не зламаний (Hard Rule #3).
6. **`data-exchange-storage-audit.md`** §4.1/§5 оновлені; цей документ — Status `Deprecated`, усі чекбокси § 8 закриті.

---

## 3. Правила та інваріанти (гейти)

| #   | Правило                                                                                                      | Чому                            |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| R1  | **LWW-guard `>` строго** (ADR-0004) на client apply **і** server apply.                                      | Silent overwrite при `>=`.      |
| R2  | **Outbox enqueue fire-and-forget** — помилка enqueue **не** ламає local SQLite write.                        | Local-first: offline must work. |
| R3  | **Pull apply idempotent** — повторний pull того ж op_id no-op.                                               | Retry-safe scheduler.           |
| R4  | **Contract triplet** — зміна pull/push shape → server + api-client + contract test (Hard Rule #3).           | API drift.                      |
| R5  | **Demo-flow не регресувати** — pull/enqueue не чіпає demo-seed LS bridge.                                    | Pre-signup funnel.              |
| R6  | **origin_device_id** — кожен push несе device id (`packages/shared/src/lib/originDeviceId.ts`).              | Echo-suppression на pull.       |
| R7  | **Mono transactions** — client mirror (`finyk_mono_transactions`) **поза** op-log sync; server path окремий. | External SoT = Monobank API.    |
| R8  | **Sequential migrations** (Hard Rule #4) для нових sync-таблиць на PG.                                       | DB integrity.                   |

---

## 4. Поточна архітектура (as-is)

```
┌──────────── CLIENT ────────────────────────────────────────────────┐
│  UI mutation → sqliteWriter → SQLite (module tables)               │
│       │                    → in-memory cache (sqliteReader)        │
│       │                                                            │
│       ├─ enqueueOutboxUpsert ──► ТІЛЬКИ routine completion (web)  │
│       │                          2 call sites в adapter.ts         │
│       │                                                            │
│       ├─ sync_op_outbox ──► Push scheduler ✅ boots                │
│       │         └──► POST /api/v2/sync/push ✅                     │
│       │                                                            │
│       ├─ GET /api/v2/sync/pull  ❌ NO CONSUMER                     │
│       └─ GET /api/v2/sync/stream ❌ NO CONSUMER                    │
└────────────────────────────────────────────────────────────────────┘
                              │
┌──────────── SERVER ────────────────────────────────────────────────┐
│  syncV2Push / syncV2Pull / syncV2Stream ✅                         │
│  OP_LOG_TABLE_REGISTRY — 27 tables (syncV2.ts:112–140)              │
│  SSE: in-process EventEmitter (single Railway instance)              │
│  sync_op_log retention: ADR-0065 Proposed                          │
└────────────────────────────────────────────────────────────────────┘
```

### Registry vs client SQLite (gap-лист)

**У registry (sync-яться design intent):** `routine_entries`, `routine_streaks`, fizruk workouts/items/sets/measurements/custom_exercises, nutrition meals/pantries/prefs/recipes, finyk manual entities (14 tables).

**Є локально, нема в registry (потребують Phase 2):**

| Module    | Client SQLite tables (приклади)                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| routine   | `routine_habits`, `routine_tags`, `routine_categories`, `routine_prefs`, `routine_pushups`, `routine_habit_order`, `routine_completion_notes` |
| fizruk    | `fizruk_daily_log`, `fizruk_monthly_plan`, `fizruk_workout_templates`, …                                                                      |
| nutrition | `nutrition_water_log`, `nutrition_shopping_list`                                                                                              |

**Свідомо local-only (не sync):** `kv_store`, client `finyk_mono_transactions` mirror, IndexedDB recipes (web), demo-seed LS keys.

---

## 5. Метрики успіху

| Метрика                                     | Baseline (2026-07-10)      | Ціль                           |
| ------------------------------------------- | -------------------------- | ------------------------------ |
| Client pull consumer (web/mobile)           | 0                          | **2** (web + mobile)           |
| `enqueueOutboxUpsert` production call sites | 2 (web routine completion) | **≥1 per synced table class**  |
| Tables in registry with client enqueue      | ~2 ops (completions only)  | **27** (або documented subset) |
| E2E multi-device habit round-trip           | ❌                         | ✅                             |
| Outbox rows pushed per user session (smoke) | ~0                         | **>0** after mutation          |
| Stale audit doc §4.1                        | LS SoT (wrong)             | SQLite SoT + sync gap noted    |

---

## 6. Перевірки (гейт на кожному PR)

```bash
# Scoped typecheck
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/mobile typecheck

# Sync engine / sqliteWriter tests
pnpm --filter @sergeant/web exec vitest run src/core/syncEngine
pnpm --filter @sergeant/web exec vitest run src/modules/routine/lib/sqliteWriter

# Server sync integration
pnpm --filter @sergeant/server test:integration -- syncV2

# Contract triplet (якщо чіпається response shape)
pnpm --filter @sergeant/api-client exec vitest run src/__tests__/contracts

# Pre-PR
pnpm check
```

| **Manual E2E (обов'язково для Phase 1 PR):** два browser profiles або web + mobile emulator — mutation → wait push → pull → assert overlay. Phase 2 habit gate — див. [`sync-client-wiring-phase2-handoff.md`](./sync-client-wiring-phase2-handoff.md) §3.

---

## 7. Фазовий план

> **Playbook (дизайн роботи, агенти, гейти, E2E):** [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md)

### Фаза 0 — розвідка та inventory ✅ (baseline 2026-07-10)

- [x] Inventory: grep `enqueueOutboxUpsert` — **2** production call sites (web routine completion only).
- [x] Inventory: registry **27** ∩ SQLite module **45** → **27** synced-ready; **18** SQLite-only (Phase 2).
- [x] Confirm `sync_op_cursor` schema (`001_routine_spike.sql`, `routine.ts`).
- [x] Echo-suppression: `originDeviceId` wired; server filter `IS DISTINCT FROM`; client skip defence-in-depth.

**Операційна інструкція:** [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md) §3 — метрики, перепровірки, розподіл агентів.

### Фаза 1 — Sync MVP `(enqueue + pull, registry tables only)`

**Scope:** таблиці вже в `OP_LOG_TABLE_REGISTRY`; **не** розширюємо registry.

- [x] **1a. Client pull loop (web)** — `core/syncEngine/syncEngineReader.ts`: fetch pull → apply to SQLite → bump cursor → notify overlay ticks. (PR-1 merged)
- [x] **1b. Outbox enqueue (web)** — `enqueueOutboxUpsert` у sqliteWriter adapters для finyk/fizruk/nutrition/routine registry tables. (PR-2, PR-3 merged)
- [x] **1c. Mobile parity** — PR-4 merged
- [x] **1d. Integration test** — client round-trip vitest (`syncRoundTrip.test.ts`) + server `syncV2.integration.test.ts`. (PR-5)
- [x] **1e. Scheduler wiring** — pull on boot + after successful push + periodic/backoff. (PR-1 merged)

**Гейт:** manual E2E за [`sync-client-e2e.md`](../03-operations/runbooks/sync-client-e2e.md) (локальне середовище).

### Фаза 2 — Full state registry expansion (in progress)

> **Handoff:** [`sync-client-wiring-phase2-handoff.md`](./sync-client-wiring-phase2-handoff.md) — що зроблено в cloud vs що лишилось локально.

- [x] Server: apply functions для routine full-state tables (7).
- [x] Server: apply для fizruk misc + nutrition water/shopping (8).
- [x] Extend `OP_LOG_TABLE_REGISTRY` (27 → **42**); PG migrations не потрібні (050/051/052).
- [x] Client enqueue web + mobile для нових таблиць.
- [ ] Contract tests — N/A (push/pull shape unchanged).
- [ ] Integration test (Testcontainers) — **blocked cloud**; run locally/CI.
- [ ] Manual E2E habit round-trip — **blocked cloud**; run locally.

### Фаза 3 — Realtime + ops

- [ ] Client SSE consumer (`EventSource` → `/api/v2/sync/stream`) as optional fast-path before pull.
- [ ] ADR-0065 implementation: `sync_op_log` retention + PG NOTIFY multi-instance fan-out.
- [ ] Wire SLO alert `BackendHealthP95High` (design-only today).

### Фаза 4 — Residue cleanup (parallel / low priority)

- [ ] `fizruk_rest_settings_v1` → SQLite (+ optional sync row).
- [ ] Web nutrition recipes IndexedDB → SQLite or sync `nutrition_recipes` only.
- [ ] Mono mirror multi-month backfill (`useMonobankWebhook.ts` fetch window).
- [ ] Nutrition backup `.data/` → durable storage.
- [ ] Drop orphan `billing_subscriptions` (two-phase, Hard Rule #4).

---

## 8. PR-розбивка (рекомендована)

| PR    | Scope                                      | Surfaces            |
| ----- | ------------------------------------------ | ------------------- |
| PR-1  | Pull loop web + cursor + apply scaffold    | web, db-schema      |
| PR-2  | Outbox enqueue web (finyk + nutrition MVP) | web                 |
| PR-3  | Outbox enqueue web (fizruk + routine rest) | web                 |
| PR-4  | Mobile pull + outbox parity                | mobile              |
| PR-5  | Integration / E2E test + runbook           | web, server         |
| PR-6+ | Phase 2 registry expansion (per module)    | server, web, mobile |

Один PR = один логічний крок; не змішувати registry expansion з MVP wiring.

---

## 9. Ризики

| Ризик                              | Мітигація                                           |
| ---------------------------------- | --------------------------------------------------- |
| Pull apply corrupts local SQLite   | Transactional apply; integration tests; LWW guard   |
| Outbox flood on bulk import        | Batch enqueue; idempotency_key per row              |
| Echo loop (device pulls own ops)   | `origin_device_id` skip (R6)                        |
| Registry/schema drift              | CI check: registry keys ⊆ PG tables ⊆ client tables |
| Demo-seed regression               | R5 — не чіпати seedDemoData path у Phase 1          |
| Single-instance SSE until ADR-0065 | Polling pull sufficient for MVP                     |

---

## 10. Пов'язане

- [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md) — **операційна інструкція** (фази, агенти, метрики, E2E)
- [`sync-client-wiring-phase2-handoff.md`](./sync-client-wiring-phase2-handoff.md) — Phase 2 cloud/local handoff
- [`dualwrite-teardown.md`](./dualwrite-teardown.md) — SQLite SoT на клієнті (виконано)
- [`storage-roadmap.md`](./storage-roadmap.md) — historical 13 stages
- [`storage-roadmap/01-overview.md`](./storage-roadmap/01-overview.md) — цільова архітектура sync
- [`data-exchange-storage-audit.md`](../02-engineering/architecture/data-exchange-storage-audit.md) — audit (§4.1 оновлено 2026-07-10)
- [ADR-0004](../../04-governance/adr/0004-cloudsync-lww-conflict-resolution.md) — LWW
- [ADR-0065](../../04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md) — retention + NOTIFY
- [ADR-0073](../../04-governance/adr/0073-dualwrite-generic-framework.md) — sqliteWriter framework
- `apps/server/src/modules/sync/syncV2.ts` — registry + push/pull handlers
- `apps/web/src/core/syncEngine/` — push + pull scheduler
- `apps/web/src/core/syncEngine/enqueueOutboxUpsert.ts` — enqueue helper
- `packages/api-client/src/endpoints/syncV2*.ts` — contract types
