# Storage & Sync — Overview, Goals та Timeline

> **Last touched:** 2026-07-18 by @dimastahov16012003. **Next review:** 2026-10-16.
> **Status:** Reference — усі 13 етапів виконано; це історична карта реалізації.

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Index](../storage-roadmap.md) · [→ PR-плани Stage 0–3](./02-stages-0-3.md)

---

## 0. Definition of Done (що означає «production-ready»)

Після завершення roadmap має виконуватись усе нижче:

1. **Жодного P0** з `docs/90-work/tech-debt/{frontend,backend}.md` не лишається відкритим
   у категорії `storage` / `sync`.
2. **Один engine на клієнті** — SQLite (web через WASM+OPFS, mobile через
   `expo-sqlite`); LS/MMKV лишаються тільки для маленьких прапорців (≤1 KB)
   і для warm-cache-у TanStack Query.
3. **Per-row sync** замість whole-blob: `module_data` JSONB видалено,
   модульні дані живуть у нормалізованих таблицях за патерном
   `mono_connection/mono_account/mono_transaction`.
4. **Op-log реплікація** з idempotent push, pull-cursor-ом і LWW per-row.
   CRDT-апгрейд для multi-device-collision-prone модулів (routine, nutrition).
5. **5 MB cap і MAX_OFFLINE_QUEUE=50 знесено** — обмежень за розміром
   на стороні клієнта нема (тільки OPFS quota / disk).
6. **Encryption-at-rest** на mobile (MMKV з `expo-secure-store`-derived key),
   опційне для web (OPFS не дає encryption out-of-the-box, але чутливі
   query-cache-и винесено з персистера).
7. **Rate-limit і black-box guards** перенесено з in-memory у Postgres
   (або Railway Redis addon) — горизонтальне масштабування Railway не ламає
   захист.
8. **CI-гарди** на нову схему: один schema-source-of-truth (Drizzle),
   автогенерація типів і міграцій, lint-rule проти прямих SQL у бізнес-коді,
   tech-debt-freshness gate розширений на `docs/90-work/tech-debt/storage.md`.
9. **Backup/restore runbook** + щотижнева автоматизована верифікація
   відновлення на staging.
10. **Sync health dashboard** (Grafana / Sentry) з RED-метриками
    (lag, conflict rate, queue depth, op-log throughput).

---

## 1. Цільова архітектура (нагадування)

```
┌─────────────── CLIENT (web OPFS / mobile FS) ───────────────┐
│                                                              │
│  SQLite (один engine, спільні Drizzle-схеми)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Дзеркальні модульні таблиці (бідирекціональний sync)    │ │
│  │  • routine_entries, routine_streaks                     │ │
│  │  • fizruk_workouts, fizruk_workout_sets, fizruk_recovery│ │
│  │  • nutrition_meals, nutrition_recipes, nutrition_log    │ │
│  │  • finyk_manual_expenses, finyk_assets, finyk_budgets   │ │
│  │  • mono_account, mono_transaction (read-only mirror)    │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Client-only                                             │ │
│  │  • sync_op_log (черга на push, idempotency_key)         │ │
│  │  • sync_state (last_pulled_op_id, schema_version)       │ │
│  │  • ui_drafts (незакомічені форми)                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  + Expo SecureStore (mobile auth) / better-auth cookies (web)│
│  + IDB tiny-cache (TanStack Query warm-start, query keys)   │
└──────────────────────────────────────────────────────────────┘
                  ↕ POST /v2/sync/push  +  GET /v2/sync/pull?since=
┌─────────────── SERVER (Railway Postgres + Express) ──────────┐
│                                                              │
│  Дзеркальні таблиці (ті самі шейпи)                          │
│  + Server-only:                                              │
│    • auth.* (Better Auth), push_devices, ai_usage_*          │
│    • mono_connection.token_ciphertext (AES-GCM)              │
│    • sync_audit_log, sync_op_log (server side, RLS-захист)   │
│    • growth_* / seo_* / governance_* / marketing_*            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Stages, decision gates і calendar timeline

| Stage                       | Що дає                                                                                                            | Calendar  | Eng-effort | Off-ramp                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ---------- | --------------------------------------------------------------------- |
| **0. Hygiene/P0**           | Закриває security-debt без перебудови. Цінне навіть якщо далі не йдемо.                                           | 2 тижні   | 0.5 FTE    | Можна зупинитись після Stage 0 — все ще +30% impact.                  |
| **1. Consolidation** ✅     | Один KVStore, один SYNC_MODULES, IDB consolidated, LS-burndown finished. Без SQLite.                              | 4 тижні   | 1 FTE      | Stop тут = просто чистіша поточна архітектура, ще без SQLite.         |
| **2. Foundation** ✅        | Drizzle ORM, sqlite-wasm + expo-sqlite installed but не використовуються в фічах, schema runner, COOP/COEP infra. | 3 тижні   | 1 FTE      | Якщо OPFS bench не задовольняє — stop, повертаємось до Stage 1.       |
| **3. SPIKE (routine)**      | Один модуль повністю на SQLite. Decision gate: gо/no-gо.                                                          | 2 тижні   | 1 FTE      | Якщо спайк fail-ить — fallback на Stage 1 + custom op-log без SQLite. |
| **4. Per-module migration** | fizruk → nutrition → finyk на SQLite. Dual-write, потім cut-over.                                                 | 12 тижнів | 1 FTE      | Можна паузу на будь-якому модулі.                                     |
| **5. Sync v2**              | Op-log persisted, idempotent push, real-time pull (SSE), CRDT для routine/nutrition.                              | 4 тижні   | 1 FTE      | Опційно — без CRDT system все ще працює (LWW), просто нижче UX.       |
| **6. Ops**                  | Postgres rate-limit, pgBouncer, read-replica, dashboard, backup runbook.                                          | 3 тижні   | 0.5 FTE    | Можна розкидати по бекл-логу.                                         |
| **7. Cleanup**              | Видалити module_data, cloudSync v1, KVStore.                                                                      | 2 тижні   | 0.5 FTE    | —                                                                     |

**Total calendar: 32 тижні ≈ 7–8 місяців з 0.5–1 FTE.**
