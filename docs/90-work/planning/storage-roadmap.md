# Storage & Sync — Roadmap до production-ready (Index)

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
> **Status:** Reference (all 13 stages complete; retained as historical reference; Redis #045 optional opt-in only).
>
> **Canonical current status (2026-05-19):** Stage 13 is complete (9/9 landed). Детальний стан і PR-посилання — у частинах нижче.
>
> **Stage status summary:**
>
> | Stage                            | Status              |
> | -------------------------------- | ------------------- |
> | 0 — Security hygiene (P0)        | ✅ COMPLETE         |
> | 1 — Consolidation                | ✅ COMPLETE (8/8)   |
> | 2 — Foundation SQLite            | ✅ COMPLETE         |
> | 3 — SPIKE (routine)              | ✅ COMPLETE         |
> | 4 — Per-module migration         | ✅ COMPLETE         |
> | 5 — Sync engine v2 hardening     | ✅ COMPLETE         |
> | 6 — Operational maturity         | ✅ COMPLETE         |
> | 7 — Cleanup                      | ✅ COMPLETE (9/9)   |
> | 8 — SQLite cut-over rollout      | ✅ COMPLETE (21/21) |
> | 9 — KV store swap                | ✅ COMPLETE (7/7)   |
> | 10 — Routine SQLite full-state   | ✅ COMPLETE (3/3)   |
> | 11 — Nutrition SQLite full-state | ✅ COMPLETE (4/4)   |
> | 12 — Fizruk SQLite full-state    | ✅ LANDED (4/4)     |
> | 13 — Audit findings & cleanup    | ✅ COMPLETE (9/9)   |

---

## Про цей документ

Roadmap переведення Storage & Sync у Sergeant на production-ready стан: SQLite (OPFS + expo-sqlite) замість localStorage/MMKV, per-row op-log реплікація замість whole-blob CloudSync v1, normalization модульних даних.

**Поточний стан (2026-05-19):** Усі 13 запланованих Stage-ів завершено. Redis (#045) лишається опційним opt-in. Документ зберігається як historical reference та для audit/rollout context.

**Dual-write teardown (2026-07-10):** follow-up ініціатива після Stage 8 — LS/MMKV production-write модульних даних прибрано; SQLite — canonical writer. Деталі — [`dualwrite-teardown.md`](./archive/dualwrite-teardown.md) (Status: Deprecated, виконано). **Наступна ініціатива:** [`sync-client-wiring.md`](./sync-client-wiring.md) — client pull + outbox enqueue для multi-device sync.

## Зміст

| Файл                                                   | Зміст                                                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-overview.md](./storage-roadmap/01-overview.md)     | Definition of Done · Цільова архітектура · Stages/timeline таблиця                                                                           |
| [02-stages-0-3.md](./storage-roadmap/02-stages-0-3.md) | PR-плани: Stage 0 (Security hygiene P0) · Stage 1 (Consolidation) · Stage 2 (Foundation SQLite) · Stage 3 (SPIKE routine)                    |
| [03-stage-4.md](./storage-roadmap/03-stage-4.md)       | PR-плани: Stage 4 — Per-module migration (Routine, Fizruk, Nutrition, Finyk)                                                                 |
| [04-stage-5.md](./storage-roadmap/04-stage-5.md)       | PR-плани: Stage 5 — Sync engine v2 hardening (op-log, CRDT, SSE, scheduler)                                                                  |
| [05-stage-6-7.md](./storage-roadmap/05-stage-6-7.md)   | PR-плани: Stage 6 (Operational maturity — pgBouncer, read-replica, backup) · Stage 7 (Cleanup — drop cloudSync v1, module_data, KVStore)     |
| [06-stage-8-9.md](./storage-roadmap/06-stage-8-9.md)   | PR-плани: Stage 8 (SQLite cut-over rollout — dual-write default-on, tombstones, Stages 10/11/12) · Stage 9 (KV store swap → kv_store SQLite) |
| [07-stage-13.md](./storage-roadmap/07-stage-13.md)     | PR-плани: Stage 13 — Audit findings & post-migration cleanup (PR #071–#079)                                                                  |
| [08-appendix.md](./storage-roadmap/08-appendix.md)     | Зміни інфраструктури · Risk register · Decision gates · Метрики успіху · Перші кроки · Зв'язок з тех-боргом · Підсумок                       |
