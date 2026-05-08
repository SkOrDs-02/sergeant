# Storage & Sync — Roadmap до production-ready

> **Last validated:** 2026-05-08 by @Skords-01 (Stage 9 COMPLETE 7/7 — PRs #060–#066 landed; PR #066 moved `createMemoryKVStore` to `@sergeant/shared/test-utils` and kept the web SSR/private-mode memory fallback app-local. Stage 9 hotfix tail (boot-path resilience for `sync_op_outbox`) landed post-canary — див. § Stage 9 нижче. Stage 7 9/9 — COMPLETE. Stage 8 dual-write default-on landed для всіх 4 модулів: Routine [#2133](https://github.com/Skords-01/Sergeant/pull/2133), Fizruk [#2135](https://github.com/Skords-01/Sergeant/pull/2135), Nutrition + Finyk + Finyk Mono mirror [#2178](https://github.com/Skords-01/Sergeant/pull/2178); plus Stage 8 dual-write telemetry sink (`ff92dbb4`) і PR #058 mobile sync-engine writer-runtime boot path landed у [#2118](https://github.com/Skords-01/Sergeant/pull/2118) alongside CloudSync v1 client cleanup. Read-default-on slice [#2179](https://github.com/Skords-01/Sergeant/pull/2179) was rolled back via [#2181](https://github.com/Skords-01/Sergeant/pull/2181) (`2735fa75`) after a PWA habit-input regression — re-rollout gated on stability re-verify. **Read-default-on quartet re-rolled out** після rollback #2181: Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244) (PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247) (PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251) (PR #055n2), Finyk (`24616449`, PR #055k2). **PR #056r landed** з revised scope (drop dual-write feature-flag gating only — Routine SQLite schema gap, див. footnote): commit `ff852475`. Stage 8 §3 parity probe wired у Routine ([#2243](https://github.com/Skords-01/Sergeant/pull/2243), `4ea2c952`). **Outstanding:** Stage 8 — 7 module rollout PR-ів left (3× drop LS-write safety net `#056f/#056n/#056k`, 4× drop LS-reader + tombstone `#057*`), 14d canary-gated; + Fizruk/Nutrition/Finyk parity-probe focused PR-и (Stage 8 §3 follow-up). Stage 9 KV store swap is complete. #045 Redis — opt-in optional Stage-6 follow-up. **Next review:** 2026-08-05.
> **Status:** Active
>
> **Stage status (one-line summary):**
>
> | Stage                          | Status                 | Landed PRs (this stage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Outstanding                                                                                                                                                                                                                                                                    |
> | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | 0 — bootstrap dual-write       | ✅ COMPLETE            | [#003](https://github.com/Skords-01/Sergeant/pull/1497)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                              |
> | 1 — boot wiring                | ✅ COMPLETE (8/8)      | #008 `ff217246`, [#010](https://github.com/Skords-01/Sergeant/pull/1543), #013 (×4 sub-PRs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                              |
> | 4 — Fizruk module migration    | ✅ COMPLETE (5/5)      | #027–#030 + #029a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                              |
> | 4 — Nutrition module migration | ✅ COMPLETE            | [#031/#032/#033](https://github.com/Skords-01/Sergeant/pull/1574), [#034](https://github.com/Skords-01/Sergeant/pull/1636)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                              |
> | 4 — Finyk module migration     | ✅ COMPLETE (5/5)      | [#035](https://github.com/Skords-01/Sergeant/pull/1667), [#036](https://github.com/Skords-01/Sergeant/pull/1680), [#037](https://github.com/Skords-01/Sergeant/pull/1694), [#038](https://github.com/Skords-01/Sergeant/pull/1702), [#039](https://github.com/Skords-01/Sergeant/pull/1711)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                              |
> | 5 — op-log v2 hardening        | ✅ COMPLETE            | [#040](https://github.com/Skords-01/Sergeant/pull/1717), [#041](https://github.com/Skords-01/Sergeant/pull/1721), [#043](https://github.com/Skords-01/Sergeant/pull/1734), [#043a](https://github.com/Skords-01/Sergeant/pull/1739), [#043b](https://github.com/Skords-01/Sergeant/pull/1743), [#043c](https://github.com/Skords-01/Sergeant/pull/1754), [#044](https://github.com/Skords-01/Sergeant/pull/1780), [#048](https://github.com/Skords-01/Sergeant/pull/1737), [#042a](https://github.com/Skords-01/Sergeant/pull/1769), [#042b](https://github.com/Skords-01/Sergeant/pull/1776), [#042c](https://github.com/Skords-01/Sergeant/pull/1787), [#042d-prep](https://github.com/Skords-01/Sergeant/pull/1804), [#042d-builder](https://github.com/Skords-01/Sergeant/pull/1810), [#042e-mapping](https://github.com/Skords-01/Sergeant/pull/1827), [#042e-submit](https://github.com/Skords-01/Sergeant/pull/1901), [#042e-drain](https://github.com/Skords-01/Sergeant/pull/1913), [#042e-lifecycle](https://github.com/Skords-01/Sergeant/pull/1922), [#042e-pushloop](https://github.com/Skords-01/Sergeant/pull/1926), [#042e-scheduler](https://github.com/Skords-01/Sergeant/pull/1932), [#042e-status](https://github.com/Skords-01/Sergeant/pull/1933), [#042e-recover](https://github.com/Skords-01/Sergeant/pull/1935), [#042e-flush](https://github.com/Skords-01/Sergeant/pull/1938)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                              |
> | 6 — ops                        | ✅ COMPLETE            | [#046](https://github.com/Skords-01/Sergeant/pull/1923) (pgBouncer), [#047](https://github.com/Skords-01/Sergeant/pull/1928) (read replica), [#048](https://github.com/Skords-01/Sergeant/pull/1737) (sync dashboard), [#049 docs](https://github.com/Skords-01/Sergeant/pull/1757), [#049b](https://github.com/Skords-01/Sergeant/pull/1964) (weekly backup-verify CI), #050 (`module_data` partition + archival)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | #045 Redis (optional)                                                                                                                                                                                                                                                          |
> | 7 — cleanup                    | ✅ COMPLETE (9/9)      | #051+#052a [`75dcdd5c`](https://github.com/Skords-01/Sergeant/commit/75dcdd5c) (drop `module_data` table + видалити v1 server `syncPush*`/`syncPull*` handler-и + `MODULE_DATA_MODULES` const); #052b [`a97b8cc8`](https://github.com/Skords-01/Sergeant/commit/a97b8cc8) ([#2046](https://github.com/Skords-01/Sergeant/pull/2046), web cloudSync engine tree drop); #052c [`20793adb`](https://github.com/Skords-01/Sergeant/commit/20793adb) (mobile cloudSync engine tree drop); #053a ([#2078](https://github.com/Skords-01/Sergeant/pull/2078), web KVStore syncedKV shim drop); #053b ([#2082](https://github.com/Skords-01/Sergeant/pull/2082), mobile fizruk wave); #053c ([#2091](https://github.com/Skords-01/Sergeant/pull/2091), mobile wave 2 — nutrition + finyk + routine); #054a [`079fe8e3`](https://github.com/Skords-01/Sergeant/commit/079fe8e3) ([#2058](https://github.com/Skords-01/Sergeant/pull/2058), localStorage allowlist budget 10 → 6 + drop стейлових cloudSync v1 entry-їв); #054b [`997ad6e2`](https://github.com/Skords-01/Sergeant/commit/997ad6e2) + [`ac2cc5c8`](https://github.com/Skords-01/Sergeant/commit/ac2cc5c8) ([#2066](https://github.com/Skords-01/Sergeant/pull/2066), Supersedes-edge ADR-0004 ↔ ADR-0047 + 12 dangling cloudSync v1 doc-refs у 6 файлах); #054c [`5f2cfb0c`](https://github.com/Skords-01/Sergeant/commit/5f2cfb0c) ([#2072](https://github.com/Skords-01/Sergeant/pull/2072), 3 dangling refs до видаленого `docs/testing/mutation.md`); #054x [`077c738f`](https://github.com/Skords-01/Sergeant/commit/077c738f) ([#2073](https://github.com/Skords-01/Sergeant/pull/2073), fix-forward — додано missing row для ADR-0049 в `docs/adr/README.md`); #054 final [`5fdfcbe4`](https://github.com/Skords-01/Sergeant/commit/5fdfcbe4) (final localStorage burndown — eslint allowlist = [], 6 storage-primitive файлів делегують у `webKVStore` з `@sergeant/shared`, KVStore.listKeys interface upgrade, lazy-resolve refactor, nutrition migration regression fix, budget production: 6 → 0; **9 переплетених sub-tasks в одному squash-merge — деталі у §3**) | —                                                                                                                                                                                                                                                                              |
> | 8 — SQLite cut-over rollout    | 🚧 IN PROGRESS (11/17) | [#2118](https://github.com/Skords-01/Sergeant/pull/2118) (PR #058 mobile sync-engine writer-runtime boot path + CloudSync v1 client cleanup); Stage 8 dual-write default-on slice landed: Routine [#2133](https://github.com/Skords-01/Sergeant/pull/2133) (PR #055r1), Fizruk [#2135](https://github.com/Skords-01/Sergeant/pull/2135) (PR #055f1), Nutrition + Finyk + Finyk Mono mirror [#2178](https://github.com/Skords-01/Sergeant/pull/2178) (PR #055n1 + #055k1); Stage 8 dual-write telemetry sink ([`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4)). Read-default-on slice [#2179](https://github.com/Skords-01/Sergeant/pull/2179) was reverted by [#2181](https://github.com/Skords-01/Sergeant/pull/2181) (`2735fa75`) after PWA habit-input regression, then re-rolled out per-module: Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244) (PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247) (PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251) (PR #055n2), Finyk (`24616449`, PR #055k2). PR #056r — drop Routine dual-write feature-flag gating with revised scope (commit `ff852475`). Stage 8 §3 parity probe wired у Routine ([#2243](https://github.com/Skords-01/Sergeant/pull/2243), `4ea2c952`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Re-rollout `read_sqlite` default-on (PR #055\*2 quartet) gated on PWA stability re-verify; LS-write safety-net removal (PR #056\*) and LS-reader removal (PR #057\*) remain gated by canary windows. Detail у §3 Stage 8 нижче. Calendar: ~3 тижні coding + 2-3 місяці canary. |
> | 9 — KV store swap              | ✅ COMPLETE (7/7)      | [#2155](https://github.com/Skords-01/Sergeant/pull/2155) (PR #060 `kv_store` SQLite table + bundled migration), [#2157](https://github.com/Skords-01/Sergeant/pull/2157) (PR #061 `createSqliteKVStore` warm-cache adapter), [#2159](https://github.com/Skords-01/Sergeant/pull/2159) (PR #062 `bootstrapKvStore()` web boot wiring + LS→`kv_store` one-time migration), [#2165](https://github.com/Skords-01/Sergeant/pull/2165) (PR #063 `webKVStore` swap onto SQLite-backed `kv_store`), [#2168](https://github.com/Skords-01/Sergeant/pull/2168) (PR #064 drop LS mirror — SQLite-only `webKVStore`), [#2170](https://github.com/Skords-01/Sergeant/pull/2170) (PR #065 mobile KV mirror swap onto SQLite-backed `kv_store`), PR #066 (`createMemoryKVStore` test-utils-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                              |
>
> **Per-PR scope and Done/Risk/Dep notes** живуть у §3 (PR plans) нижче — таблиця тут лише задля швидкого огляду landed-стану. **Boot-wiring** для `register{Routine,Fizruk,Nutrition,Finyk}DualWriteContext` залендив у [#1491](https://github.com/Skords-01/Sergeant/pull/1491) (Routine + Fizruk web/mobile) + per-module `useNutritionDualWriteBoot` / `useFinykDualWriteBoot` хуки (Nutrition + Finyk web + mobile через `NutritionApp.tsx` / `useStorage.ts`).
> **Status:** Active

> Зріз: 2026-05-02. Базується на storage-аудиті + поточний стек:
> Vercel (web), Railway (Postgres+API), Expo SDK 52 + RN 0.76.9 (mobile),
> Capacitor (mobile-shell WebView), pnpm 9.15 + Turbo, Vite 6.4, Better Auth,
> TanStack Query 5.99.

---

## 0. Definition of Done (що означає «production-ready»)

Після завершення roadmap має виконуватись усе нижче:

1. **Жодного P0** з `docs/tech-debt/{frontend,backend}.md` не лишається відкритим
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
   tech-debt-freshness gate розширений на `docs/tech-debt/storage.md`.
9. **Backup/restore runbook** + щотижнева автоматизована верифікація
   відновлення на staging.
10. **Sync health dashboard** (Grafana / Sentry) з RED-метриками
    (lag, conflict rate, queue depth, op-log throughput).

---

## 1. Цільова архітектура (нагадування)

```
┌─────────────── CLIENT (web OPFS / mobile FS) ───────────��───┐
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

---

## 3. PR-плани

### Stage 0 — Security hygiene (P0)

#### **PR #001 — `chore(mobile): MMKV encryption with SecureStore-derived key`** ✅ LANDED — [#1272](https://github.com/Skords-01/Sergeant/pull/1272)

- **Scope.** `apps/mobile/src/lib/storage.ts`: при першому запуску
  згенерувати random 32-byte key, зберегти в `expo-secure-store`,
  передати у `new MMKV({ id, encryptionKey })`. Фолбек: якщо SecureStore
  недоступний — лог-warn і unencrypted MMKV (як зараз).
- **Migration.** Існуючі юзери: запустити `migrateUnencryptedToEncrypted()`
  на cold-boot — створити encrypted instance, скопіювати ключі, видалити
  старий store. Гарантувати idempotency.
- **Risk.** Втрата даних якщо міграція впаде на півдорозі. Mitigation:
  flag `mmkv_encryption_v1_done` тільки після успішного `getAllKeys()`
  на новому instance.
- **AC.** Тести: encryptedKey deterministic per-device; legacy migration
  100% data preserved; no plaintext leak. Detox e2e перевіряє що дані
  виживають reinstall (з SecureStore key).
- **Dep.** None.

#### **PR #002 — `feat(server): rotate Mono PAT to backend-only flow, drop FINYK_TOKEN from sync keys`** ✅ LANDED — [#1280](https://github.com/Skords-01/Sergeant/pull/1280)

- **Scope.** Видалити `FINYK_TOKEN` з `SYNC_MODULES.finyk.keys` у `core/cloudSync/config.ts`
  (web) і `apps/mobile/src/sync/config.ts`. PAT уже зберігається в
  `mono_connection.token_ciphertext`, дублікат у LS/MMKV — security-leak.
- **Backfill.** `finyk_token` з LS/MMKV → POST на новий ендпоінт
  `/api/v1/finyk/mono/import-pat` → шифрування + збереження → видалення з LS.
- **Risk.** Юзери з активним PAT, що не онлайн на момент cleanup — потрібен
  graceful state поки не з'явиться мережа.
- **AC.** ESLint-rule `no-finyk-token-in-storage`. Test: новий юзер не може
  записати PAT у LS/MMKV. Існуючі — auto-migrate на першому online.
- **Dep.** None.

#### **PR #003 — `feat(server): persist Mono webhook secret rotation worker`** ✅ LANDED — [#1497](https://github.com/Skords-01/Sergeant/pull/1497)

- **Scope.** Cron-job (Railway scheduled task) який раз на 90 днів ротує
  `mono_connection.webhook_secret_hash`. Endpoint `POST /api/internal/mono/webhook/rotate`
  у [`apps/server/src/routes/internal/mono.ts`](../../apps/server/src/routes/internal/mono.ts);
  логіка у [`apps/server/src/modules/mono/rotateSecret.ts`](../../apps/server/src/modules/mono/rotateSecret.ts);
  storage у migration `033_mono_webhook_secret_rotated_at` (стовпець `webhook_secret_rotated_at`).
- **Risk.** Проґавити вікно ротації — Mono webhook відмовляє. Mitigation:
  Sentry warning, якщо connection > `alertAfterDays` без ротації — реалізовано у
  `rotateSecret.ts`; old secret лишається активним, поки Monobank не ACK-не нову URL,
  тому incoming webhooks не падають при partial failure.
- **AC.** Unit-test (`rotateSecret.test.ts`) + integration-test mono-mock — пройшов.
- **Dep.** None.

#### **PR #004 — `feat(web): exclude sensitive query keys from IDB persister`** ✅ LANDED — [#1283](https://github.com/Skords-01/Sergeant/pull/1283)

- **Scope.** `apps/web/src/shared/lib/api/queryClientPersister.ts`:
  додати `dehydrateOptions.shouldDehydrateQuery` exclude list для
  `/api/coach/*`, `/api/me/finance/balance`, `/api/sync/*`, `/api/auth/*`.
- **Mirror.** Ті самі exclusions у `apps/mobile/src/sync/persister/mmkvPersister.ts`.
- **AC.** Vitest snapshot перевіряє що дегідрований стан не містить
  `coach`/`balance` query-keys. CI gate.
- **Dep.** None.

#### **PR #005 — `feat(server): sync_audit_log table + admin-only viewer`** ✅ LANDED — [#1284](https://github.com/Skords-01/Sergeant/pull/1284)

- **Scope.** Нова таблиця `sync_audit_log (id, user_id, op_type, module,
payload_size, conflict, created_at)`. Запис у `syncPushAll`/`syncPullAll`
  поряд з метриками. Admin endpoint для перегляду (Better Auth role).
- **Migration.** `023_sync_audit_log.{sql,down.sql}`.
- **AC.** Postgres-test, RLS перевірка (юзер не бачить чужі логи),
  performance — index `(user_id, created_at DESC)`.
- **Dep.** None.

---

### Stage 1 — Consolidation

#### **PR #006 — `refactor(shared): unified KVStore with platform adapters`** ✅ LANDED — [#1467](https://github.com/Skords-01/Sergeant/pull/1467)

- **Scope.** `packages/shared/src/storage/kv.ts`:

  ```ts
  export interface KVStore {
    getString(k): string | null;
    setString(k, v): void;
    remove(k): void;
    onChange(k, cb): Unsubscribe;
  }
  ```

  - `webKVStore`, `mobileKVStore`, `memoryKVStore` (для тестів).
    Видалити дублі у `apps/{web,mobile}/src/.../storage.ts`.

- **AC.** 100% покриття обох адаптерів. Web-storage event прокинутий в onChange.
- **Risk.** Breaking change для всіх consumers. Mitigation: re-export з
  старих шляхів як deprecated alias, codemod скриптом.
- **Dep.** None.

#### **PR #007 — `refactor(shared): single SYNC_MODULES registry`** ✅ LANDED — [#1474](https://github.com/Skords-01/Sergeant/pull/1474)

- **Scope.** Винести `SYNC_MODULES` з `apps/web/src/core/cloudSync/config.ts`
  - `apps/mobile/src/sync/config.ts` у `packages/shared/src/sync/modules.ts`.
    **Закриває drift-баг** (зараз mobile знає ключі, яких нема у web → blob
    на сервері перетирає mobile-only дані порожнім).
- **AC.** Snapshot test що web і mobile bundle мають однакові keys per module.
- **Dep.** PR #006.

#### **PR #008 — `refactor(web): replace localStorage.setItem monkey-patch with explicit writeAndEnqueue`** ✅ LANDED — `ff217246` on main

- **Scope.** Замість `storagePatch.ts` — explicit hook `useSyncedKVStore`
  у `packages/shared`. Усі writes у sync-tracked keys йдуть через нього.
- **Codemod.** Скрипт що знаходить `safeWriteLS(STORAGE_KEYS.X, …)` де
  X у sync-keys і замінює на `syncedKV.setString(...)`.
- **Risk.** Місця де writes ідуть прямо в `localStorage.setItem` (allowlist
  у `eslint.config.js`) — треба пройтись по них вручну.
- **AC.** Видалити `__hubSyncPatched` глобал. Test: write у sync-key триґерить
  push без monkey-patch.
- **Dep.** PR #006, #007.

#### **PR #009 — `refactor(web): move sync metadata + offline queue to IDB`** ✅ LANDED — [#1526](https://github.com/Skords-01/Sergeant/pull/1526)

- **Scope.** `SYNC_OFFLINE_QUEUE` переходить з LS у IDB (через `idb-keyval`).
  Знімає 5–10 MB cap для offline queue. `SYNC_VERSIONS` та
  `SYNC_DIRTY_MODULES` лишилися в LS — вони ≤ кількох КБ і їм важливіше
  sync-read у запуску.
- **Bonus.** `MAX_OFFLINE_QUEUE` піднято з 50 до **10 000**.
- **Implementation note.** Додано `apps/web/src/core/cloudSync/storage/syncMetaStore.ts` —
  тонкий wrapper над `idb-keyval` зі своїм database (`sergeant-sync-meta`)
  і store (`v1`). LS-dual-write залишений як best-effort backup поки
  розмір черги ≤ 100 entries (щоб JSON.stringify не churn-ив для довгих
  черг). На cold-boot `hydrateOfflineQueueFromDisk()` мержить LS-legacy
  у IDB, після чого IDB стає authoritative.
- **Follow-up.** PR #010 нижче поглинає `sergeant-sync-meta` базу у
  спільну `sergeant-db`.
- **AC.** Vitest unit-тести покривають hydrate path, dual-write threshold,
  IDB-unavailable graceful degradation. Замінили snapshot для `replay`
  тестів на новий механізм. (E2E-тест на 200 op-ів — у TODO Stage 5.)
- **Dep.** PR #007, #008.

#### **PR #010 — `refactor(web): consolidate 5 IDB databases into 1 sergeant-db`** ✅ LANDED — [#1543](https://github.com/Skords-01/Sergeant/pull/1543)

- **Scope.** Після PR #009 на клієнті стало 5 IDB баз: `sergeant-rq-cache`,
  `sergeant-sync-meta`, `hub_nutrition_recipe_book`,
  `hub_nutrition_meal_photos`, `hub_nutrition_food_db`. Зливаємо в одну
  `sergeant-db` з **7 object stores** (`rq_cache`, `sync_meta`,
  `nutrition_recipes`, `nutrition_foods`, `nutrition_barcodes`,
  `nutrition_meal_thumbs`, `migration_meta`). Один schema-version,
  одна shared connection — DevTools, quota і connection pool усі
  пулиться разом. `rq-cache` теж переїхав, бо buster-логіка вирівняна
  з рештою.
- **Migration.** `migrateLegacyDbOnce({ legacyDbName, copy })` — лінива
  per-module idempotent копія на першому read/write модуля. Прапорець
  `{ migrated: true, at }` пишеться у `migration_meta` **до** того як
  стара база видаляється, тож обірваний прохід просто ретраїться.
  Per-module copy callback зберігає keyPath/index/Blob через
  structured-clone roundtrip.
- **No-IDB safety.** SSR / hardened iframe / Safari Private Browsing на
  старому iOS — усі helpers (`openSergeantDb`, `dbGet/dbSet/dbDel`,
  `migrateLegacyDbOnce`) deg-radely no-op-лять, не кидаючи. Покрито
  unit-тестами в `apps/web/src/shared/lib/idb/sergeantDb.test.ts`.
- **`idb-keyval`** більше не імпортується з production коду; пакет
  залишається у `package.json` тимчасово, чистка — окремий follow-up
  після того як цей PR обкатається в проді.
- **AC.** 7 unit-тестів `sergeantDb.test.ts` + переписаний `syncMetaStore.test.ts`
  з мок-боунд-арі на `sergeantDb`; 231 cloudSync-test + 126 nutrition-test
  далі зе��ені. Ручна перевірка міграції живої бази робиться на наступному
  cold-boot після деплою.
- **Dep.** PR #009.

#### **PR #011 — `feat(server): replace in-memory rate-limit with Postgres-backed sliding window`** ✅ LANDED — [#1521](https://github.com/Skords-01/Sergeant/pull/1521)

- **Scope.** `apps/server/src/http/rateLimit.ts` переписано на Postgres
  (нова таблиця `rate_limit_buckets`) зі sliding-window-counter. Atomic
  upsert через `INSERT … ON CONFLICT DO UPDATE` гарантує race-free
  інкремент між кількома Railway інстансами; in-memory shortcut
  залишений як cache для retry-cyle при PG outage.
- **Migration.** `apps/server/src/migrations/037_rate_limit_buckets.{sql,down.sql}`.
- **Тести.** `apps/server/src/http/rateLimit.test.ts` (sliding-window,
  reset, race) — pg-mem-харнес підтверджує атомарність upsert-у.
- **Dep.** None.

#### **PR #012 — `feat(server): add CHECK constraint on module_data.module + soft-delete columns`** ✅ LANDED — [#1290](https://github.com/Skords-01/Sergeant/pull/1290)

- **Scope.** Додати `CHECK (module IN ('finyk','fizruk','routine','nutrition','profile'))`
  на `module_data`. Додати `deleted_at TIMESTAMPTZ` на high-volume tables
  (mono_transaction, push_subscriptions, ai_usage_daily, sync_audit_log).
- **Migration.** `025_module_check_and_soft_delete.{sql,down.sql}`.
- **AC.** Bad-data test: insert невідомого модуля → reject.
- **Dep.** None.

#### **PR #013 — `chore: complete localStorage burndown to 0 raw uses`** ✅ LANDED — sub-PR-и [#1344](https://github.com/Skords-01/Sergeant/pull/1344), [#1345](https://github.com/Skords-01/Sergeant/pull/1345), [#1350](https://github.com/Skords-01/Sergeant/pull/1350), [#1520](https://github.com/Skords-01/Sergeant/pull/1520)

- **Scope.** Allowlist у `eslint.config.js` для `sergeant-design/no-raw-local-storage`
  закрито до **0**. Усі raw `localStorage.*` рефи перейшли на
  `safeReadLS` / `safeWriteLS` / `safeRemoveLS` / `safeListLSKeys`.
- **Sub-PR-и.**
  - [#1344](https://github.com/Skords-01/Sergeant/pull/1344) — hub/search migration на `safeReadStringLS`.
  - [#1345](https://github.com/Skords-01/Sergeant/pull/1345) — presetApply.
  - [#1350](https://github.com/Skords-01/Sergeant/pull/1350) — modules raw-LS.
  - [#1520](https://github.com/Skords-01/Sergeant/pull/1520) — final drain. 8 з 9 файлів у allowlist уже мігрували попередні sub-PR-и; лише `useWeeklyDigest.ts` мав 2 живих рефа (`localStorage.length` + `localStorage.setItem`) — переписали на `safeListLSKeys` + `safeWriteLS`. Allowlist у `eslint.config.js` зведений до empty.
- **AC.** ESLint `no-raw-local-storage` без exceptions, CI green на main.
- **Dep.** PR #006-#008.

---

### Stage 2 — Foundation для SQLite ✅ COMPLETE

> **Статус:** Усі 8 PR-ів (#014–#021) зленділи станом на 2026-05-02.
> Наступний крок — Stage 3 SPIKE (decision gate: go/no-go для SQLite).

#### **PR #014 — `feat: add Drizzle ORM as cross-platform schema source of truth`** ✅ LANDED — [#1298](https://github.com/Skords-01/Sergeant/pull/1298)

- **Scope.**
  - `packages/db-schema/` — новий package, експортує Drizzle table definitions.
  - Обидва диалекти: `drizzle-orm/pg-core` для server, `drizzle-orm/sqlite-core`
    для clients. Спільні enum-и через `packages/db-schema/src/shared/`.
  - `drizzle-kit` як devDep, npm-script для генерації міграцій.
  - Server: переписати першу таблицю (наприклад `waitlist_entries`) на
    Drizzle як smoke-test.
  - Tables covered: `waitlist_entries`, `module_data`, `sync_audit_log`,
    `push_subscriptions` — both PG and SQLite dialects.
- **Risk.** Drizzle на clients не активно тестований — варіант B: на
  clients використати Drizzle тільки для типів + raw queries через
  Kysely-style builder.
- **AC.** `pnpm typecheck` зелений на всіх трьох apps. SQL-snapshot test
  що Drizzle generates same SQL для існуючої схеми.
- **Dep.** None.

#### **PR #015 — `feat(web): integrate sqlite-wasm with OPFS-VFS, lazy-loaded`** ✅ LANDED — [#1310](https://github.com/Skords-01/Sergeant/pull/1310)

- **Scope.**
  - Додати `@sqlite.org/sqlite-wasm` як dep.
  - `apps/web/src/core/db/sqlite.ts` — async init, OPFS VFS preferred,
    fallback на IDB-VFS для Safari/iOS<16.4.
  - **Lazy chunk** через dynamic `import()` — sqlite-wasm не у initial bundle.
  - Плагін перевіряє `crossOriginIsolated` і показує в DevTools warning якщо
    headers неправильні.
- **Bundle budget.** Ціль: sqlite-chunk ≤ 700 KB brotli, lazy-loaded тільки
  при першому запиті у БД. Initial bundle (`size-limit`) НЕ зростає.
- **AC.** Vitest: write/read/migrate працює у JSDOM-mock + у Playwright e2e
  у реальному Chromium.
- **Dep.** PR #014.

#### **PR #016 — `feat(web): add COOP/COEP headers on app routes for OPFS cross-origin isolation`** ✅ LANDED — [#1354](https://github.com/Skords-01/Sergeant/pull/1354)

- **Scope.** `vercel.json` — додати:
  ```json
  {
    "source": "/((?!\\.well-known).*)",
    "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
    ]
  }
  ```
- **Risk.** Ламає embed-и без CORP: Google Fonts, Vercel Analytics,
  PostHog, Sentry. Mitigation:
  - **Self-host fonts** (PR #017 нижче).
  - PostHog/Sentry/Vercel Analytics додають `crossorigin="anonymous"` +
    встановлюють CORP на свої CDN — перевірити по docs.
  - Якщо щось не CORP-aware — перенести через CORP-проксі (Vercel rewrite).
- **AC.** `crossOriginIsolated === true` в браузері. Lighthouse/Sentry/PostHog
  далі працюють. OAuth (Better Auth Google) популяр може вимагати окремих
  правил — test заздалегідь.
- **Dep.** PR #017.

#### **PR #017 — `chore(web): self-host Google Fonts via fontsource`** ✅ LANDED — [#1297](https://github.com/Skords-01/Sergeant/pull/1297)

- **Scope.** Перейти з Google Fonts CDN на `@fontsource/{family}`.
  Service Worker `CacheFirst` правило для шрифтів стає простіше (same-origin).
- **AC.** Bundle (CSS+font subset) ≤ +30 KB initial. Visual regression
  Playwright тестом.
- **Dep.** None.

#### **PR #018 — `feat(mobile): integrate expo-sqlite v15 with Drizzle adapter`** ✅ LANDED — [#1307](https://github.com/Skords-01/Sergeant/pull/1307)

- **Scope.**
  - Додати `expo-sqlite` (SDK 52 first-class). Drizzle через
    `drizzle-orm/expo-sqlite`.
  - `apps/mobile/src/core/db/sqlite.ts` — обгортка з `withTransaction`.
  - **EAS Build rebuild** dev-client — note для команди.
- **Risk.** Native bump потребує оновити custom dev-client. Якщо в команди
  є activity-build блокування — план B: `op-sqlite` (швидший, але без
  Drizzle out-of-box).
- **AC.** Detox e2e: insert/select/migrate.
- **Dep.** PR #014.

#### **PR #019 — `feat: schema migration runner (cross-platform)`** ✅ LANDED — [#1333](https://github.com/Skords-01/Sergeant/pull/1333)

- **Scope.** `packages/db-schema/migrate.ts` — runner що читає
  `*.sql` з `migrations/` і застосовує послідовно з трекінгом у
  `__migrations` таблиці. Працює як на pg, так і на sqlite через
  Drizzle dialect-адаптер.
- **AC.** Test rolling forward + rolling back; idempotency перевірена;
  rollback на середині міграції залишає БД у consistent state.
- **Dep.** PR #014.

#### **PR #020 — `feat(server): create normalized routine_* tables (target shape)`** ✅ LANDED — [#1332](https://github.com/Skords-01/Sergeant/pull/1332)

- **Scope.** `026_routine_tables.{sql,down.sql}`:
  - `routine_entries (id UUID, user_id, name, completed_at, created_at, updated_at, deleted_at)`
  - `routine_streaks (user_id, current_streak, longest_streak, last_completed_at)`
  - Indexes: `(user_id, created_at DESC)`, `(user_id, deleted_at) WHERE deleted_at IS NULL`.
- **Backfill.** Скрипт `migrate-routine-from-blob.ts` — для кожного юзера
  читає `module_data.data->'routine'`, розпарсює, інсертить у нові таблиці.
  **Не видаляє** module_data.routine (на час Stage 4 dual-write).
- **AC.** Backfill коректний на staging; spot-check на 100 юзерах.
- **Dep.** PR #014, #019.

#### **PR #021 — `feat(server): /v2/sync/push + /v2/sync/pull endpoints (op-log based)`** ✅ LANDED — [#1355](https://github.com/Skords-01/Sergeant/pull/1355)

- **Scope.**
  - `POST /v2/sync/push` — приймає масив op-log entries
    `[{ table, op, row, client_ts, idempotency_key }]`. Apply у транзакції,
    повертає `{ accepted, last_op_id, results }`.
  - `GET /v2/sync/pull?since=<op_id>&limit=` — повертає op-log entries
    від інших девайсів того ж юзера. Pagination через `next_cursor`.
  - Idempotency: `(user_id, idempotency_key)` UNIQUE, повторний push
    повертає cached result; повтор не виконує DML.
  - Whitelist-таблиці на цьому етапі — `routine_entries`, `routine_streaks`
    (`OP_LOG_TABLE_REGISTRY` у `apps/server/src/modules/sync/syncV2.ts`).
  - LWW per-row через `client_ts` vs `updated_at` рядка; clock-skew
    `client_ts > server+1h` reject-нуто з `reason='clock_skew'`.
  - Метрики (`syncOperationsTotal{op="v2_push"|"v2_pull"}`) і
    audit-log (`sync_audit_log{module='syncV2'}`) — без нових інфра-
    компонентів, ділять існуючий RED-набір.
  - Опціональний `X-Origin-Device-Id` хедер виключає ops того ж пристрою
    при `pull` (replay-safety без додаткового state на клієнті).
- **AC.** Replay-safe (one client пуляє pull → applies; potem той самий
  push → no-op). Conflict-free на routine smoke test. v1 sync без
  регресій. Migration `027_sync_op_log.{sql,down.sql}` round-trip clean.
- **Dep.** PR #019, #020.

---

### Stage 3 — SPIKE на routine

#### **PR #022 — `feat(spike): routine module on SQLite — proof of concept`** ✅ CLOSED / ARCHIVED — initial SPIKE landed [#1366](https://github.com/Skords-01/Sergeant/pull/1366); SPIKE scaffolding decommissioned [#1421](https://github.com/Skords-01/Sergeant/pull/1421) (2026-05-03)

> **Статус (2026-05-03):** decision-gate **GO** — Stage 4 за цим SPIKE-ом
> вже виконано (routine cut-over PR #025 + cleanup PR #026), тому SPIKE
> code було розкомпоновано: production-critical файли (`clientMigrate.ts`,
> `expoSqliteAdapter.ts`, `testSqlite.ts`) промоутнули у не-SPIKE-шляхи,
> решту бібліотеки + dev-panel-і + feature flag видалили у [#1421](https://github.com/Skords-01/Sergeant/pull/1421).
> SPIKE-нотатник архівовано: [`docs/notes/spikes/routine-sqlite-v2.md`](../notes/spikes/routine-sqlite-v2.md#decision-gate-metrics)
> (`Status: Completed & archived`). Decision-gate replication тепер
> покривається production reads PR #025 + drop-blob PR #026 + dual-write PR #024.

- **Goal.** Один модуль повністю на SQLite на обох платформах. Demo:
  toggle звички з web + mobile паралельно → обидва девайси у sync без
  конфлікту.
- **Scope.**
  - Web: routine UI читає з SQLite (через Drizzle), пише з SQLite +
    додає op-log entry.
  - Mobile: те саме через `expo-sqlite`.
  - Sync: client opens → pull → apply local; periodic push на background.
  - Feature flag `feature.routine.sqlite_v2 = false` за замовчуванням.
- **Артефакти.**
  - `packages/db-schema/src/sqlite/routine.ts` — Drizzle SQLite схема
    (`routine_entries`, `routine_streaks`, `sync_op_outbox`,
    `sync_op_cursor`).
  - `packages/db-schema/src/sqlite/migrations/001_routine_spike.sql` +
    `migrations/index.ts` — bundled клієнтська міграція + manifest, який
    проганяє `runMigrations` із `@sergeant/db-schema/migrate`.
  - `apps/web/src/modules/routine/lib/sqliteSpike/` — repo + sync engine
    - sqlite-wasm adapter + types (15 vitest tests).
  - `apps/mobile/src/modules/routine/lib/sqliteSpike/` — дзеркало
    web-бібліотеки + expo-sqlite адаптер (6 jest tests; SPIKE
    дублює ~500 рядків — буде винесено у спільний пакет на Stage 5).
  - Web feature flag `feature.routine.sqlite_v2` зареєстровано у
    `apps/web/src/core/lib/featureFlags.ts` (default: off, experimental).
  - Документ `docs/notes/spikes/routine-sqlite-v2.md` — кваліфікаційний
    нотатник із decision-gate замірами.
- **Що ще треба для замикання SPIKE-у (наступний PR в цій гілці).**
  - Web: невелика dev-only панель у Settings → Експериментальне, щоб
    клацати «toggle entry / push / pull» і вимірювати latency.
  - Mobile: аналогічна панель у DEV menu.
  - Зняти заміри bundle (web) + first-open SQLite latency на iOS
    Safari 16.4+ і опублікувати у `routine-sqlite-v2.md`.
- **Decision gate (kill criteria).**
  | Метрика | Pass | Fail |
  |---|---|---|
  | Initial bundle (web) | ≤ +5 KB | ≥ +50 KB |
  | First open SQLite latency | ≤ 200 ms | ≥ 800 ms |
  | OPFS на Safari iOS 16.4+ | works | doesn't load |
  | Multi-device toggle conflict-free | yes | manual conflict resolution required |
  | Vercel bundle build time | ≤ +30s | ≥ 2 min |
- **Якщо fail.** Документуємо blockers, повертаємось до Stage 1
  consolidation (без SQLite). План B: на whole-blob LWW + custom
  per-row diff на сервері.
- **Якщо pass.** GO для Stage 4.
- **Dep.** PR #015, #016, #018, #021.

---

### Stage 4 — Per-module migration

> **Шаблон 4 PR-ів на модуль:** schema → dual-write → cut-over → cleanup.
> Кожен модуль за feature flag. Нижче розписано для `routine`; для інших
> ідентично з заміною назв.

#### **Routine** (3 тижні)

##### **PR #023 — `feat(routine): Drizzle schema + SQLite migration files`** ✅ MERGED

> **Статус (2026-05-02):** залендили (merge `47bade84`). Скоп — pure schema
> promotion: SQLite Drizzle-схеми (`routineEntries`, `routineStreaks`,
> `syncOpOutbox`, `syncOpCursor`) і inline міграцію вже залендили в
> Stage 2 (PR #018) і живили SPIKE з PR #022. Цей PR промоутить їх з
> SPIKE-only naming у production source-of-truth: додає neutral
> `ROUTINE_CLIENT_MIGRATIONS` / `ROUTINE_MIGRATIONS_TABLE` exports
> (попередні `ROUTINE_SPIKE_*` лишаються як `@deprecated` aliases для
> back-compat зі SPIKE library), додає SQLite snapshot test парний до
> існуючого `pg-routine-snapshot.test.ts` і прибирає stale «Stage 3
> SPIKE» формулювання з коментарів. **Без SPIKE-pass dependency** —
> production routine module на цей шар ще не сів (це PR #024
> dual-write); за feature flag нічого не активується.

- Додати таблиці у `packages/db-schema/sqlite/routine.ts`. Postgres-таблиці
  вже існують (PR #020). Migration scripts.
- **Артефакти.**
  - `packages/db-schema/src/sqlite/migrations/index.ts` — нові
    `ROUTINE_CLIENT_MIGRATIONS` + `ROUTINE_MIGRATIONS_TABLE`; стара пара
    `ROUTINE_SPIKE_*` тримається як `@deprecated` alias на ту саму
    `MigrationFile[]` й ту саму ledger-table (Hard Rule: SPIKE library
    не змінюється).
  - `packages/db-schema/src/sqlite/index.ts` — re-export нових констант
    поряд із Drizzle-схемами; SPIKE-named aliases теж re-export-ються
    щоб ніщо в споживачах не зламалось.
  - `packages/db-schema/src/__tests__/sqlite-routine-snapshot.test.ts`
    — snapshot тест на column types, defaults, indexes (включно з
    partial-index `WHERE` clauses) і enum-кортежі для `op` / `status`.
    Парний до `pg-routine-snapshot.test.ts`.
- **AC.** `pnpm --filter @sergeant/db-schema test` — passes; новий тест
  виявить будь-яку drift між Drizzle-схемою і inline-DDL. SPIKE library
  тести (`apps/{web,mobile}/.../sqliteSpike/__tests__/`) проходять без
  змін бо `_SPIKE_*` aliases вказують на ті ж масиви/рядки.
- **Out-of-scope (відкладено).** Жодних змін у production routine
  module (`apps/{web,mobile}/src/modules/routine/{hooks,components}/`),
  жодного видалення SPIKE library, жодних feature-flag-ів — це PR #024.
- **Dep.** PR #022 (SPIKE pass) — _м'яка_ залежність: schema-promotion
  не блокується hardware-gate замірами, бо за відсутністю dual-write
  prod routine module ще читає з LS і ці схеми залишаються off-path до
  PR #024.

##### **PR #024 — `feat(routine-domain): dual-write LS↔SQLite behind feature flag`** ✅ MERGED

> **Статус (2026-05-03):** залендили (merge `3f41e7f6`). Скоп — додає
> новий feature flag `feature.routine.sqlite_v2.dual_write` (web +
> mobile, default: off, experimental: true) і дзеркальний шар
> `apps/{web,mobile}/src/modules/routine/lib/dualWrite/` з трьох
> файлів: `diff.ts` (pure-function diff `prev → next` →
> `RoutineDualWriteOp[]` — completion-add / completion-remove /
> habit-rename), `adapter.ts` (best-effort SQL поверх
> `SqliteMigrationClient` із LWW-guard на `updated_at`, ідемпотентний
> `${habitId}:${dateKey}` row id) і `index.ts` (orchestrator з
> registration-pattern контекстом — `isEnabled()`, `getUserId()`,
> `getMigrationClient()`, `getNow()`, `logger?` — щоб LS-write шар
> залишався без cycle-dep на auth/sqlite singleton-и). Інтегровано у
> `apps/web/src/modules/routine/lib/routineStorage.ts ::saveRoutineState`
> та `apps/mobile/src/modules/routine/lib/routineStore.ts ::saveRoutineState`
> через `triggerRoutineDualWrite(prev, next)` fire-and-forget;
> `peekRoutineDualWritePrev()` повертає `null` коли контекст не
> зареєстровано — нульовий overhead на off-flag шляху. Boot wiring
> (web `main.tsx` + mobile entry, виклик
> `registerRoutineDualWriteContext(...)` з реальними auth/sqlite
> singleton-ами) **відкладено окремим follow-up PR-ом** і станом на
> 2026-05-03 ще не зроблено — тому за умови ввімкнених flag-ів
> dual-write шар у проді поки не активний (`isRoutineDualWriteRegistered()`
> повертає `false`), і будь-який real-world rollout вимагає спочатку
> приземлити цей boot-wiring PR.

- **Артефакти.**
  - `apps/{web,mobile}/src/core/lib/featureFlags.ts` — нова
    `feature.routine.sqlite_v2.dual_write` (default off, experimental).
  - `apps/web/src/modules/routine/lib/dualWrite/{diff,adapter,index}.ts`
    - парні `__tests__/{diff,adapter,integration}.test.ts` (vitest +
      `better-sqlite3` через існуючий
      `sqliteSpike/__tests__/testSqlite.ts` хелпер).
  - `apps/mobile/src/modules/routine/lib/dualWrite/{diff,adapter,index}.ts`
    - jest-парні `__tests__/{diff,adapter,integration}.test.ts`
      (`better-sqlite3` напряму, як SPIKE-тести роблять).
  - `apps/mobile/src/core/db/sqlite.ts` — додано
    `getSqliteMigrationClient()` + збереження native handle поряд з
    Drizzle wrapper, щоб дзеркальний шар отримував той самий expo-sqlite
    handle без re-open (під WAL на iOS це deadlock).
  - `apps/web/src/modules/routine/lib/routineStorage.ts` +
    `apps/mobile/src/modules/routine/lib/routineStore.ts` — wiring у
    `saveRoutineState`.

- **AC.**
  - `pnpm --filter @sergeant/web test -- --run modules/routine/lib/dualWrite`
    (vitest) — diff, adapter, integration спеки pass.
  - `pnpm --filter @sergeant/mobile test -- modules/routine/lib/dualWrite`
    (jest) — те саме на mobile.
  - `pnpm lint` — clean (322+ rules).
  - SPIKE library тести лишаються green — adapter дзеркально пише в
    ту саму `routine_entries` таблицю, що SPIKE піднімає через ту ж
    `migrateRoutineSpike` міграцію.

- **Out-of-scope (відкладено).**
  - Boot wiring (`registerRoutineDualWriteContext` з реальними
    auth/sqlite singleton-ами) — окремий follow-up.
  - Cut-over reads на SQLite — це PR #025.
  - Drop `module_data.routine` blob — PR #026.
  - `routine_streaks` mirror — defer до PR #025/#040 (derived data,
    пишеться з reads cut-over-у).
  - Persistent op-log + retry — PR #040.
  - Зміни SPIKE library — не торкаємо.

- **Dep.** PR #023 (schema promotion) ✅ landed; PR #022 (SPIKE pass)
  — _м'яка_ залежність (за flag default off нічого в проді не
  активується).

##### **PR #025 — `feat(routine): cut-over reads to SQLite, deprecate LS`** ✅ MERGED (#1407)

- Read йде з SQLite. LS-write залишається на 2 тижні як safety net.
- Sync `module_data.routine` blob більше не оновлюється з клієнта.
- Server-side: backfill повторно для юзерів що не онлайн були під час
  rollout-у.
- **Реалізовано:** `sqliteReader.ts`, `sqliteReadBoot.ts`, `useSqliteReadBoot.ts`,
  feature flag `feature.routine.sqlite_v2.read_sqlite`, module sync exclusion,
  `loadRoutineState()` overlay з SQLite completions.

##### **PR #026 — `chore(routine): remove LS path, drop module_data.routine`** ✅ MERGED (#1412)

- Видалити routine з `SYNC_MODULES`. Server: `DELETE FROM module_data WHERE module='routine'`.
- ESLint guard проти reads з `STORAGE_KEYS.ROUTINE`.
- **Реалізовано:** видалено routine з `SYNC_MODULES` (web + mobile), мігровано
  `insightsEngine.ts` на `loadRoutineState()`, додано `no-restricted-syntax`
  ESLint guard, оновлено `eslint-plugin-sergeant-design` tracked keys.

> **Server-side migration (after client deploy):**
>
> ```sql
> DELETE FROM module_data WHERE module = 'routine';
> ```
>
> Run once after all clients have picked up PR #026. The blob is no
> longer pushed from clients, so orphaned rows just waste storage.

#### **Fizruk** (3 тижні) — PR #027–#030

##### **PR #027 — `feat(fizruk): postgres + sqlite normalized tables`** ✅ MERGED

- **Реалізовано (server).** `apps/server/src/migrations/029_fizruk_tables.sql`
  створює `fizruk_workouts`, `fizruk_workout_items`, `fizruk_workout_sets`,
  `fizruk_custom_exercises`, `fizruk_measurements` з індексами
  `(user_id, started_at DESC)` / `(user_id, deleted_at) WHERE deleted_at IS NULL`
  / `(workout_id, sort_order)` / `(workout_item_id, sort_order)` /
  `(user_id, measured_at DESC)` і soft-delete колонкою `deleted_at`.
  `down.sql` чистить таблиці у зворотньому FK-порядку.
- **Реалізовано (shared schema).** `packages/db-schema/src/pg/fizruk.ts`
  - `packages/db-schema/src/sqlite/fizruk.ts` дають Drizzle ORM-схеми для
    PG і SQLite (паралельні шейпи з суфіксом `_lite` для індексів). Snapshot
    тести у `packages/db-schema/src/__tests__/{pg,sqlite}-fizruk-snapshot.test.ts`
    ловлять drift між драйверами.
- **Реалізовано (client).** `packages/db-schema/src/sqlite/migrations/index.ts`
  експортує `FIZRUK_CLIENT_MIGRATIONS` з власним ledger-ом
  `__fizruk_migrations` (окремий від routine SPIKE-ledger-у). Клієнтський
  раннер `apps/{web,mobile}/src/modules/fizruk/lib/clientMigrate.ts`
  застосовує bundled migrations при першому write-і.
- **Дзеркальний test.** `apps/server/src/migrations/__tests__` snapshot-и
  - `packages/db-schema` PG/SQLite парність — нові колонки/індекси не
    поїдуть на server без оновлення client schema.

##### **PR #028 — `feat(fizruk): dual-write LS/MMKV↔SQLite (best-effort)`** ✅ MERGED

- **Scope.** Кожен write у Fizruk LS-blob-и
  (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`, `fizruk_measurements_v1`)
  додатково мирорить у локальну SQLite. Reads ще беруться з LS — це чистий
  shadow-write для validation.
- **Реалізовано (web).** `apps/web/src/modules/fizruk/lib/dualWrite/`:
  `diff.ts` рахує `FizrukDualWriteOp[]` з `prev → next` snapshot-у,
  `adapter.ts` — async best-effort upsert у `fizruk_workouts` /
  `fizruk_workout_items` / `fizruk_workout_sets` /
  `fizruk_custom_exercises` / `fizruk_measurements` з LWW-guardом
  на `updated_at`, `index.ts` — orchestrator з registration-pattern-ом
  (gating через `feature.fizruk.sqlite_v2.dual_write`, fail-soft на
  no-userId / sqlite-unavailable). Mirror у
  `apps/mobile/src/modules/fizruk/lib/dualWrite/` для expo-sqlite.
- **Feature flag.** `feature.fizruk.sqlite_v2.dual_write` (default off)
  у `apps/web/src/core/lib/featureFlags.ts` + `apps/mobile/src/core/lib/featureFlags.ts`.
  Kill switch — toggle off у flag UI, dual-write припиняється, LS лишається
  єдиним write target.
- **Не входить.** Outbox / `/v2/sync/push` для `fizruk_*` — ще немає.
  `OP_LOG_TABLE_REGISTRY` у `apps/server/src/modules/sync/syncV2.ts` поки
  whitelist-ить тільки `routine_entries` / `routine_streaks`. Server-side
  apply-функції для `fizruk_*` поїдуть разом із PR #029 (split на
  `applyFizrukWorkouts` / `applyFizrukItems` / `applyFizrukSets` /
  `applyFizrukCustomExercises` / `applyFizrukMeasurements`).
- **Dep.** PR #027 (schema + client migration runner).

##### **PR #029 — `feat(fizruk): cut-over reads to SQLite, server apply-fns`** ✅ MERGED

- **Реалізовано (server).** `apps/server/src/modules/sync/syncV2.ts` —
  5 split apply-функцій (`applyFizrukWorkouts`, `applyFizrukItems`,
  `applyFizrukSets`, `applyFizrukCustomExercises`,
  `applyFizrukMeasurements`) додано у `OP_LOG_TABLE_REGISTRY`. Кожна з них
  валідує `id`, перевіряє ownership (`user_id`), застосовує LWW-guard
  (`existing.updated_at < clientTs`), підтримує soft-delete
  (`UPDATE deleted_at = clientTs` замість DELETE) і парсить опціональні
  числові/JSON поля (helper-и `parseRequiredDate` / `parseOptionalNumber`
  / `parseOptionalInt` / `toJsonbParam`). FK-violation на parent
  (`workout_id` / `workout_item_id`) ловиться SAVEPOINT-ом
  `syncV2Push`-у і повертається як `apply_failed`.
- **Реалізовано (web).** `apps/web/src/modules/fizruk/lib/sqliteReader.ts`
  тримає кеш `{ workouts, customExercises, measurements }`. Бутстрап
  через `sqliteReadBoot.ts` + `useFizrukSqliteReadBoot` (idempotent,
  fire-and-forget, fail-soft). `useWorkouts` / `useMeasurements` /
  `useExerciseCatalog` overlay-ять зі SQLite-кешу під фічфлаґом
  `feature.fizruk.sqlite_v2.read_sqlite` (LS читає лишається як перша
  paint synchronous-fallback, ніколи не блокується на SQLite).
  Pub-sub нотифікація між хуками — `sqliteReadGate.ts` (`useSyncExternalStore`
  - tick counter, refresh by `notifyFizrukSqliteCacheRefresh`).
- **Реалізовано (mobile).** `apps/mobile/src/modules/fizruk/lib/sqliteReader.ts`
  — паритет shape-а кешу для майбутнього read cutover; UI overlay у
  mobile хуках додано окремим follow-up PR #029a (див. нижче). FK /
  soft-delete / LWW семантика повністю мирорить web.
- **Тести.**
  `apps/server/src/modules/sync/syncV2.integration.test.ts` — 5 нових
  describe-кейсів: insert→update, LWW reject, soft-delete, parent-then-child
  FK у одному push-батчі, `invalid_measured_at`-валідація.
  `apps/web/src/modules/fizruk/lib/sqliteReader.test.ts` — 7 unit-тестів
  на refresh / filter by user / soft-delete exclude / hydrate
  custom-exercises + measurements / cached state.
- **Feature flag.** `feature.fizruk.sqlite_v2.read_sqlite` (default off)
  — потребує увімкненого `dual_write`. Toggle off → reads повертаються
  на LS path; SQLite дані лишаються (нічого не дропається).
- **Не входить.** Outbox / cloudsync push з `fizruk_*` через `/v2/sync/push`
  (web/mobile pull/push pipeline), backfill `module_data.fizruk` →
  `fizruk_*` per-user. Mobile UI overlay рознесений у PR #029a (вже
  залендили), сам LS cleanup і drop `module_data.fizruk` — у PR #030.
- **Dep.** PR #027 (schema), PR #028 (dual-write).

##### **PR #029a — `feat(mobile): fizruk read overlay from SQLite under feature flag`** ✅ MERGED

> **Статус (2026-05-03):** залендили (merge `8746145d`). Скоп —
> mobile-частина PR #029, яка винесена окремо щоб тримати web cut-over
>
> - server apply-fns одним PR-ом. Додає `feature.fizruk.sqlite_v2.read_sqlite`
>   у `apps/mobile/src/core/lib/featureFlags.ts`, mobile bootstrap
>   `apps/mobile/src/modules/fizruk/lib/sqliteReadBoot.ts` +
>   `useFizrukSqliteReadBoot` хук, та `sqliteReadGate.ts` pub-sub між
>   `useFizrukWorkouts` / `useCustomExercises` / `useMeasurements`. Reads
>   overlay-ять зі SQLite-кешу під фічфлаґом, MMKV-write залишається як
>   синхронний first-paint fallback.

- **Артефакти.**
  - `apps/mobile/src/core/lib/featureFlags.ts` — нова
    `feature.fizruk.sqlite_v2.read_sqlite` (default off, experimental).
  - `apps/mobile/src/modules/fizruk/lib/{sqliteReadBoot,sqliteReadGate}.ts`
    - парні `__tests__/{sqliteReadBoot,sqliteReadGate}.test.ts`.
  - `apps/mobile/src/modules/fizruk/hooks/{useFizrukSqliteReadBoot,useFizrukWorkouts,useCustomExercises,useMeasurements}.ts`
    — overlay reads із SQLite cache.
  - `apps/mobile/src/modules/fizruk/pages/Dashboard.tsx` —
    `useFizrukSqliteReadBoot()` виклик у бутстрапі модуля.
- **Тести.**
  `apps/mobile/src/modules/fizruk/__tests__/Dashboard.test.tsx` +
  `apps/mobile/src/modules/fizruk/hooks/__tests__/useFizrukWorkouts.sqliteOverlay.test.tsx`
  - `apps/mobile/src/modules/fizruk/lib/__tests__/sqliteRead{Boot,Gate}.test.ts`.
- **Не входить.** Outbox / cloudsync push з `fizruk_*` (PR #030+).
  Backfill `module_data.fizruk` → `fizruk_*` per-user (PR #030).
- **Dep.** PR #029 (web cut-over + server apply-fns).

##### **PR #030 — `chore(fizruk): drop module_data.fizruk cloud-sync wiring, ESLint guard`** ✅ MERGED

> На відміну від routine PR #026, fizruk LS read-fallback залишався у
> модульних хуках уже після PR #029 / PR #029a (web/mobile read overlay) —
> вони читають LS першим джерелом і overlay-ять зі SQLite під флагом.
> Цей PR обмежений до cloud-sync wiring і ESLint guard-у, бо власне
> повний LS write cut-over — окрема робота (write cut-over PR після
> 100% rollout dual-write + read_sqlite + server-side backfill).

- **Реалізовано (shared).** `packages/shared/src/sync/modules.ts` —
  знятий блок `fizruk` з `SYNC_MODULES`; від тепер cloud-sync пайплайн
  ігнорує ВСІ 11 LS/MMKV-ключів `fizruk_*_v1` для push/pull (один
  source of truth, реекспортний у web/mobile cloudSync config).
- **Реалізовано (eslint-plugin).**
  `packages/eslint-plugin-sergeant-design/index.js` — знято 11 fizruk-
  ентрі з `TRACKED_STORAGE_KEY_NAMES` / `TRACKED_STORAGE_KEY_VALUES`
  з коментом-надгробком (mirroring routine PR #026 pattern).
- **Реалізовано (eslint config).** `eslint.config.js` додає
  `no-restricted-syntax` guard проти прямих `STORAGE_KEYS.FIZRUK_<key>`
  доступів поза канонічними fizruk-хуками з `ignores`-лістом для
  тестів, fizruk module wrappers, `insightsEngine.ts` (cross-module
  insights), `hubBackup.ts` (mobile backup).
- **Тести.** `packages/shared/src/sync/__tests__/modules.test.ts`
  оновлений (зняв fizruk snapshot, додав explicit "module не існує"
  assertion); `packages/eslint-plugin-sergeant-design/__tests__/no-raw-tracked-storage.test.mjs`
  flipнутий (fizruk LS keys не повинні тригерити правило); web + mobile
  cloudSync test fixtures (`buildPayload.test.ts`,
  `useCloudSync.{behavior,hardening}.test.ts`,
  `state/{moduleData,dirtyModules,versions}.test.ts`,
  `__tests__/{resolver,offlineQueue.replay}.test.ts`,
  `apps/mobile/src/sync/__tests__/{replay,offlineQueue}.test.ts`)
  оновлено: де fizruk був "ще один валідний модуль" — підставлено
  `nutrition` / `profile`; додано explicit "drops the retired fizruk
  module" assertions.
- **Не входить.** Server-side runbook `DELETE FROM module_data WHERE
module='fizruk'` — окремий ops-PR після того, як PR #029 + PR #029a
  - dual-write flag розкочено на 100% юзерів і backfill `module_data.fizruk`
    → `fizruk_*` per-user завершено. LS write cut-over (повне видалення
    MMKV/LS write-path у fizruk-хуках) — окремий follow-up PR (потребує
    100% rollout `feature.fizruk.sqlite_v2.{dual_write,read_sqlite}`).
- **Deploy gate.** Після merge cloud-sync перестає
  пушити/пуллити `module_data.fizruk` для ВСІХ юзерів. Юзери з
  вимкненим `feature.fizruk.sqlite_v2.dual_write` теряють cross-device
  sync fizruk-даних. Розкатувати тільки після 100% rollout
  dual-write + read*sqlite + server-side backfill `module_data.fizruk`
  → `fizruk*\*` per-user.
- **Dep.** PR #029 (web cut-over + server apply-fns), PR #029a (mobile
  read overlay), boot-wiring follow-up #1491 (`register{Routine,Fizruk}DualWriteContext`).

#### **Nutrition** (3 тижні) — PR #031–#034

##### **PR #031 — `feat(nutrition-domain): Drizzle SQLite + Postgres normalized tables + server apply-fns`** ✅ LANDED

> **Status:** ✅ LANDED — schema landed as `17644bef` (Drizzle schema +
> SQLite migration) + `c9eeb01d` (renumber migration 031→035). Server
> apply-fns (`applyNutritionMeals`, `applyNutritionPantries`,
> `applyNutritionPantryItems`, `applyNutritionPrefs`,
> `applyNutritionRecipes`) added to `OP_LOG_TABLE_REGISTRY` in
> `syncV2.ts`. Integration tests covering insert→update, LWW reject,
> soft-delete, FK parent-then-child, singleton upsert.

- **Scope.** Створити нормалізовані таблиці на PG і SQLite під 5 LS/MMKV
  ключів модуля (`NUTRITION_LOG`, `NUTRITION_PANTRIES`,
  `NUTRITION_ACTIVE_PANTRY`, `NUTRITION_PREFS`, `NUTRITION_SAVED_RECIPES`).
  Цільові таблиці (фінальний шейп уточнити у PR — нижче — concept):
  `nutrition_meal_log` (per-row append-only лог їжі з кількістю /
  калоріями / макросами), `nutrition_pantries` (контейнер + sort_order),
  `nutrition_pantry_items` (food_id, quantity, expires_at,
  pantry_id FK), `nutrition_recipes` (рецепти з jsonb-ingredients і
  макросами), `nutrition_prefs` (singleton-row per-user — KV-store
  для smart defaults). Усі — soft-delete через `deleted_at`,
  `(user_id, updated_at DESC)` index, FK + cascades для pantry_items.
- **Артефакти.**
  - `apps/server/src/migrations/030_nutrition_tables.{sql,down.sql}` —
    DDL з індексами і FK; `down.sql` чистить у зворотньому FK-порядку.
  - `packages/db-schema/src/pg/nutrition.ts` +
    `packages/db-schema/src/sqlite/nutrition.ts` — паралельні Drizzle
    ORM-схеми (PG і SQLite) з `_lite` суфіксами для індексів.
  - `packages/db-schema/src/__tests__/{pg,sqlite}-nutrition-snapshot.test.ts`
    - snapshot drift-guard між драйверами.
  - `packages/db-schema/src/sqlite/migrations/index.ts` додає
    `NUTRITION_CLIENT_MIGRATIONS` з власним ledger-ом
    `__nutrition_migrations` (separate від `__routine_migrations` /
    `__fizruk_migrations`).
  - `apps/{web,mobile}/src/modules/nutrition/lib/clientMigrate.ts` —
    клієнтський runner (lazy, idempotent, pre-write).
  - `apps/server/src/modules/sync/syncV2.ts` — split apply-функції
    `applyNutritionMealLog`, `applyNutritionPantries`,
    `applyNutritionPantryItems`, `applyNutritionRecipes`,
    `applyNutritionPrefs` додано у `OP_LOG_TABLE_REGISTRY`. Кожна
    валідує `id` + ownership (`user_id`), застосовує LWW
    (`existing.updated_at < clientTs`), soft-delete
    (`UPDATE deleted_at` замість DELETE), парсить
    `parseRequiredDate` / `parseOptionalNumber` / `toJsonbParam`.
- **AC.**
  - `pnpm --filter @sergeant/db-schema test` — snapshot тести проходять,
    дрифт між PG і SQLite виявляється.
  - `apps/server/src/modules/sync/syncV2.integration.test.ts` — нові
    describe-кейси на 5 nutrition apply-функцій (insert→update,
    LWW reject, soft-delete, parent-then-child FK для pantry_items,
    invalid timestamp validation).
  - `pnpm -w lint` clean (без нових STORAGE_KEYS guards — це PR #034).
- **Не входить.**
  - Dual-write шар (`apps/{web,mobile}/src/modules/nutrition/lib/dualWrite/`)
    — це PR #032.
  - Cut-over reads (UI читає з SQLite під фічфлаґом) — PR #033.
  - Drop `module_data.nutrition` з `SYNC_MODULES` + ESLint guard — PR #034.
- **Dep.** PR #027 (схема pattern), PR #029 (server apply-fns pattern),
  PR #030 (cloud-sync drop pattern).
- **Risk.** Schema-only — нульовий risk на проді (default-off flag і
  наявних писань у нові таблиці нема). Snapshot тести ловлять drift.

##### **PR #032 — `feat(nutrition-domain): dual-write LS/MMKV↔SQLite`** ✅ LANDED — [#1528](https://github.com/Skords-01/Sergeant/pull/1528)

- Mirror PR #028 (fizruk dual-write) для nutrition. Feature flag
  `feature.nutrition.sqlite_v2.dual_write`, default off, experimental.
- Реєстрація через registration-pattern, fail-soft на no-userId /
  sqlite-unavailable. Boot-wiring у follow-up за тим же шаблоном що
  PR #1491 для routine + fizruk.
- **Dep.** PR #031.

##### **PR #033 — `feat(nutrition-domain): cut-over reads to SQLite under feature flag`** ✅ LANDED — [#1574](https://github.com/Skords-01/Sergeant/pull/1574)

- Mirror PR #029 + PR #029a (web + mobile fizruk read overlay) для
  nutrition. Feature flag `feature.nutrition.sqlite_v2.read_sqlite`,
  default off. LS/MMKV-write залишається safety net.
- **Реалізовано (web).** `apps/web/src/modules/nutrition/lib/sqliteReader.ts`
  тримає кеш `SqliteNutritionCache` з `{ log, pantries, activePantryId,
prefs, recipes, refreshedAt }`. `refreshNutritionSqliteState(client,
userId)` запитує 5 SQLite таблиць (`nutrition_meals`,
  `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`,
  `nutrition_recipes`), фільтрує `deleted_at IS NULL`, трансформує
  рядки у domain типи (`Meal`, `Pantry`, `NutritionPrefs`, `Recipe`),
  будує nested maps (items-by-pantry). Helpers: `safeParseJson`,
  `toDateKey`, `toTimeStr`, `rowToMeal`, `rowToPantry`, `rowToRecipe`.
  `sqliteReadBoot.ts` — idempotent boot з перевіркою feature flag
  `feature.nutrition.sqlite_v2.read_sqlite`, запуском міграцій через
  `migrateNutrition(client)`, початковим refresh кешу. Fail-soft
  (catch + console.warn). `sqliteReadGate.ts` — pub-sub notification
  через `useSyncExternalStore` (cacheTick counter + listeners Set);
  `useNutritionSqliteReadTick()`, `useNutritionSqliteReadFlag()`,
  `notifyNutritionSqliteCacheRefresh()`.
- **Реалізовано (mobile).** `apps/mobile/src/modules/nutrition/lib/`
  — паритет shape-а кешу і refresh logic з web. `sqliteReader.ts`
  використовує `@sergeant/nutrition-domain` типи і `@sergeant/shared`
  `NullableMacros`. `sqliteReadBoot.ts` читає flag з MMKV через
  `safeReadLS` + `FLAGS_KEY`, використовує `getSqliteMigrationClient()`
  замість `getSqliteDb()`. `sqliteReadGate.ts` додає combined hook
  `useNutritionSqliteReadGate()` що повертає `{ enabled, tick }`.
- **Доставлено в [#1574](https://github.com/Skords-01/Sergeant/pull/1574)** (повний скоуп закрили одним PR-ом, разом із PR #031 + PR #032 server apply-fns):
  - Web: UI overlay у nutrition хуках (`useMeals`, `usePantries`,
    `useNutritionPrefs`, `useRecipes`) під feature flag — аналог
    fizruk `useFizrukWorkouts` / `useCustomExercises` overlay.
  - Mobile: аналогічний UI overlay + `useNutritionSqliteReadBoot`
    виклик у Dashboard/module entry.
  - Feature flag `feature.nutrition.sqlite_v2.read_sqlite` реєстрація
    у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
- **Dep.** PR #032.

##### **PR #034 — `chore(nutrition-domain): drop module_data.nutrition cloud-sync wiring + ESLint guard`** ✅ LANDED — [#1636](https://github.com/Skords-01/Sergeant/pull/1636)

- Mirror PR #030 (fizruk cloud-sync drop). Знімає `nutrition` з
  `SYNC_MODULES`, прибирає 5 NUTRITION\_\* ентрі з
  `eslint-plugin-sergeant-design` tracked sets, додає
  `no-restricted-syntax` guard у `eslint.config.js`. Server-side
  `DELETE FROM module_data WHERE module='nutrition'` — окремий
  runbook ops PR.
- **Deploy gate.** Як і PR #030: розкатувати тільки після 100% rollout
  `feature.nutrition.sqlite_v2.{dual_write,read_sqlite}` + server
  backfill `module_data.nutrition` → `nutrition_*` per-user.
- **Dep.** PR #033 (read overlay у проді).

#### **Finyk** (4 тижні) — PR #035–#039 (один extra PR на Mono mirror на клієнті)

> **Контекст.** Finyk — найважчий модуль Stage 4: 19 cloud-sync ключів
> (`SYNC_MODULES.finyk` у `packages/shared/src/sync/modules.ts`),
> 13+ доменів (budgets / subscriptions / assets / debts / receivables /
> hidden accounts / hidden TXs / monthly plan / TX categories / TX splits /
> mono-debt links / networth history / custom categories / manual expenses /
> TX filters / show-balance prefs) плюс 3 Mono-кеші (`FINYK_TX_CACHE`,
> `FINYK_INFO_CACHE`, `FINYK_TX_CACHE_LAST_GOOD`). Тому 5 PR-ів замість 4:
> схема (PR #035) + dual-write (PR #036) + read overlay (PR #037) + Mono
> mirror — це окрема PR (PR #038), бо Mono API є source-of-truth і шейп
> per-tx даних відрізняється від user-edited blob-ів — + cloud-sync drop
>
> - ESLint guard (PR #039). Усі дзеркалять відповідні fizruk PR
>   #027–#030 і nutrition PR #031–#034.

##### **PR #035 — `feat(finyk-domain): Drizzle SQLite + Postgres normalized tables + server apply-fns`** ✅ LANDED — [#1667](https://github.com/Skords-01/Sergeant/pull/1667)

- **Scope.** Створити нормалізовані таблиці на PG і SQLite під 16
  user-edited cloud-sync ключів модуля (`FINYK_HIDDEN`, `FINYK_HIDDEN_TXS`,
  `FINYK_BUDGETS`, `FINYK_SUBS`, `FINYK_ASSETS`, `FINYK_DEBTS`, `FINYK_RECV`,
  `FINYK_MONTHLY_PLAN`, `FINYK_TX_CATS`, `FINYK_TX_SPLITS`,
  `FINYK_MONO_DEBT_LINKED`, `FINYK_NETWORTH_HISTORY`, `FINYK_CUSTOM_CATS`,
  `FINYK_MANUAL_EXPENSES`, `FINYK_TX_FILTERS`, `FINYK_SHOW_BALANCE`).
  Mono-кеші (`FINYK_TX_CACHE`, `FINYK_INFO_CACHE`, `FINYK_TX_CACHE_LAST_GOOD`)
  — НЕ входять, ідуть у PR #038 окремо. Цільові таблиці (фінальний шейп
  уточнити у PR — нижче — concept):
  - **Per-row CRUD таблиці** (id uuid PK, user_id, jsonb data, soft-delete,
    `(user_id, updated_at DESC) WHERE deleted_at IS NULL` index): `finyk_budgets`,
    `finyk_subscriptions`, `finyk_assets`, `finyk_debts`, `finyk_receivables`,
    `finyk_custom_categories`, `finyk_manual_expenses`, `finyk_tx_filters`.
    Domain-types у `apps/web/src/modules/finyk/hooks/useStorage.types.ts`
    (`Budget`, `Subscription`, `ManualAsset`, `Debt`, `Receivable`,
    `CustomCategory`, `ManualExpense`) тримаємо як `data_json` (jsonb)
    замість stretching кожного поля у колонку — спрощує клієнтську міграцію
    і uses storage уже LWW-friendly per-id.
  - **Composite-PK таблиці без id**: `finyk_hidden_accounts(user_id, account_id)`,
    `finyk_hidden_transactions(user_id, transaction_id)` — обидві
    set-membership структури з `STORAGE_KEYS.FINYK_HIDDEN` і
    `FINYK_HIDDEN_TXS`. PK захищає від дублікатів.
  - **Per-tx mapping таблиці**: `finyk_tx_categories(user_id, transaction_id, category_id, updated_at, deleted_at)`
    (для `FINYK_TX_CATS` map<txId, category>),
    `finyk_tx_splits(user_id, transaction_id, splits_json, updated_at, deleted_at)`
    (для `FINYK_TX_SPLITS` map<txId, TxSplit[]>),
    `finyk_mono_debt_links(user_id, transaction_id, debt_ids_json, updated_at, deleted_at)`
    (для `FINYK_MONO_DEBT_LINKED` map<txId, debtId[]>).
  - **Time-series таблиця**: `finyk_networth_history(id, user_id, month varchar(7), networth real, snapshot_json, ...)`
    з `(user_id, month DESC)` unique index — для `FINYK_NETWORTH_HISTORY`
    NetworthEntry[].
  - **Singleton-row prefs**: `finyk_prefs(user_id PK, monthly_plan_json,
show_balance, updated_at, deleted_at)` — об'єднує
    `FINYK_MONTHLY_PLAN` (єдиний об'єкт `{income, expense, savings}`)
    і `FINYK_SHOW_BALANCE` (boolean) у одну row-per-user, як
    `nutrition_prefs` у PR #031.
- **Артефакти.**
  - `apps/server/src/migrations/037_finyk_tables.{sql,down.sql}` —
    DDL з індексами і composite PKs; `down.sql` чистить у зворотньому
    FK-порядку. (Migration 036 — останній на main.)
  - `packages/db-schema/src/pg/finyk.ts` +
    `packages/db-schema/src/sqlite/finyk.ts` — паралельні Drizzle
    ORM-схеми (PG і SQLite) з `_lite` суфіксами для індексів. Великий
    розмір файла очікуваний (~16 таблиць vs 5 у nutrition / 5 у fizruk).
  - `packages/db-schema/src/__tests__/{pg,sqlite}-finyk-snapshot.test.ts`
    — snapshot drift-guard між драйверами.
  - `packages/db-schema/src/sqlite/migrations/index.ts` додає
    `FINYK_CLIENT_MIGRATIONS` з власним ledger-ом
    `__finyk_migrations` (separate від `__routine_migrations` /
    `__fizruk_migrations` / `__nutrition_migrations`).
  - `apps/{web,mobile}/src/modules/finyk/lib/clientMigrate.ts` —
    клієнтський runner (lazy, idempotent, pre-write).
  - `apps/server/src/modules/sync/syncV2.ts` — split apply-функції
    `applyFinykBudgets`, `applyFinykSubscriptions`, `applyFinykAssets`,
    `applyFinykDebts`, `applyFinykReceivables`, `applyFinykHiddenAccounts`,
    `applyFinykHiddenTransactions`, `applyFinykTxCategories`,
    `applyFinykTxSplits`, `applyFinykMonoDebtLinks`,
    `applyFinykNetworthHistory`, `applyFinykCustomCategories`,
    `applyFinykManualExpenses`, `applyFinykTxFilters`, `applyFinykPrefs`
    додано у `OP_LOG_TABLE_REGISTRY`. Кожна валідує `id` + ownership
    (`user_id`), застосовує LWW (`existing.updated_at < clientTs`),
    soft-delete (`UPDATE deleted_at` замість DELETE), парсить
    `parseRequiredDate` / `parseOptionalNumber` / `toJsonbParam`.
- **AC.**
  - `pnpm --filter @sergeant/db-schema test` — snapshot тести проходять,
    дрифт між PG і SQLite виявляється.
  - `apps/server/src/modules/sync/syncV2.integration.test.ts` — нові
    describe-кейси на 15 finyk apply-функцій (insert→update,
    LWW reject, soft-delete, composite-PK upsert для hidden_accounts /
    hidden_transactions, singleton upsert для prefs, invalid timestamp
    validation, FK-violation на parent для networth_history).
  - `pnpm -w lint` clean (без нових STORAGE_KEYS guards — це PR #039).
- **Не входить.**
  - Dual-write шар (`apps/{web,mobile}/src/modules/finyk/lib/dualWrite/`)
    — це PR #036.
  - Mono client-side mirror (`finyk_mono_transactions`,
    `finyk_mono_accounts`, `finyk_mono_account_snapshots`) — це PR #038
    окремо, бо source-of-truth — Mono API, не user, і refresh-cycle
    відрізняється.
  - Cut-over reads (UI читає з SQLite під фічфлаґом) — PR #037.
  - Drop `module_data.finyk` з `SYNC_MODULES` + ESLint guard — PR #039.
- **Dep.** PR #027 (fizruk schema pattern), PR #031 (nutrition schema
  pattern), PR #029 (server apply-fns pattern), PR #034 (cloud-sync
  drop pattern як референс на майбутню PR #039).
- **Risk.** Schema-only — нульовий risk на проді (default-off flag і
  наявних писань у нові таблиці нема). Snapshot тести ловлять drift.
  Найбільший за обсягом schema-PR на Stage 4 (16 таблиць) —
  тримаємо `data_json` jsonb замість per-field колонок щоб уникнути
  жорсткого зв'язку між Drizzle schema і domain types — refactoring
  у `useStorage.types.ts` не повинен ламати DB.

##### **PR #036 — `feat(finyk-domain): dual-write LS/MMKV↔SQLite`** ✅ LANDED — [#1680](https://github.com/Skords-01/Sergeant/pull/1680)

- Mirror PR #028 (fizruk dual-write) і PR #032 (nutrition dual-write)
  для finyk. Feature flag `feature.finyk.sqlite_v2.dual_write`,
  default off, experimental.
- **Scope.** Кожен write у Finyk LS-blob-и (15 cloud-sync ключів окрім
  Mono-кешів — діло PR #038) додатково мирорить у локальну SQLite.
  Reads ще беруться з LS — це чистий shadow-write для validation.
- **Реалізовано (web).** `apps/web/src/modules/finyk/lib/dualWrite/`:
  `diff.ts` рахує `FinykDualWriteOp[]` з `prev → next` snapshot-у per
  storage-key (composite діff: kept/added/removed для list-shape ключів,
  upsert/delete для map-shape, set-replace для prefs). `adapter.ts`
  — async best-effort upsert у відповідні `finyk_*` таблиці з
  LWW-guardом на `updated_at`. `index.ts` — orchestrator з
  registration-pattern-ом (gating через
  `feature.finyk.sqlite_v2.dual_write`, fail-soft на no-userId /
  sqlite-unavailable). `extract.ts` — пара мапперів LS-shape →
  diff-state. `dualWriteBoot.ts` + `useFinykDualWriteBoot()` —
  boot-wiring (mirror nutrition). `useFinykDualWriteSync()` —
  per-`useFinykStorageSlots`-render snapshot diff trigger; шлях
  включається тільки коли flag і userId відомі.
- **Реалізовано (mobile).** `apps/mobile/src/modules/finyk/lib/dualWrite/`
  diff/adapter/index/extract з тим самим shape-ом. Boot-hook
  `useFinykDualWriteBoot` встановлюється у `FinykApp.tsx`.
  `assetsStore.ts`, `budgetsStore.ts`, `transactionsStore.ts`
  додатково викликають `triggerFinykDualWrite(prev, next)` після
  `safeWriteLS` per-key (через `stateWithSlice` helper для
  ізольованого diff-у — інші ключі лишаються `EMPTY_FINYK_STATE` і
  не випльовують операцій).
- **Реєстрація.** Через registration-pattern як у routine / fizruk /
  nutrition. `bootFinykDualWrite()` + `registerFinykDualWriteContext()`
  у `lib/dualWriteBoot.ts` встановлюється з `useFinykDualWriteBoot`
  у `FinykApp.tsx` (web + mobile).
- **Не входить.** Outbox / `/v2/sync/push` для `finyk_*` (server
  apply-fns ландять у PR #035). Reads з SQLite — PR #037.
- **Dep.** PR #035 (schema + client migration runner).

##### **PR #037 — `feat(finyk-domain): cut-over reads to SQLite under feature flag`** ✅ LANDED (`c89870c6`)

- Mirror PR #029 + PR #029a (web + mobile fizruk read overlay) і
  PR #033 (nutrition read overlay) для finyk. Feature flag
  `feature.finyk.sqlite_v2.read_sqlite`, default off. LS/MMKV-write
  залишається safety net.
- **Реалізувати (web).** `apps/web/src/modules/finyk/lib/sqliteReader.ts`
  — кеш `SqliteFinykCache` з усіма 13+ доменами, `refreshFinykSqliteState(client, userId)`
  запитує всі finyk-таблиці, фільтрує `deleted_at IS NULL`,
  трансформує рядки у domain типи з `useStorage.types.ts`,
  будує nested maps (txId → category, txId → splits, txId → debt_ids).
  `sqliteReadBoot.ts` — idempotent boot з перевіркою feature flag,
  запуском міграцій через `migrateFinyk(client)`, початковим refresh
  кешу. `sqliteReadGate.ts` — pub-sub нотифікація через
  `useSyncExternalStore`.
- **Реалізувати (mobile).** `apps/mobile/src/modules/finyk/lib/`
  паритет shape-а кешу і refresh logic. Combined hook
  `useFinykSqliteReadGate()` що повертає `{ enabled, tick }`.
- **UI overlay.** Wiring у існуючі finyk хуки (`useStorage`,
  `useBudgets`, `useNetworthHistory`, `useSubscriptions`, …) під
  flag — read від SQLite-кешу під feature flag, LS-fallback як
  перша paint synchronous-fallback. Tab-flip під flag для
  Budgets / Subscriptions / Assets / Debts / Receivables / Networth
  сторінок.
- **Feature flag реєстрація** `feature.finyk.sqlite_v2.read_sqlite`
  у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
- **Не входить.** Mono client-side mirror (PR #038). Drop
  `module_data.finyk` (PR #039).
- **Dep.** PR #036 (dual-write).

##### **PR #038 — `feat(finyk-domain): client-side Mono cache mirror in SQLite`** ✅ LANDED — [#1702](https://github.com/Skords-01/Sergeant/pull/1702)

> **Чому окрема PR.** На відміну від інших finyk-доменів (user-edited),
> Mono кеші — реплікація **зовнішнього** API source-of-truth.
> `FINYK_TX_CACHE` (тисячі транзакцій), `FINYK_INFO_CACHE` (rate-limited
> Mono accounts/clientInfo), `FINYK_TX_CACHE_LAST_GOOD` (fallback
> snapshot) — потребують іншого refresh-cycle (Mono API + webhook +
> AI-enrichment) ніж user-edited blob-и. Тому виділяю в окрему PR
> щоб не ламати dual-write шаблон.

- **Scope.** Перенести три Mono-кеші у per-row SQLite-таблиці
  `finyk_mono_transactions`, `finyk_mono_accounts`,
  `finyk_mono_account_snapshots` (з `account_id`, `tx_id`, `imported_at`
  колонками для пагінації / refresh-cycle). Mirror на PG не потрібен
  — Mono API server-side вже джерело.
- **Реалізувати.** `apps/{web,mobile}/src/modules/finyk/lib/monoMirror/`
  — refresh helper що пише у SQLite на кожен Mono `/personal/statement`
  fetch (як зараз пише у LS), upsert по `tx_id` з LWW (Mono `time` field).
  Reads — overlay у `useMonobank` під фічфлаґом
  `feature.finyk.sqlite_v2.mono_mirror`. LS-write залишається
  safety net під час experiment.
- **Не входить.** PG-mirror Mono транзакцій (server-side вже має
  Mono integration через `apps/server/src/modules/finyk/`); op-log push
  для Mono-кешів — НЕ потрібен, кожен клієнт refresh-ить локально
  з API.
- **Dep.** PR #035 (schema pattern), PR #036 (dual-write
  registration-pattern як референс).

##### **PR #039 — `chore(shared): drop module_data.finyk cloud-sync wiring + ESLint guard`** ✅ DONE — landed [#1711](https://github.com/Skords-01/Sergeant/pull/1711) (2026-05-04)

- Mirror PR #030 (fizruk cloud-sync drop) і PR #034 (nutrition
  cloud-sync drop). Знімає `finyk` з `SYNC_MODULES`
  (`packages/shared/src/sync/modules.ts`), прибирає 19 `FINYK_*`
  ентрі з `eslint-plugin-sergeant-design` tracked sets
  (`TRACKED_STORAGE_KEY_NAMES` + `TRACKED_STORAGE_KEY_VALUES`),
  додає `no-restricted-syntax` guard у `eslint.config.js` з селектором
  `MemberExpression[STORAGE_KEYS.FINYK_(?:HIDDEN|HIDDEN_TXS|BUDGETS|SUBS|ASSETS|DEBTS|RECV|MONTHLY_PLAN|TX_CATS|TX_SPLITS|MONO_DEBT_LINKED|NETWORTH_HISTORY|CUSTOM_CATS|MANUAL_EXPENSES|TX_FILTERS|SHOW_BALANCE|TX_CACHE|TX_CACHE_LAST_GOOD|INFO_CACHE)]`.
  Carve-outs повторюють fizruk-/nutrition-патерн (test files,
  module wrappers, cross-module insights). Server-side
  `DELETE FROM module_data WHERE module='finyk'` — окремий
  runbook ops PR.
- **Deploy gate.** Як і PR #030 / PR #034: розкатувати тільки
  після 100% rollout `feature.finyk.sqlite_v2.{dual_write,read_sqlite,mono_mirror}`
  - server backfill `module_data.finyk` → відповідні `finyk_*` per-user.
- **Dep.** PR #036 (dual-write у проді), PR #037 (read overlay у
  проді), PR #038 (Mono mirror у проді).

---

### Stage 5 — Sync engine v2 hardening

> **2026-05-06 implementation note.** The remaining writer-wiring slice landed
> in [#1953](https://github.com/Skords-01/Sergeant/pull/1953) (`feat(web): wire sync engine writer runtime`):
> web boot (`apps/web/src/main.tsx` → `apps/web/src/core/syncEngine/{singleton,syncEngineWriter}.ts`)
> composes `createSyncEnginePushScheduler` + `createSyncEngineFlushOnReconnect`
> із `@sergeant/api-client` поверх `drainSyncOpOutbox` / `mark*` / `recoverDeadLetter`
> із `@sergeant/db-schema/sqlite`, проводить tick/flush у Sentry breadcrumbs,
> опційно показує dead-letter count в `OfflineBanner` + retry-action через
> `useSyncStatus`. Stage 7 cleanup лишається ⏳ blocked до завершення burn-in
> у проді.
>
> **2026-05-06 mobile parity note.** Mobile boot отримав той самий
> writer-runtime: `apps/mobile/src/core/syncEngine/{syncEngineWriter,singleton,netInfoEventTarget}.ts`
> композує ту саму `@sergeant/api-client` пару scheduler+reconnect поверх
> того ж `@sergeant/db-schema/sqlite` outbox-API, але читає міграційний
> handle через `getSqliteMigrationClient()` (expo-sqlite) і слухає
> reconnect через NetInfo-bridge (`createNetInfoEventTarget`) із
> `kind: 'online'` — RN не має `document.visibilityState`, тому
> visibility-гілка вебу там завжди була б no-op-ом.
> `bootSyncEngineWriter({ captureException: captureError })` викликається
> у `apps/mobile/app/_layout.tsx` після того, як `bootstrapEncryptedStorage`
> завершився і `setStorageReady(true)` зняв splash-screen-gate. Status-surface
> (`apps/mobile/src/sync/hook/useSyncStatus.ts`) бридж-ить `runtime.getStatus()`
> на існуючий shape `{queuedCount, dirtyCount, isOnline}`, який споживає
> `SyncStatusIndicator`/`SyncStatusOverlay`. Stage 7 mobile-cleanup
> (`useCloudSync` stub-shim, `CloudSyncProvider`) лишається ⏳ — burn-in
> після writer-runtime-boot, потім deprecate і видалити.

#### **PR #040 — `feat(migrations): persistent op-log retry policy in SQLite`** ✅ LANDED — [#1717](https://github.com/Skords-01/Sergeant/pull/1717)

- Scope. Outbox `sync_op_outbox` отримав durable retry-контракт: нові
  колонки `attempts INTEGER DEFAULT 0`, `next_retry_at TEXT`,
  `last_error TEXT` плюс розширений `status` enum із `'dead_letter'`.
  Worker-helper-и (`computeBackoffMs`, `computeNextRetryAt`,
  `nextStatusForRetry`, `planRetry`) живуть у
  `packages/db-schema/src/sqlite/syncOpRetry.ts`.
- Backoff. Exponential 1s → 2s → 4s → … capped at 5min, ±250ms jitter,
  dead-letter після `SYNC_OP_MAX_ATTEMPTS = 10` спроб.
- Migration. Client-side `002_sync_op_outbox_retry.sql` (SQLite "12-step
  ALTER" — `rename → create new with relaxed CHECK → copy → drop →
recreate indexes`) у `packages/db-schema/src/sqlite/migrations/index.ts`,
  бо CHECK constraint у SQLite неможливо relax-нути in-place.
- AC. Crash recovery: kill app → restart → outbox row-и з минулого
  ретри-recover-яться без дубліфікацій (idempotency key зберігається),
  а перманентно-truncated op-и переходять у `dead_letter` для
  оператор-перевірки замість silent-loop-у.

#### **PR #041 — `feat(server): real-time pull via Server-Sent Events`** ✅ LANDED — [#1721](https://github.com/Skords-01/Sergeant/pull/1721)

- Scope. `GET /api/v2/sync/stream` — SSE-канал, який фен-аутить
  applied-ops іншим пристроям того ж юзера в режимі реального часу.
  Eliminates polling-loop проти `/pull?since=`.
- Wire-format. `event: hello` із `since` cursor-ом і `replay_limit`,
  потім backlog replay (cap `SYNC_V2_STREAM_REPLAY_LIMIT = 500`,
  `truncated:true` каже клієнту: реконектся з оновленим cursor-ом),
  далі `event: caught_up` і live `event: op` фрейми.
- Reconnect. `?since=<id>` query **АБО** заголовок `Last-Event-ID` на
  auto-reconnect — header виграє при колізії, бо це resume-сценарій
  (override над bookmark-ом, який клієнт міг сам сконструювати).
- Heartbeat. SSE-comment `: heartbeat\n\n` кожні
  `SYNC_V2_STREAM_HEARTBEAT_MS = 25_000` ms — під типовий 30s
  idle-таймаут reverse-проксі (Vercel/Cloudflare/nginx default).
- Fan-out. In-process `opLogEmitter` (per-user канал); `syncV2Push`
  тригерить `notifySyncV2OpsApplied(userId, applied)` **після**
  `COMMIT`-у. Failed-COMMIT-шлях сюди не доходить — listener-и
  бачать лише durable зміни.
- Operational. Окремий rate-limit `api:v2:sync:stream` — 30/min, не
  ділиться з push/pull-budget-ом; новий gauge
  `sync_stream_connections_active{module='v2'}` для Grafana.
- Single-process замітка. Емітер in-memory; multi-instance деплой
  потребуватиме PG `LISTEN/NOTIFY` чи Redis pub/sub (PR #045/#050).
  Railway Sergeant-а зараз single-instance, тому fan-out тривіальний.
- AC. Multi-tab/multi-device handler-level тест проходить (12 тестів
  у `syncV2Stream.handler.test.ts` із `vi.fakeTimers()`); E2E з
  реальним Postgres — follow-up в `syncV2.integration.test.ts`.

#### **PR #042 — `feat(sync): per-row CRDT for routine_entries (PN-counter for streak)`** — split into PR #042a + PR #042b + PR #042c

- Scope. `routine_streaks.current_streak` стає PN-counter (positive/negative
  counter), не просто Int. Конкурентний toggle з двох девайсів дає коректний
  стрик.
- **Status (2026-05-04).** Доставлено трифазно (див. підрозділи нижче).
  Початкова деферал-причина — pure-server PN-counter потребував
  протокольної зміни (новий op kind `increment` із `delta`-payload-ом
  у `sync_op_log` CHECK constraint + `SyncV2OpKindEnum`) — закрита
  PR #042a; apply-fn-семантика для `routine_streaks` — закрита PR #042b;
  client-side typed envelope-builder, дзеркалить серверну validation —
  закрита PR #042c. Server-side derivation streak-status-у з
  `Habit.schedule` лишається поза скоупом серії (LS-блоб міграція —
  окрема ініціатива).

#### **PR #042a — `feat(server): protocol scaffolding for op='increment'`** ✅ LANDED ([#1769](https://github.com/Skords-01/Sergeant/pull/1769))

- Scope. Protocol-only scaffolding для PN-counter: розширений
  `sync_op_log.op` CHECK constraint (додано `'increment'`), оновлений
  `SyncV2OpKindEnum` zod-схеми та engine-level gate, який реджектить
  усі `op='increment'` із `reason='op_not_supported'`, поки apply-fn-и
  не заопт-іняться. Per-table allowlist `INCREMENT_OP_SUPPORTED_TABLES`
  заводиться порожнім — кожна нова таблиця додається свідомо.
- **Done.** Протокол-зміна merge-нута без runtime-effect-у; client-i,
  які надсилатимуть `op='increment'` до non-allowlisted таблиці,
  отримують детермінований reject (а не silent-drop). Migration
  forward-compatible: старі сервери, які не знають `'increment'`,
  падають на CHECK violation, що ловиться у sync-error-budget.
- **Dep.** None (готує ґрунт для PR #042b).

#### **PR #042b — `feat(server): PN-counter apply-fn for routine_streaks (op='increment')`** ✅ LANDED ([#1776](https://github.com/Skords-01/Sergeant/pull/1776))

- Scope. `applyRoutineStreaks` опт-іняється у `INCREMENT_OP_SUPPORTED_TABLES`
  і отримує атомарний UPDATE-шлях для `op='increment'`:
  `UPDATE routine_streaks SET current_streak = GREATEST(0, current_streak + delta), longest_streak = GREATEST(longest_streak, GREATEST(0, current_streak + delta)) WHERE …`.
  PN-counter-семантика: increments комутативні + ідемпотентні per
  `(idempotency_key)`, тому LWW-guard на цій гілці навмисно вимкнено
  (`AND op <> 'increment'` у LWW-SELECT-і).
- **Done (2026-05-04).** Two-stage delta validation у apply-fn-у:
  presence (`missing_delta`) + type/finiteness/integrality/magnitude
  bound `|delta| ≤ 1000` (`invalid_delta`, collapsed reason — non-finite,
  non-integer і out-of-range зливаються у одну причину, тому cardinality
  budget `sync_op_log_apply_total{reason}` не зростає). `GREATEST(0, …)`
  clamping не дає `current_streak` піти у мінус навіть при наївних
  decrement-batch-ах; `longest_streak` оновлюється monotonically лише
  коли новий `current_streak` його перевищує. 6 нових інтеграційних
  тестів у `syncV2.integration.test.ts`: concurrent increment-merge,
  clamp-at-zero, monotonic longest, missing/invalid delta reject-paths.
  Locally green: typecheck + lint + sync test-suite.
- **Risk.** Low — PN-counter scope обмежений однією таблицею;
  client-side dual-write outbox-адаптер ще не написано (це окрема
  PR серії), тому live-traffic-у на цій гілці поки нема — net change
  у production нульовий до моменту client-rollout-у.
- **Dep.** PR #042a.

#### **PR #042c — `feat(api-client): typed buildSyncV2IncrementOp helper for PN-counter`** ✅ LANDED ([#1787](https://github.com/Skords-01/Sergeant/pull/1787))

- Scope. Client-side typed envelope-builder для `op='increment'`
  push-ops у `packages/api-client/src/endpoints/syncV2.increment.ts`,
  що дзеркалить серверні validation-rule-и з PR #042a (engine-gate)
  - PR #042b (`applyRoutineStreaks` apply-fn). Public surface api-client-у:
    `INCREMENT_OP_SUPPORTED_TABLES` (literal-tuple `["routine_streaks"]`),
    `IncrementOpTable`, `INCREMENT_DELTA_MAX_ABS` (1000),
    `isIncrementOpSupported(table)` type-guard,
    `buildSyncV2IncrementOp(input)` Result-discriminated builder
    (`{ ok: true, op } | { ok: false, reason }`).
- **Done (2026-05-04).** `buildSyncV2IncrementOp` ніколи не throw-ить;
  reject-причини — bit-for-bit ті самі string-літерали, що сервер пише
  у `sync_op_log_apply_total{reason}`: `op_not_supported` /
  `missing_delta` / `invalid_delta`. Early-exit ordering замикає
  серверну послідовність (allowlist-check ПЕРЕД delta-validation,
  щоб caller із `delta=NaN, table=invalid` отримував той самий
  `op_not_supported`, що серверний engine-gate спрацював би до
  SAVEPOINT-у apply-fn-у). 25 нових unit-тестів у
  `syncV2.increment.test.ts`: happy-path (delta=0/+1/-1/±MAX_ABS,
  extraRow merge ordering), всі reject-branches (NaN / Infinity /
  -Infinity / 1.5 / MAX_SAFE_INTEGER / runtime-string cast /
  null / undefined / not-allowlisted-table / empty-string-table),
  regression-locks на allowlist length (1) і magnitude bound (1000),
  early-exit ordering tripwires. Locally: typecheck + lint + 82/82
  api-client тестів зелені.
- **Risk.** None — public surface без callsite-ів. Перший consumer —
  client-side push-loop refactor: `enqueueOutboxIncrement` helper
  приземлений у PR #042d-builder ([#1810](https://github.com/Skords-01/Sergeant/pull/1810)),
  адаптер `mapSyncV2IncrementOpToOutboxInput` між envelope-shape-ом
  цього builder-а і db-schema enqueue-input-ом — у PR #042e-mapping
  ([#TBD](https://github.com/Skords-01/Sergeant/pulls)),
  інтеграція в реальний sync-engine writer лишається для PR #042e.
- **Dep.** PR #042a (engine-gate reasons), PR #042b (apply-fn allowlist
  - magnitude bound).

#### **PR #042d-prep — `feat(db-schema): admit op='increment' in client-side sync_op_outbox CHECK`** ✅ LANDED ([#1804](https://github.com/Skords-01/Sergeant/pull/1804))

- Scope. Підготовче розширення SQLite-схеми `sync_op_outbox` так,
  щоб PN-counter `op='increment'` envelope-и (PR #042c builder)
  могли durably сидіти в клієнтському outbox поряд із LWW write-ами.
  Bundled-міграція `003_sync_op_outbox_increment_op.sql` у
  `packages/db-schema/src/sqlite/migrations/index.ts` + розширений
  `SYNC_OP_OUTBOX_OPS` `as const`-tuple у `routine.ts`.
- **Done (2026-05-04).** SQLite не вміє релаксувати `CHECK` in-place,
  тому міграція повторює "12-step ALTER" recipe із
  `002_sync_op_outbox_retry.sql` (PR #040): RENAME → CREATE з релаксованим
  `CHECK (op IN ('insert','update','delete','increment'))` → INSERT…SELECT
  всі колонки verbatim → DROP легасі-таблицю → CREATE 3 індекси, які
  втратили посилання після RENAME (`sync_op_outbox_idem_uniq_lite`,
  `sync_op_outbox_pending_idx_lite`, `sync_op_outbox_pending_due_idx_lite`).
  Виконується всередині per-migration `BEGIN/COMMIT` із
  `applyMigration` — partial failure залишає SPIKE-shape незачепленою.
  Snapshot-тест у `sqlite-routine-snapshot.test.ts` пінить tuple-shape
  `SYNC_OP_OUTBOX_OPS` byte-for-byte; integration-тест у
  `sqlite-routine-spike-migrations.test.ts` ганяє повний SPIKE+#040+#042d-prep
  стек проти `:memory:` engine-у і round-trip-ить `op='increment'` ряд.
- **Risk.** Low — лише розширює CHECK allowlist; всі існуючі ряди
  лишаються валідними. Pre-existing CI failures на main
  (duplicate migration 041 від #1784/#1786 + lockfile drift від #1795)
  розблоковані окремими PR-ами #1805/#1806 і не повʼязані з цим PR-ом.
- **Dep.** PR #040 (12-step ALTER рецепт + retry-state колонки), PR #042a
  (серверне `'increment'` literal-перше landing).

#### **PR #042d-builder — `feat(db-schema): add enqueueOutboxIncrement outbox writer`** ✅ LANDED ([#1810](https://github.com/Skords-01/Sergeant/pull/1810))

- Scope. Durable enqueue-хелпер для PN-counter `op='increment'`
  envelope-ів у клієнтський `sync_op_outbox`. Pair-ить із
  `buildSyncV2IncrementOp` (api-client, PR #042c) — caller-и, які
  мають validated envelope, flatten-ять його у `OutboxIncrementInput`
  і викликають хелпер для durable-write-у.
- **Done (2026-05-05).** `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts`
  експортує `enqueueOutboxIncrement(client, input)` →
  `Promise<{ ok: true, id, inserted }>`. Idempotency-логіка:
  pre-check `SELECT … WHERE idempotency_key = ?` shorts-circuits на
  steady-state replay-ах (один SELECT, нуль INSERT-ів); fresh-key
  path виконує `INSERT OR IGNORE` як defence-in-depth проти race-у
  з паралельним адаптером, потім post-check `SELECT` резолвить
  surviving id. Ніколи не throw-ить на UNIQUE-collision; surfaces
  unrelated SQL-помилки (e.g. dropped table) verbatim щоб higher-level
  engine міг dead-letter-ити. `op='increment'` пишеться літерально —
  caller не може override-нути; `status='pending'`, `attempts=0`,
  `next_retry_at=NULL`, `last_error=NULL`, `created_at` беруться
  зі schema-defaults — retry-state колонки належать `planRetry`
  і пінить це окремий regression-тест. 6 нових integration-тестів
  у `sqlite-syncOpOutboxEnqueue.test.ts` ганяють повний SPIKE+#040+#042d-prep
  migration stack-ом проти `:memory:` engine-у: happy-path (всі 11 stored
  колонок pinned byte-for-byte), replay із different payload (existing
  id, payload не stomped), distinct keys із monotonic id-ами, nested
  payload JSON round-trip verbatim (no key sorting), retry-state
  preservation на same-key replay, schema-corruption error propagation.
- **Risk.** Low — `db-schema` package без runtime-callsite-ів поза
  unit/integration тестами; перший production-consumer буде
  client-side push-loop refactor (PR #042e), який зашиє хелпер
  у sync-engine writer. Регресія-тест в api-client
  (`syncV2.increment.outboxEnqueue.test.ts`), що пінить
  `OutboxIncrementInput` ↔ `SyncV2PushOp` field-name mapping byte-aligned,
  залендив у PR #042e-mapping ([#1827](https://github.com/Skords-01/Sergeant/pull/1827))
  (db-schema deliberately НЕ depend-ить на api-client).
- **Dep.** PR #042c (typed envelope-builder, надає поля які хелпер flatten-ить),
  PR #042d-prep (CHECK-relaxation, без якого INSERT із `op='increment'`
  silently-rejected SPIKE-era constraint-ом).

#### **PR #042e-mapping — `feat(api-client): mapSyncV2IncrementOpToOutboxInput adapter + drift-tripwire test`** ✅ LANDED ([#1827](https://github.com/Skords-01/Sergeant/pull/1827))

- Scope. Маленький адаптер між api-client envelope-shape-ом
  (`SyncV2PushOp` із `op='increment'`, що його будує
  `buildSyncV2IncrementOp` із PR #042c) і db-schema enqueue-input-shape-ом
  (`OutboxIncrementInput`, що його споживає `enqueueOutboxIncrement` із
  PR #042d-builder). Розводить snake_case ↔ camelCase у одному місці на
  consumer-side (api-client), щоб db-schema лишалося unaware-ним про
  api-client (по PR #042d-builder Risk note). Pин-аутом drift-у поверх
  адаптера стоїть регресія-тест, який тримає field-shape-и обох сторін
  byte-aligned, інакше CI ловить розкол ще до того, як він сяде в
  push-loop refactor PR #042e.
- **Done (2026-05-05).** `packages/api-client/src/endpoints/syncV2.increment.outboxEnqueue.ts`
  експортує:
  - `SyncV2IncrementPushOp` — `SyncV2PushOp & { op: 'increment' }` narrow-alias.
  - `OutboxIncrementInputShape` — структурний mirror `OutboxIncrementInput`
    із db-schema (mirror-imо, а не workspace-deр-аємо, щоб api-client не
    ріс залежність на db-schema задля одної мапи; mirror тримаємо
    byte-aligned cross-file-через тест-tripwire).
  - `mapSyncV2IncrementOpToOutboxInput(op)` — sync-функція, що повертає
    `{ table, row, clientTs, idempotencyKey }`, **без** `op`-літералу
    (`enqueueOutboxIncrement` пише `'increment'` сам, тому threading його
    був би double-source-of-truth-ом). `row` пробрасується тим самим
    референсом — verbatim-гарантія мапиться на db-schema-контракт
    "no key sorting, no copy". Runtime-guard: throw-имо синхронно, якщо
    caller-cast-ом проштовхнув не-`increment` envelope.
  - `packages/api-client/src/endpoints/syncV2.increment.outboxEnqueue.test.ts`:
    7 тестів (happy-path snake→camel, 4-key Object.keys lock, row
    pass-through verbatim з insertion-order та nested-key preservation,
    boundary delta=±1000, два runtime-assertion-кейси на `update`/`insert`
    spoof, two-way structural assignability OutboxIncrementInputShape ↔
    db-schema-mirror-інтерфейс, end-to-end pipeline `buildSyncV2IncrementOp`
    → mapper → db-schema-shape).
  - Re-export із `packages/api-client/src/index.ts`:
    `mapSyncV2IncrementOpToOutboxInput`, `OutboxIncrementInputShape`,
    `SyncV2IncrementPushOp`.
  - Locally: typecheck + lint + 90/90 api-client тестів зелені.
- **Risk.** None — additive public surface без callsite-ів за межами
  тестів. Drift-tripwire-механізм тримає mirror-shape узгодженим із
  db-schema-original-ом cross-file-через test-equality + structural
  assignability. Якщо в `OutboxIncrementInput` (db-schema) додають нове
  required-поле або перейменовують існуюче — або тест провалюється на
  `Object.keys`-lock-у, або на структурній несумісності типу. Перший
  production-consumer цього адаптера — sync-engine writer у PR #042e
  (push-loop refactor), який зчитує payload із dual-write-адаптера,
  будує envelope `buildSyncV2IncrementOp`-ом, плоскує його через цей
  mapper і durably-write-ить через `enqueueOutboxIncrement`.
- **Dep.** PR #042c (`buildSyncV2IncrementOp` — будує envelope, який
  адаптер плоскує), PR #042d-builder (`enqueueOutboxIncrement` —
  consumer ouput-у адаптера; його `OutboxIncrementInput`-shape — mirror-target).

#### **PR #042e-submit — `feat(api-client): submitSyncV2IncrementOp composable build → map → enqueue helper`** ✅ LANDED

- Scope. Composable consumer-side хелпер, який зв'язує три вже-залендженi
  компоненти у одну функцію: `buildSyncV2IncrementOp` (PR #042c),
  `mapSyncV2IncrementOpToOutboxInput` (PR #042e-mapping) і
  ін'єкційну `submit`-функцію (структурно-mirror-нуту з
  `enqueueOutboxIncrement` із PR #042d-builder). Ціль — мати одну
  three-step API-поверхню для майбутнього sync-engine writer-а у
  power-PR #042e (push-loop refactor), щоб callsite-и зводилися до
  одного виклику замість трьох-шарової композиції.
- **Done (2026-05-05).** `packages/api-client/src/endpoints/syncV2.increment.submit.ts`
  експортує:
  - `submitSyncV2IncrementOp(submit, input)` — async-функція, що повертає
    discriminated-union `{ ok: true, id, inserted } | { ok: false, reason }`.
    Build-side reject-и (`op_not_supported` / `missing_delta` /
    `invalid_delta`) короткозамикаються — `submit` НЕ викликається,
    жодного outbox-row для envelope-у, який сервер однаково реджектить
    engine-level. На happy-path `inserted: false` (idempotent replay,
    знайдено existing row під тим же `idempotencyKey`) пробрасується
    verbatim — replay-safety-контракт від `enqueueOutboxIncrement`
    тримається 1:1.
  - `SubmitSyncV2IncrementOpFn` — DI-функція-shape, що структурно
    mirror-ить `enqueueOutboxIncrement` (приймає `OutboxIncrementInputShape`,
    повертає `Promise<{ id, inserted }>`). Inversion-of-control патерн
    тримає api-client / db-schema незалежними один від одного — adapter
    на consumer-side у app-коді — це one-liner.
  - `SubmitSyncV2IncrementOpResult`, `SubmitSyncV2IncrementOpEnqueued`,
    `SubmitSyncV2IncrementOpRejected` — окремі типи для callsite-ів,
    що narrow-ять на `result.ok`.
  - `packages/api-client/src/endpoints/syncV2.increment.submit.test.ts`:
    12 тестів (4 happy-path кейси з byte-aligned camelCase mapping і
    insertion-order пресервом + boundary delta=−1000; 6 reject-route
    кейсів — `op_not_supported`, `missing_delta` × 2 для null/undefined,
    `invalid_delta` × 3 для non-finite/non-integer/out-of-bound; storage
    error pass-through; cardinality-lock на 3 reject-reason-літерали).
  - Re-export із `packages/api-client/src/index.ts`:
    `submitSyncV2IncrementOp`, `SubmitSyncV2IncrementOpFn`,
    `SubmitSyncV2IncrementOpResult`, `SubmitSyncV2IncrementOpEnqueued`,
    `SubmitSyncV2IncrementOpRejected`.
  - Locally: typecheck + lint + 102/102 api-client тестів зелені.
- **Risk.** None — additive public surface без callsite-ів за межами
  тестів. Storage-layer error-и (`submit` throw-ить) пробрасуються
  callerу, не конвертуються у reject-reason — це тримає cardinality
  `sync_op_outbox_reject_total{reason}` обмеженою трьома build-reason-ами
  з PR #042c. Перший production-consumer — sync-engine writer у
  full-scope PR #042e (push-loop refactor): зчитає payload із
  dual-write-адаптера, передасть `BuildSyncV2IncrementOpInput` у helper,
  ін'єктить `(input) => enqueueOutboxIncrement(sqliteClient, input)`
  як `submit`.
- **Dep.** PR #042c, PR #042d-builder (mirror-target для `submit`-shape),
  PR #042e-mapping (mapper, який helper викликає внутрішньо).

#### **PR #042e-drain — `feat(db-schema): drainSyncOpOutbox reader for client push-loop`** ✅ LANDED ([#1913](https://github.com/Skords-01/Sergeant/pull/1913))

- Scope. Pure SQLite-side reader для майбутнього sync-engine writer-а
  (другий із трьох client-side push-loop primitive-ів, які roadmap
  прямо називає: enqueue → drain → push). Тягне з `sync_op_outbox`
  пендінг-рядки, які due (`status='pending' AND (next_retry_at IS NULL
OR next_retry_at <= ?)`) у insertion-order (`id ASC`), з
  конфігурованим `limit`. Сидить на partial-index-i
  `sync_op_outbox_pending_due_idx_lite` (інстальованому PR #040,
  збереженому через PR #042d-prep). Дзеркало-pair до
  `enqueueOutboxIncrement` із PR #042d-builder на write-side; повертає
  flat camelCase shape, який мапиться у `SyncV2PushOp` (mapping —
  окремим follow-up-ом, але `SyncOpOutboxOp` уже narrow-овано по
  тому самому tuple-у `'insert'|'update'|'delete'|'increment'` із
  `routine.ts`).
- **Done (2026-05-05).** `packages/db-schema/src/sqlite/syncOpOutboxDrain.ts`
  експортує:
  - `drainSyncOpOutbox(client, options): Promise<DrainedOutboxRow[]>`
    — read-only async-функція. Жодних UPDATE/DELETE/transactions;
    lifecycle row-а (success → DELETE, transient → `planRetry`,
    terminal → `status='rejected'`) — це робота sync-engine writer-а,
    не reader-а. Boundary-inclusive на `next_retry_at = now`
    (`<=`, не `<`) щоб уникнути off-by-one stalls на exact-clock
    edge-cases. Non-positive / non-finite `limit` (0, від'ємні,
    `NaN`, `+Infinity`) → `[]` без SELECT — short-circuit перед
    DB-touch (доведено drop-table тестом).
  - `DrainSyncOpOutboxOptions` — `{ limit, now }`. `now` — `Date`,
    pure-DI clock (тести pin-ять детермінованим timestamp-ом;
    production passes `new Date()`).
  - `DrainedOutboxRow` — flat camelCase: `id`, `table`, `op`, `row`,
    `clientTs`, `idempotencyKey`, `attempts`, `nextRetryAt`,
    `lastError`, `createdAt`. `op` narrow-овано до
    `SyncOpOutboxOp = 'insert'|'update'|'delete'|'increment'` із
    cardinality-lock-тестом. `row` парситься у
    `Readonly<Record<string, unknown>>`; unparseable JSON / non-object
    payload / op outside `SYNC_OP_OUTBOX_OPS` → fatal throw з
    offending `id` (loud-failures stance із PR #040 / PR #042d-builder).
  - `packages/db-schema/src/__tests__/sqlite-drainSyncOpOutbox.test.ts`:
    15 тестів (4 групи): ordering and selection (4 — id-ASC, пропуск
    `'rejected'`/`'dead_letter'`, NULL+due рядки разом, `> now`
    пропускаються, boundary-inclusive на `= now`); limit (3 — cap зі
    збереженням id-ASC, non-positive/non-finite → `[]` без SELECT,
    fractional floor); shape (2 — flat camelCase із row JSON-parsed
    і op-narrowed; legacy LWW `'delete'` round-trip-ить verbatim
    drift-tripwire-ом); invariant violations (5 — unparseable JSON /
    array / null payload / op outside tuple / DROP TABLE
    pass-through); cardinality lock (1 — pin-ить `SYNC_OP_OUTBOX_OPS`
    tuple `['insert','update','delete','increment']`).
  - Re-export із `packages/db-schema/src/sqlite/index.ts`:
    `drainSyncOpOutbox`, `DrainSyncOpOutboxOptions`, `DrainedOutboxRow`.
  - Locally: 302/302 db-schema тестів зелені (15 нових + 287
    існуючих), typecheck чистий, lint чистий, 102/102 api-client
    suite зелена (downstream consumer не зламано).
- **Risk.** None — additive public surface без callsite-ів за межами
  тестів. Storage-layer error-и (порожня / corrupt SQLite) пробрасуються
  callerу як throw-и, не конвертуються у silent-skip. Перший
  production-consumer — sync-engine writer у full-scope PR #042e
  (push-loop refactor): зчитає due-batch через `drainSyncOpOutbox`,
  замапить кожен row у `SyncV2PushOp`, відправить у `/api/v2/sync/push`,
  ack-ить успіх через DELETE, transient-fail-и пройдуть через `planRetry`.
- **Dep.** PR #022 (SPIKE outbox shape), PR #040 (retry columns +
  `pending_due_idx`), PR #042a (server engine-gate на `'increment'`),
  PR #042d-prep (CHECK relaxation на `'increment'`), PR #042d-builder
  (`enqueueOutboxIncrement` mirror-target на write side), PR #042e-submit
  (composable submit helper що pairs with цим reader-ом).

#### **PR #042e-lifecycle — `feat(db-schema): syncOpOutboxLifecycle helpers (markSuccess / markRetry / markRejected)`** ✅ LANDED ([#1922](https://github.com/Skords-01/Sergeant/pull/1922))

- Scope. Write-side дзеркало до PR #042e-drain: три SQL-helper-и які
  закривають outbox-row lifecycle після server ack-у. `markOutboxSuccess`
  (DELETE по `id`, idempotent на missing row), `markOutboxRetry` (UPDATE
  `attempts`/`status`/`next_retry_at`/`last_error` із готового
  `SyncOpRetryPlan`, який caller рахує через `planRetry` із PR #042d-prep;
  flip на `'dead_letter'` при досягненні `MAX_ATTEMPTS` лежить у
  `planRetry`-policy, не в helper-і — single source of truth) і
  `markOutboxRejected` (UPDATE `status='rejected'` + `reject_reason`
  verbatim для термінальних reject-ів від сервера на кшталт
  `op_not_supported` / `tombstoned`). Усі три відмовляються пересувати
  не-`pending` рядки (idempotent на повторні виклики; `'rejected'` /
  `'dead_letter'` рядки лишаються термінальними доти, доки triage
  не переведе їх назад у `'pending'`).
- **Done (2026-05-05).** `packages/db-schema/src/sqlite/syncOpOutboxLifecycle.ts`
  експортує:
  - `markOutboxSuccess(client, id): Promise<void>` — DELETE по id.
  - `markOutboxRetry(client, id, plan: SyncOpRetryPlan): Promise<void>` —
    UPDATE з `WHERE status = 'pending'`-guard-ом.
  - `markOutboxRejected(client, id, reason: string): Promise<void>` —
    UPDATE з тим самим guard-ом, `reason` пишеться у
    `reject_reason` без нормалізації.
  - `packages/db-schema/src/__tests__/sqlite-syncOpOutboxLifecycle.test.ts`:
    20 тестів (4 групи): `markOutboxSuccess` — delete + sibling-isolation
    - idempotency на missing id; `markOutboxRetry` — attempts increment,
      `'dead_letter'` flip коли plan-status переходить, no-op на
      термінальних рядках, idempotency на повторний виклик; `markOutboxRejected` —
      status + reason update, no-op на термінальних рядках, idempotency;
      cross-helper invariants — DELETE-нуті / `'rejected'` / `'dead_letter'`
      рядки не можна re-engage без зовнішнього triage.
  - Re-export із `packages/db-schema/src/sqlite/index.ts`:
    `markOutboxSuccess`, `markOutboxRetry`, `markOutboxRejected`.
  - Locally: 322/322 db-schema тестів зелені (20 нових + 302 існуючих),
    typecheck чистий, lint чистий.
- **Risk.** None — additive write-side surface без callsite-ів за межами
  тестів. Перший production-consumer — sync-engine push-loop у
  PR #042e-pushloop ([#1926](https://github.com/Skords-01/Sergeant/pull/1926)),
  який заінжектить ці три функції як lifecycle-DI. Idempotency на
  термінальних рядках і missing-id-кейс роблять concurrent ticks
  (periodic timer + manual «force sync») безпечними out-of-the-box.
- **Dep.** PR #042d-prep (retry-state колонки + `pending` enum), PR #042d-builder
  (write-side enqueue дзеркало), PR #042e-drain (read-side дзеркало, який
  feeds row-id into ці lifecycle-helper-и).

#### **PR #042e-pushloop — `feat(api-client): syncV2 pushLoop orchestrator`** ✅ LANDED ([#1926](https://github.com/Skords-01/Sergeant/pull/1926))

- Scope. Composable, dependency-injected one-tick push-loop orchestrator
  у `@sergeant/api-client`, який зв'язує всі вже-залендженi блоки Stage 5
  у єдиний entry-point: `drain → map → push → lifecycle`. Pure
  orchestration; жодного SQLite або реального fetch усередині — все
  через DI, тому api-client не отримує workspace-залежності на
  db-schema (PR #042d-builder Risk note). Закриває ~80% scope-у
  оригінального PR #042e як другу з двох surgical mergeable одиниць
  (перша — PR #042e-lifecycle).
- **Done (2026-05-05).** `packages/api-client/src/endpoints/syncV2.pushLoop.ts`
  експортує:
  - `runSyncEnginePushOnce(deps, options): Promise<{drained, pushed, retried, rejected}>` —
    one-tick push-loop. Алгоритм: sample `deps.now()` один раз, передати
    у `drain({limit, now})`; якщо `drained.length === 0` — short-circuit
    із нулями (без HTTP-call-у і lifecycle-write-ів); інакше — map
    кожен row у `SyncV2PushOp` через `mapDrainedRowToSyncV2PushOp`, push
    цілий batch у `/api/v2/sync/push` через DI-`push`. На HTTP success
    мач-ити `SyncV2OpResult` із drained-row-ами по `idempotency_key`;
    `applied`/`duplicate` → `markSuccess(id)`, `rejected` → `markRejected(id, reason)`
    (fallback `'unspecified'` коли `reason` відсутній/порожній),
    forward-compat unknown status → `markRetry(planRetry(prev, now, "unknown_status:<value>"))`,
    missing result для відомого `idempotency_key` → `markRetry`
    із `last_error="missing_result"` (server-bug-tolerant: не drop-ає
    рядок). На HTTP-failure (будь-який thrown error із `deps.push`) —
    весь batch іде у `markRetry` із stable low-cardinality label
    із `describePushError` (`network` / `aborted` / `parse` /
    `http_<status>` / `unknown`). Clock pin-нутий single-source-of-truth
    на тік — однакова `now` Date threadиться у `drain` і в кожен
    `planRetry` call (deterministic у тестах, monotonic у проді).
  - `mapDrainedRowToSyncV2PushOp(row): SyncV2PushOp` — reverse
    PR #042e-mapping узагальнений на всі чотири `SyncV2OpKind`-и
    (`insert`/`update`/`delete`/`increment`). Flatten camelCase →
    snake_case без копії `row` (passed by reference).
  - `describePushError(err): string` — bucket scheme для
    `last_error` із обмеженою cardinality. `ApiError.kind=http`
    включає `status` (включно із `401`/`403` — engine трактує як
    transient, бо credentials рефрешаться out-of-band).
    `status === 0` для `kind=http` → `"http_5xx"` (бо `"http_0"`
    було б misleading).
  - DI types — структурні дзеркала db-schema-shape-ів (без
    workspace-deps, drift-tripwire у тестах):
    `DrainedOutboxRowShape`, `SyncOpRetryPlanShape`,
    `DrainSyncOpOutboxFn`, `SyncV2PushFn`, `MarkOutboxSuccessFn`,
    `MarkOutboxRetryFn`, `MarkOutboxRejectedFn`, `PlanRetryFn`,
    `SyncEnginePushDeps`, `SyncEnginePushOptions`, `SyncEnginePushResult`.
  - `packages/api-client/src/endpoints/syncV2.pushLoop.test.ts`:
    24 нові тести (8 груп): empty drain short-circuit; happy-path applied/duplicate
    із пином camelCase→snake_case shape + originDeviceId threading;
    terminal reject із `'unspecified'` fallback; whole-batch retry
    при transport failure із pin-ом кожного error bucket-у (`network`,
    `http_503`, `http_401`, unknown thrown); dead-letter plan із
    `planRetry` проходить verbatim через `markRetry` (orchestrator
    не second-guess-ить policy); mixed batch (applied + rejected +
    missing-result в одному drain-і) — кожен row хіт-ить власний helper
    рівно один раз; clock pin-инваріант (`now()` sample-нутий
    рівно один раз і threaded скрізь); `mapDrainedRowToSyncV2PushOp`
    drift-tripwire (всі 4 op-kind-и, `row` by reference, локальні
    поля `id`/`attempts`/etc. НЕ leak-аються у wire); `describePushError`
    bucket scheme exhaustive за всіма kind-ами + non-`ApiError`
    fallback-ом.
  - Re-export із `packages/api-client/src/index.ts`:
    `runSyncEnginePushOnce`, `mapDrainedRowToSyncV2PushOp`,
    `describePushError`, та всі DI-types.
  - Locally: 124/124 api-client тестів зелені (24 нові + 100 існуючих),
    typecheck чистий, lint чистий.
- **Risk.** None — additive composable surface без callsite-ів у
  production-коді. Існуючі `outboxEnqueue` / `submit` / `drain` шляхи
  не торкнуті. Wiring у sync-engine boot-path (periodic timer,
  online/offline events, push-on-enqueue flush, Sentry breadcrumbs) —
  окремий follow-up PR #042e wiring, який імпортує `runSyncEnginePushOnce`
  і pin-ить production callers (`drainSyncOpOutbox` через sqliteClient,
  `pushV2` через `createSyncV2Endpoints`, lifecycle-helper-и із
  PR #042e-lifecycle, `planRetry` із `syncOpRetry.ts`).
- **Dep.** PR #042e-drain (read-side helper, який orchestrator pulls),
  PR #042e-lifecycle (write-side helpers, які orchestrator dispatches),
  PR #042e-mapping (камелкейс ↔ snake_case вже встановлений contract,
  reverse mapper тут — generalisation). PR #042c (envelope-builder)
  і PR #042d-builder (enqueue) — uppstream писачі, не дзеркала.

#### **PR #042e-scheduler — `feat(api-client): syncEnginePushScheduler factory`** ✅ LANDED ([#1932](https://github.com/Skords-01/Sergeant/pull/1932))

- Scope. Pure factory у `@sergeant/api-client`, що обертає
  `runSyncEnginePushOnce` (PR #042e-pushloop) у `{start, stop, flushNow,
isRunning, isTicking}` із internal interval-state і concurrency-guard-ом
  (ніколи не запускає overlapping ticks). Перший крок до boot-path
  wiring-у Stage 5 sync-engine — periodic timer, але без real timer
  усередині (DI `setInterval`/`clearInterval` через `SyncEngineSetIntervalFn`
  / `SyncEngineClearIntervalFn`). Зберігає api-client від workspace-залежності
  на db-schema.
- **Done (2026-05-05).** `packages/api-client/src/endpoints/syncV2.pushScheduler.ts`
  експортує:
  - `createSyncEnginePushScheduler(deps, options): SyncEnginePushScheduler` —
    factory. Validate-ить `intervalMs` (positive finite), arms
    timer лише при `start()`, no-op повторні `start()` між
    `start`/`stop`. `flushNow()` під час in-flight tick-у вертає
    той самий pending Promise (concurrency invariant: ≤1 tick at a time).
    Periodic tick errors дзеркаляться в DI-`onTickError(err)` — НЕ
    re-throw-ються із timer callback (нікому б їх не зловити). Tick
    skipped через concurrency-guard → `onSkippedTick(reason: 'periodic-overlap')`.
    Successful tick → `onTickComplete(result)` (telemetry hook).
  - DI types — `SyncEnginePushSchedulerDeps` (run + onTickError +
    onSkippedTick + onTickComplete + setInterval + clearInterval),
    `SyncEnginePushSchedulerOptions` (extends `SyncEnginePushOptions`
    - `intervalMs`), `SyncEnginePushScheduler` (start/stop/flushNow/
      isRunning/isTicking), `SyncEngineSetIntervalFn`, `SyncEngineClearIntervalFn`.
  - `packages/api-client/src/endpoints/syncV2.pushScheduler.test.ts`:
    nove тестів покривають validation, idempotent start/stop, periodic
    fire (Vitest fake timers), concurrency-guard на periodic+flush
    overlap, error-routing через `onTickError` (periodic) vs throw
    (flushNow), `isRunning` / `isTicking` introspection, `onSkippedTick`
    / `onTickComplete` спостерігачі.
  - Re-export із `packages/api-client/src/index.ts`:
    `createSyncEnginePushScheduler`, `SyncEnginePushScheduler`,
    `SyncEnginePushSchedulerDeps`, `SyncEnginePushSchedulerOptions`,
    `SyncEngineSetIntervalFn`, `SyncEngineClearIntervalFn`.
  - Locally: 157/157 api-client тестів зелені (33 нові + 124 існуючих),
    typecheck чистий, lint чистий.
- **Risk.** None — additive composable surface без callsite-ів у
  production-коді. Periodic-timer wiring у boot-path-у — окремий
  follow-up PR (потребує `apps/web` `<App>` mount-time hook +
  `apps/mobile` shim teardown).
- **Dep.** PR #042e-pushloop (`runSyncEnginePushOnce` — функція, яку
  scheduler tick-ає). Композується із PR #042e-flush (DOM-event
  bridge → `flushNow()`).

#### **PR #042e-status — `feat(db-schema): countOutboxByStatus reader`** ✅ LANDED ([#1933](https://github.com/Skords-01/Sergeant/pull/1933))

- Scope. Маленький read-only helper у `@sergeant/db-schema`, що повертає
  `{ pending, dead_letter, rejected }` через один `SELECT status, COUNT(*)
FROM sync_op_outbox GROUP BY status`. Споживачі: UI badge ("X items
  waiting"), Sentry breadcrumbs (telemetry sample), і engine-side
  decision-у "чи варто стартувати ще один tick" (якщо все pending=0,
  scheduler може skip). Read-only, additive, доповнює read-side
  helper-и (PR #042e-drain).
- **Done (2026-05-05).** `packages/db-schema/src/sqlite/syncOpOutboxStatus.ts`
  експортує:
  - `countOutboxByStatus(client): Promise<OutboxStatusCounts>` — повертає
    `{ pending: number, dead_letter: number, rejected: number }`. Single
    `SELECT status, COUNT(*) FROM sync_op_outbox GROUP BY status` query;
    усі три ключі завжди present (відсутній bucket → `0`). Ігнорує
    невідомі статуси (forward-compat — нові статуси не валять caller-а).
  - Type `OutboxStatusCounts` — public structural mirror.
  - `packages/db-schema/src/__tests__/sqlite-syncOpOutboxStatus.test.ts`:
    19 нових тестів проти real better-sqlite3: empty bucket → всі
    нулі, single-status, multiple-statuses, mixed-batches, ignore
    unknown-status forward-compat, rapid-write race-stub, no-rows-changed
    side-effect (read-only).
  - Re-export із `packages/db-schema/src/sqlite/index.ts`:
    `countOutboxByStatus`, `type OutboxStatusCounts`.
  - Locally: 341/341 db-schema тестів зелені (19 нових + 322 існуючих),
    typecheck чистий, lint ��истий.
- **Risk.** None — read-only helper. Один `SELECT` без UPDATE /
  DELETE; жодного callsite-у у production-коді поки що.
- **Dep.** None — independent з усіх інших Stage 5 PR-ів. UI badge
  / Sentry breadcrumbs / scheduler-side "skip empty tick" — окремі
  wiring PR-и, які цей reader пулять.

#### **PR #042e-recover — `feat(db-schema): recoverDeadLetter helper`** ✅ LANDED ([#1935](https://github.com/Skords-01/Sergeant/pull/1935))

- Scope. Закриває read-side петлю на `sync_op_outbox`: lifecycle helper-и
  (PR #042e-lifecycle) рухають рядки у термінальні `'dead_letter'` /
  `'rejected'`; reader (PR #042e-status) показує counts; цей helper
  переводить `dead_letter` рядки назад у `pending` для re-try. Pure
  write, без callsite-ів у production-коді поки що.
- **Done (2026-05-05).** `packages/db-schema/src/sqlite/syncOpOutboxRecover.ts`
  експортує:
  - `recoverDeadLetter(client, selector): Promise<RecoverDeadLetterResult>` —
    public функція. Selector: `{ ids: number[] }` (recover explicit
    list, для dev-panel "retry these 5 rows" / ops-script-у) або
    `{ all: true }` (recover усі dead-letter рядки одночасно, для
    "force flush" workflow після service incident-у). Mutually exclusive —
    рівно один must be set, runtime-validate-нуто. Ids де-дуплікуються
    перш ніж SQL; кожен id валідується (finite + integer + non-negative)
    inline і throw із `JSON.stringify(value)` для дебагу.
  - Mutation contract: `UPDATE sync_op_outbox SET status='pending',
attempts=0, next_retry_at=NULL, last_error=NULL WHERE id IN (...)
AND status='dead_letter'`. `WHERE status='dead_letter'` guard
    робить helper race-safe — ряд, який інший worker уже забрав із
    dead-letter, лишається недоторканим (потрапляє у `skipped`).
    `attempts=0` reset означає: `planRetry` пройде full backoff curve
    на наступний transient failure (matches user mental model
    "retry from scratch").
  - **Чому dead-letter only, не rejected.** `'rejected'` — server-side
    terminal (server сказав `op_not_supported` / `tombstoned`) — client-driven
    retry просто bounce-неться об сервер. `'dead_letter'` —
    client-side terminal (вибрали retry budget проти transient
    failure-ів); recovery дає їм ще шанс коли user онлайн.
  - Result `{ recovered: number[], skipped: number[] }` — `recovered`
    у порядку SELECT-у; `skipped` зберігає natural input order для
    `ids`-mode-у (полегшує debugging — caller може mapпити input до
    output 1:1).
  - Re-export із `packages/db-schema/src/sqlite/index.ts`:
    `recoverDeadLetter`, `type RecoverDeadLetterResult`,
    `type RecoverDeadLetterSelector`.
  - `packages/db-schema/src/__tests__/sqlite-syncOpOutboxRecover.test.ts`:
    23 нові тести у 5 групах: selector validation
    (mutual-exclusion, type/sign guards, empty list), id-based recovery
    (single, multiple, mixed status, missing ids, de-duplication,
    idempotency), all-mode recovery (empty bucket, batch, status
    filtering), state-reset invariant (attempts > MAX, future
    next_retry_at, long last_error), race-safety invariant
    (concurrent move out of dead-letter, concurrent move to rejected).
  - Locally: 364/364 db-schema тестів зелені (23 нові + 341 існуючий),
    typecheck чистий, lint чистий.
- **Risk.** None — pure write helper, callsite-ів у production-коді
  поки немає. UI dev-panel "retry" buttons + ops-script-и pull-ять
  цей helper у follow-up wiring PR-ах.
- **Dep.** PR #042e-lifecycle (write-side, який кладе рядки у
  `'dead_letter'`), PR #042e-status (read-side, який повідомляє
  скільки сидять у dead-letter — UI badge → "retry all" button →
  `recoverDeadLetter({ all: true })`).

#### **PR #042e-flush — `feat(api-client): syncEngineFlushOnReconnect adapter`** ✅ LANDED ([#1938](https://github.com/Skords-01/Sergeant/pull/1938))

- Scope. DOM-event → scheduler bridge у `@sergeant/api-client`. Обертає
  `SyncEnginePushScheduler` (PR #042e-scheduler) так, щоб DOM-event
  source — production: `window`, тести: stub — викликав `scheduler.flushNow()`
  щойно девайс знову онлайн (або, опційно, щойно вкладка стала visible
  після backgrounding-у). Pure DI: event target supplied caller-ом, не
  імпортується — adapter unit-тестується без real `window` і re-usable
  із service worker-а / web worker-а / `apps/mobile` shim-у, що exposes
  той самий `addEventListener` shape.
- **Done (2026-05-05).** `packages/api-client/src/endpoints/syncV2.flushOnReconnect.ts`
  експортує:
  - `createSyncEngineFlushOnReconnect(deps, options): SyncEngineFlushOnReconnect` —
    factory. Subscribe-ить адаптер до DOM event-у за `kind`:
    `'online'` (default; standard browser `online`), `'visible'`
    (`visibilitychange`, fires лише на appear edge —
    `target.document?.visibilityState === 'visible'`), або `'both'`
    (subscribe до обох; кожен fires `flushNow` незалежно). На кожен
    matching event handler викликає `scheduler.flushNow()`, route-ить
    Promise через `onFlushComplete` / `onFlushError` observers
    (із try/catch — observer-throw swallowed), і повертається
    синхронно (DOM event listener не може `await`).
  - **Concurrency invariant delegated to scheduler.** Adapter НЕ
    додає другий шар де-дуплікації. Два `online` event-и за 100мс
    → exactly one tick, бо власний concurrency-guard scheduler-а
    (PR #042e-scheduler) merge-ить overlapping `flushNow()` calls
    у єдиний in-flight Promise. Pin-ується тестом у групі 7
    (preserves single-source-of-truth для "is a tick in flight").
  - **Error policy.** Rejection із `flushNow()` → `onFlushError`
    (default no-op) → swallowed. DOM event source не має retry channel-а,
    і ми не хочемо щоб transient sync failure escalated у window-level
    `unhandledrejection`, що міг би trigger Sentry / surface у
    devtools. `onFlushError` сам із try/catch — buggy observer
    не може blow-up event listener.
  - DI types — `SyncEngineEventTarget` (минимальний `addEventListener`
    / `removeEventListener` shape; satisfies `window`, `globalThis`,
    `document`, hand-rolled stub), `SyncEngineFlushOnReconnectDeps`
    (target + scheduler + optional observers + optional
    `isDocumentVisible` predicate), `SyncEngineFlushOnReconnectOptions`
    (`kind?`), `SyncEngineFlushOnReconnect` (`dispose()`),
    `SyncEngineFlushTriggerKind`.
  - `dispose()` — idempotent, removes every listener it registered;
    same handler reference для register і unregister (so removal exact).
  - `packages/api-client/src/endpoints/syncV2.flushOnReconnect.test.ts`:
    30 нових тестів у 8 групах: subscription registration (default,
    each kind, fresh handler refs), flushNow on online (single,
    multiple, ignores other event types, onFlushComplete invocation),
    error policy (rejection → onFlushError, no unhandledrejection,
    observer-throw swallowed in both error and complete paths,
    silent on missing onFlushError, sync-throw guard), visibility-edge
    filter (appear fires, hide does not, transition re-evaluates,
    default predicate degrades on missing document, default predicate
    fires when `document.visibilityState='visible'`), kind='both'
    fan-out, dispose lifecycle (removes every listener, idempotent),
    concurrency invariant delegated to scheduler, interaction із
    stopped scheduler (flushNow called навіть коли scheduler stopped,
    per scheduler contract).
  - Re-export із `packages/api-client/src/index.ts`:
    `createSyncEngineFlushOnReconnect`, `SyncEngineEventTarget`,
    `SyncEngineFlushOnReconnect`, `SyncEngineFlushOnReconnectDeps`,
    `SyncEngineFlushOnReconnectOptions`, `SyncEngineFlushTriggerKind`.
  - Locally: 187/187 api-client тестів зелені (30 нові + 157 існуючих),
    typecheck чистий, lint чистий.
- **Risk.** None — additive composable surface без callsite-ів у
  production-коді. Wiring у `apps/web` `<App>` boot path + `apps/mobile`
  shim teardown — follow-up PR разом із рештою `#042e` сім'ї.
- **Dep.** PR #042e-scheduler (`SyncEnginePushScheduler.flushNow`,
  який adapter викликає; concurrency-guard scheduler-а — той,
  завдяки якому adapter не дублює de-dup). Композується із PR
  #042e-pushloop через scheduler. Майбутній `pushOnEnqueue` adapter
  буде reuse той самий "fire on event → flushNow" pattern, що тут.

#### **PR #042e-wiring — `feat(web): wire sync engine writer runtime`** ✅ LANDED ([#1953](https://github.com/Skords-01/Sergeant/pull/1953))

- Scope. Закриває Stage 5 виклик "сім'ю #042e композувати у web boot path".
  Створює web-only runtime factory у `apps/web/src/core/syncEngine/` яка
  склеює `@sergeant/api-client` push scheduler / reconnect-flush adapter
  поверх `@sergeant/db-schema/sqlite` outbox helper-ів і викликається з
  `apps/web/src/main.tsx` після storage migrations і перед deferred
  observability init.
- **Done (2026-05-06).** Реалізація:
  - `apps/web/src/core/syncEngine/syncEngineWriter.ts` — runtime factory
    `createSyncEngineWriterRuntime` із narrow surface
    `{ start, stop, flushNow, notifyEnqueued, getStatus, recoverAllDeadLetters }`.
  - `apps/web/src/core/syncEngine/singleton.ts` — `bootSyncEngineWriter()` +
    `getSyncEngineWriter()` (одноразовий boot, idempotent).
  - `apps/web/src/main.tsx` — виклик `bootSyncEngineWriter()` після
    storage init.
  - `apps/web/src/core/cloudSync/hook/useSyncStatus.ts` +
    `apps/web/src/core/app/OfflineBanner.tsx` — extension hook читає sync v2
    counts (queued / inflight / dead-letter) і показує retry-action для
    dead-letter recovery; legacy v1-fields незмінні.
  - Sentry breadcrumbs на кожному tick complete + `captureException` у
    `sync-v2-push-tick`, `sync-v2-flush-on-reconnect`, `sync-v2-writer-boot`,
    `sync-v2-push-on-enqueue` scopes.
  - Default interval 30s; default drain limit 100 ops/tick.
- **Risk.** None — додає окремий v2 writer runtime поверх існуючого
  cloudSync v1 (без змін у v1 path). Burn-in потрібен щоб впевнитись,
  що Stage 7 cleanup можна безпечно знімати.
- **Dep.** PR #042e-pushloop, PR #042e-scheduler, PR #042e-flush,
  PR #042e-status, PR #042e-recover (всі вже залендили; цей PR тільки
  їх збирає у web boot).

#### **PR #043 — `feat(sync): G-set CRDT for nutrition_meals log`** ✅ LANDED ([#1734](https://github.com/Skords-01/Sergeant/pull/1734))

- Scope. `nutrition_meals` — append-only G-set. Видалення через
  tombstone (`deleted_at`) + LWW per-row.
- **Done (2026-05-04).** `applyNutritionMeals` тепер реджектить
  `op='insert'`/`op='update'` проти tombstoned ряду з причиною
  `tombstoned`. Idempotent delete (re-stamp `deleted_at`) збережений
  для коректного LWW pull-cursor advance-у. 3 нові інтеграційні тести
  (resurrection-attack, idempotent re-tombstone, concurrent-insert
  merge). Docstring документує G-set інваріант inline.
- Note. Цей самий resurrection-via-update guard формально лишається
  TODO для `fizruk_workouts`/`finyk_*`/`routine_entries` apply-шляхів
  — окрема сесія per-table. **Закрито PR #043a + PR #043b (нижче).**

#### **PR #043a — `feat(server): tombstone resurrection guard for routine + fizruk apply paths`** ✅ LANDED ([#1739](https://github.com/Skords-01/Sergeant/pull/1739))

- Scope. Дзеркалить інваріант із PR #043 на 6 інших soft-delete
  apply-функціях: `applyRoutineEntries`, `applyFizrukWorkouts`,
  `applyFizrukItems`, `applyFizrukSets`, `applyFizrukCustomExercises`,
  `applyFizrukMeasurements`.
- **Done (2026-05-04).** Кожна apply-функція тепер `SELECT`-ить
  `deleted_at` поряд із `user_id`/`updated_at`; після LWW-guard-а додано
  явну перевірку — якщо ряд tombstoned і `op !== "delete"`, повертаємо
  `status='rejected', reason='tombstoned'`. `op='delete'` лишається
  ідемпотентним. 6 нових інтеграційних кейсів у `syncV2.integration.test.ts`
  (insert → delete → resurrect attempt → reject; final state: `deleted_at`
  != null, оригінальні поля незмінні).
- **Dep.** PR #043.

#### **PR #043b — `feat(server): tombstone resurrection guard for nutrition + finyk apply paths`** ✅ LANDED ([#1743](https://github.com/Skords-01/Sergeant/pull/1743))

- Scope. Закриває залишок per-table TODO з PR #043: 3 nutrition non-meals
  apply-функції (`applyNutritionPantries`, `applyNutritionPantryItems`,
  `applyNutritionRecipes`) + 2 finyk хелпери, які покривають усі 10
  finyk soft-delete таблиць (`applyFinykTombstone` — 2 composite-PK,
  `applyFinykPerRowBlob` — 8 per-row + JSONB).
- **Done (2026-05-04).** 7 нових integration-кейсів покривають
  resurrection-attack reject + idempotent re-tombstone. Разом із
  PR #043a повністю закриває per-table TODO з PR #043 для всіх 9 soft-delete
  apply-шляхів.
- **Dep.** PR #043, PR #043a.

#### **PR #043c — `feat(server): typed RejectReason allowlist for syncV2 apply path`** ✅ LANDED ([#1754](https://github.com/Skords-01/Sergeant/pull/1754))

- Scope. Тіснимо `reason: string` у syncV2-apply-шляху до closed string-literal
  union (`ApplyRejectReason | EngineRejectReason`), backed by exported
  `as const` arrays `APPLY_REJECT_REASONS` (45 літерали) + `ENGINE_REJECT_REASONS`
  (4 літерали). TS-tsc блокує emit невідомого літерала на compile-time —
  раніше typo тихо потрапляло у Prometheus як новий label-series, blowing
  past документований cardinality cap.
- **Виконано.** `apps/server/src/modules/sync/syncV2.ts` — нові типи + експорт
  `as const`-масивів; `apps/server/src/obs/metrics.test.ts` — regression-test
  пінить довжину allowlist-у (45/4) + key CRDT-інваріанти + snake_case-shape +
  no-duplicates; `docs/observability/metrics.md` §4 — оновлений cardinality
  budget і source-of-truth-лінк. Locally: typecheck + lint + 121 sync/obs тестів зелені.
- **Risk.** Low — types-only narrowing; runtime label-set Prometheus незмінний.
  Forward-compat: future apply-fn additions extend `as const` array (TS блокує
  compile, поки не додано) — той самий governance-патерн, що `OP_LOG_TABLE_REGISTRY`.
- **Dep.** PR #043, PR #043a, PR #043b, PR #048.

#### **PR #044 — `feat(sync): conflict resolution UI for finyk_manual_expenses`** ✅ LANDED — [#1780](https://github.com/Skords-01/Sergeant/pull/1780)

- Scope. Для finyk деякі конфлікти користувач має побачити (наприклад
  edit одної транзакції з двох девайсів). Показуємо merge-UI — у цій
  PR-і навмисно вузький first-pass: банер-counter без per-row
  resolve-actions (їх додамо коли sync-v2 client push-loop буде
  зашитий і recorder-API почне отримувати реальні reject-и).
- **Implementation (2026-05-04).** Typed module-level pub/sub store
  у `apps/web/src/modules/finyk/lib/conflicts/store.ts` (pattern
  matches `hubBus.ts`): dedup по `transaction_id`, FIFO-cap на
  25 записів (`MAX_CONFLICTS`), identity-stable snapshot для
  `useSyncExternalStore`, listener error-isolation-контракт
  (throwing listener не блокує fan-out). React-хук
  `useFinykManualExpenseConflicts` через `useSyncExternalStore`
  для concurrent-render safety. Banner `FinykManualExpenseConflictBanner`
  з ARIA `role='status'` + `aria-live='polite'`, UA plural-формами
  через `Intl.PluralRules('uk-UA')` (1 / 2-4 / 5+). Self-renders
  no-op коли черга порожня — інтеграція у `FinykApp.tsx` під
  no-bank банером без feature-flag-у. 18 нових тестів: 13 для store
  (recording, dedup, FIFO age-out, dismiss/dismissAll, unsubscribe,
  error-isolation з `setTimeout`-stub-ом для Vitest unhandled-error
  budget, snapshot identity) + 5 для banner (empty, ARIA contract,
  плюрал-форми, dismiss-all з override та без, store fan-out).
  Locally: pnpm lint / typecheck / test всі зелені.
- **Risk.** Low — UI-only; recorder-API лишається без callsite-ів
  (sync-v2 client push-loop не зашитий), тому банер у production
  ніколи не покаже non-empty стан до наступних PR Stage 5 серії.
  Pre-existing hash-router warnings у `FinykApp.tsx` явно
  `eslint-disable`-ються з посиланням на initiative 0006 Phase 2.
- **Dep.** PR #043, PR #043a, PR #043b (sync-v2 reject-shape
  стабілізовано).

---

### Stage 6 — Operational maturity

#### **PR #045 — `feat(infra): Railway Redis addon for rate-limit + sync queue`**

- Scope. Опційно — якщо Postgres rate-limit з PR #011 показав latency-issue
  на масштабі. Redis для buckets + pub/sub для SSE.

#### **PR #046 — `feat(server): pgBouncer connection pooling`** ✅ LANDED — [#1923](https://github.com/Skords-01/Sergeant/pull/1923)

- Scope. Опційний `DATABASE_URL_POOL` ENV-перемикач: runtime app-pool
  ходить у pgBouncer / Supavisor / Neon-proxy у transaction-mode, а
  `DATABASE_URL` лишається direct-connection-ом для migrations,
  `pg_advisory_lock` і будь-яких майбутніх session-mode воркерів. Без
  `DATABASE_URL_POOL` поведінка не змінюється (legacy single-URL deploys).
- **Done (2026-05-05).** Реалізація:
  - `apps/server/src/db.ts` — pool тепер бере `env.DATABASE_URL_POOL || env.DATABASE_URL`;
    експортує `POOL_VIA_PGBOUNCER` boolean і додає `routedThrough: "pgbouncer" | "direct"`
    у `getPoolStats()` (для `/healthz` дашбордів).
  - `apps/server/src/env.ts` + `apps/server/src/env/env.ts` — `DATABASE_URL_POOL: z.string().url().optional()`.
  - `apps/server/src/db.test.ts` — 4 unit-тести покривають усі комбінації routing-у через `vi.stubEnv` + `vi.resetModules`.
  - `docs/runbooks/database-connection-pooling.md` — Railway-deploy shape (`edoburu/pgbouncer`, transaction-mode, MAX_CLIENT_CONN sizing), верифікація, rollback, prepared-statement caveat.
- AC. Стабільні з'єднання при 200 concurrent users — Railway pgBouncer-сервіс
  - `DATABASE_URL_POOL` уведено в production runbook; verification смокується
    через `getPoolStats().routedThrough === "pgbouncer"` на `/healthz`.

#### **PR #047 — `feat(server): Postgres read replica for analytics queries`** ✅ LANDED — [#1928](https://github.com/Skords-01/Sergeant/pull/1928)

- Scope. Опційний **streaming-replication read replica** для analytics-style
  SELECT-ів (`growth_*`, `seo_*`), щоб offload-ити analytics-load з primary
  Postgres у Railway production. Без `DATABASE_URL_REPLICA` поведінка не
  змінюється — single-URL deploy-и (Replit, dev, docker-compose) ходять
  у primary.
- **Done (2026-05-05).** Реалізація:
  - `apps/server/src/dbReplica.ts` — окремий `pg.Pool`, `queryReplica()` / `withReplicaClient()`
    із прозорим fallback-ом на primary pool коли `DATABASE_URL_REPLICA` empty.
  - Перший caller — `GET /api/internal/seo/keywords` (active keyword list,
    толерує <5s replica lag).
  - `apps/server/src/env.ts` + `apps/server/src/env/env.ts` — `DATABASE_URL_REPLICA: z.string().url().optional()`.
  - 4 dbReplica + 22 internal-route unit-тести (eager `pg.Pool` instantiation
    не відкриває TCP, паттерн із `db.test.ts`).
  - `docs/runbooks/postgres-read-replica.md` — Railway deploy shape, мінімальні
    privilege-и для replica role, верифікація, rollback, alerts.
- AC. Lag < 5s на p99 — задокументований alert threshold у runbook-у;
  analytics queries route у replica через `queryReplica()`; primary бере на
  себе тільки writes / read-after-write.

#### **PR #048 — `feat(observability): sync health Grafana/Sentry dashboard`** ✅ LANDED ([#1737](https://github.com/Skords-01/Sergeant/pull/1737))

- Scope. Дашборд з RED (p50/p95/p99 push-latency, conflict rate, queue depth,
  op-log throughput per user). Алерти: conflict rate > 5%, queue depth > 100,
  push p99 > 5s.
- **Done (2026-05-04).** Три нові prom-client метрики:
  `sync_op_log_apply_total{table,status,reason}` (per-op outcome counter),
  `sync_op_log_pull_lag_ms` (user-perceived staleness histogram),
  `sync_op_log_pull_queue_depth` (ops-returned-per-pull histogram).
  Інструментація в `syncV2Push` (3 call-site-и) + `syncV2Pull` (lag
  observation на newest op + depth = `opsOut.length`); усе в `try/catch`,
  не ламає request у разі Prometheus failure. 4 нові панелі в
  `docs/observability/dashboards/sync.json` (per-op outcomes stacked,
  topk-10 reject reasons, pull lag p50/95/99, queue depth p50/95/99).
  Cardinality cap: ~1100 worst-case (phenomenologically ~50–100 active).
  3 нові тести в `apps/server/src/obs/metrics.test.ts` фіксують registry
  - label-set + bucket boundaries `le=100` / `5000` / `200`, на які
    будуть прив'язані SLO-алерти. PromQL рецепти оновлені в
    `docs/observability/metrics.md` §4 і `docs/observability/dashboards.md`.

#### **PR #049 — `feat(ops): backup/restore runbook + weekly verify CI`** 🚧 split into PR #049 (docs) + PR #049b (CI)

- Scope. Документувати full-restore-from-backup для Railway Postgres.
  GitHub Action раз на тиждень: restore latest dump на staging + smoke-test
  schema integrity. Failures → PagerDuty.
- **Split.** Розділено на два кроки: docs-only PR #049 LANDED ([#1757](https://github.com/Skords-01/Sergeant/pull/1757));
  weekly-verify GitHub Action — окремий PR #049b (потребує `RAILWAY_TOKEN` у
  GH Secrets + staging instance, поза скоупом docs-only).

##### **PR #049 — `docs(docs): Railway Postgres backup/restore runbook (PR #049 docs portion)`** ✅ LANDED ([#1757](https://github.com/Skords-01/Sergeant/pull/1757))

- Scope. Новий runbook у [`docs/runbooks/database-backup-restore.md`](../runbooks/database-backup-restore.md):
  Railway dashboard + локальні `pg_dump`/`pg_restore` команди (custom format,
  `--no-owner --no-privileges --clean --if-exists`); sync-aware row-level
  restore матриця (which tables safe per CRDT semantics з PR #043 / #043a / #043b);
  smoke-test SQL пінить migration ledger, row-counts, tombstone-інваріанти,
  op-log monotonic server_ts, FK orphans; migration-skew handling; escalation
  paths. Cross-link із concept-level [`docs/playbooks/restore-from-backup.md`](../playbooks/restore-from-backup.md),
  [`docs/playbooks/test-backup-restore.md`](../playbooks/test-backup-restore.md),
  [`docs/security/disaster-recovery.md`](../security/disaster-recovery.md).
- **Risk.** None — pure docs, no runtime / schema / code change.
- **Dep.** None.

##### **PR #049b — `feat(ci): weekly Railway Postgres backup-verify GitHub Action`** ✅ LANDED

- Scope. `.github/workflows/db-backup-verify.yml` — pull-latest-dump → restore
  у ephemeral pg-instance (testcontainers / Railway temp service) → прогнати
  smoke-test SQL із runbook-у §4. Failures → auto-created GitHub Issue.
- **Реалізовано.** `.github/workflows/db-backup-verify.yml` — weekly cron
  (Sunday 04:00 UTC), `workflow_dispatch` for manual runs. Uses
  `pgvector/pgvector:pg16` service container (matches CI/docker-compose).
  Graceful fallback: коли `RAILWAY_TOKEN` не налаштований — migration-only
  verify (schema integrity без production data). 5-step pipeline:
  1. Pull latest Railway dump via CLI (або skip з warning).
  2. `pg_restore` у ephemeral Postgres.
  3. `node apps/server/migrate.mjs` — ensures ledger is current.
  4. Smoke-test § 4 з runbook-у: migration ledger, critical table row-counts,
     CRDT tombstone invariants, sync op-log monotonic, FK integrity.
  5. On failure (scheduled runs): auto-create/comment GitHub Issue з dedup
     (label `db-backup-verify`). Step summary з structured results.
- **Blocker (operational).** Потребує `RAILWAY_TOKEN` у GH Secrets для
  pull-dump-path. Без нього workflow проганяє migration-only verify.
- **Dep.** PR #049 (docs).

#### **PR #050 — `feat(ops): module_data partition + archival`** ✅ LANDED

- Scope. Range-партиціонування `module_data` по `client_updated_at` (monthly).
  Архівний скрипт для detach + dump старих партицій у cold-storage.
- **Реалізовано.**
  - `apps/server/src/migrations/042_module_data_partition.{sql,down.sql}` —
    idempotent DDL: створює `module_data_partitioned` (RANGE BY
    `client_updated_at`), 36 monthly partitions (2024-01 → 2026-12) +
    default partition, копіює дані, rename-swap `module_data_legacy` ↔
    `module_data`. Helper function `create_module_data_partition(year, month)`
    для створення майбутніх партицій (cron / pre-deploy). `down.sql` —
    revert через rename-swap із `module_data_legacy`.
  - `scripts/archive-module-data-partitions.sh` — bash-скрипт для
    архівації: detach + `pg_dump` + drop партицій старших за retention
    (default 3 місяці). Dry-run mode (`ARCHIVE_DRY_RUN=1`). Dumps
    у custom format для upload на S3/B2.
- **Important.** UNIQUE constraint relaxed до `(user_id, module,
client_updated_at)` (Postgres requirement для partitioned tables).
  Application-layer upsert запобігає cross-partition дублікатам.
- **Dep.** None.

---

### Stage 7 — Cleanup

> **Pre-step (2026-05-06): T₀ executed (server-side + client-side).**
>
> 1. **Server**: Initiative 0003 Phase 5 server-half — `apps/server/src/modules/sync/sunsetGone.ts` (`respondV1Gone`) повертає `410 Gone` на всіх 4-х v1 push/pull endpoint-ах. Phase 1+2 middleware (survey + Sunset/Deprecation/Link headers) лишається активним поверх 410. ADR-0047.
> 2. **Client (web + mobile)**: Phase 5-client cutover — `apps/web/src/core/cloudSync/hook/useCloudSync.ts` і `apps/mobile/src/sync/hook/useCloudSync.ts` тепер stub-и, що повертають no-op defaults. Engine-fetch-calls від клієнта вимкнено; v1-channel `module_data` blob більше ніким не пишеться.
>
> Це розблоковує PR #051 і PR #052 нижче (per AGENTS hard rule #4 — "код не пише у v1 канал" → можна drop-ити column у наступному release-cycle).

#### **PR #051 + PR #052a — `feat(server): drop module_data column + remove v1 sync handlers`** ✅ LANDED

- Commit [`75dcdd5c`](https://github.com/Skords-01/Sergeant/commit/75dcdd5c) (2026-05-06) одним merge поєднав
  початкові #051 і #052a (server-side частину #052) — оскільки після
  ADR-0047 (T₀ виконано) v1-канал ніким не пишеться, фаза 2 двофазного
  DROP-у безпечно йде в одному release-cycle.
- Migration `046_drop_module_data.{sql,down.sql}` — `DROP TABLE module_data CASCADE` (все, включно з 36 monthly partitions з міграції 042) + `DROP TABLE module_data_legacy CASCADE` + `DROP FUNCTION create_module_data_partition` під ALLOW_DROP comment per AGENTS hard-rule #4.
- Server side: `apps/server/src/modules/sync/sync.ts` (605 LOC) + `sync.test.ts` (727 LOC) повністю видалено — `syncPush*` / `syncPull*` хендлер-и + `VALID_MODULES` set + `MAX_BLOB_SIZE` constant. `routes/sync.ts` лишається тільки як `respondV1Gone` (returns 410 + sunset headers, ADR-0047 30-day rescue redirect).
- `packages/db-schema` — `pg/moduleData.ts` + `sqlite/moduleData.ts` + `MODULE_DATA_MODULES` const видалено; barrel-и оновлено.
- Total: 16 files touched, +158 / −2197.

#### **PR #052b — `chore(web): remove cloudSync v1 engine (storagePatch, dirty tracking, offline queue)`** ✅ LANDED

- Commit [`a97b8cc8`](https://github.com/Skords-01/Sergeant/commit/a97b8cc8) ([#2046](https://github.com/Skords-01/Sergeant/pull/2046), 2026-05-06): 66 файлів, +199 / −8 698.
- Видалено весь dead-code engine tree під `apps/web/src/core/cloudSync/` —
  `engine/` (buildPayload, initialSync, pull, push, replay, retryAsync, upload),
  `queue/` (offlineQueue, deadLetter, collectQueued),
  `state/` (dirtyModules, events, migration, moduleData, versions),
  `storage/syncMetaStore`, `conflict/` (parseDate, pushSuccess, resolver),
  `errorNormalizer`, `debugState`, `logger`, `cloudSyncHelpers.test`,
  `useCloudSync.behavior.test`, `useCloudSync.hardening.test`,
  `hook/{useSyncRetry,useSyncCallbacks,useEngineArgs,useInitialSyncOnUser,useCloudSyncDebug}` +
  два integration-тести в `test/integration/` (cloudSync.replayEngine, cloudSync.splitBrain).
- Що лишилося в `cloudSync/`:
  - `hook/useCloudSync` — v1-shape stub (uplift зі stage 7 client-cutover, ADR-0047),
  - `hook/useSyncStatus` — v2 outbox-counter mirror, який і далі живить `OfflineBanner.tsx`,
  - `hook/useSyncErrorToast` — toast-surface для v2 помилок,
  - ~~`enqueue.ts` (no-op)~~ — видалено у PR #053a (KVStore deprecate, web phase) разом з `apps/web/src/shared/lib/storage/syncedKV.ts` фасадом і 5 `safeWriteSyncedLS` callsites.
- App.tsx + useAppEffects.ts + OfflineBanner.tsx + MigrationPrompt UI **залишилися як є в #052b** — rewire винесено в окремий follow-up `chore(web): drop MigrationPrompt and detangle App.tsx cloudSync wiring` (PR #052b-followup), бо це vertical в App.tsx, що окремо рев'ювиться.

#### **PR #052c — `chore(mobile): remove cloudSync v1 engine`** ✅ LANDED

- Commit [`20793adb`](https://github.com/Skords-01/Sergeant/commit/20793adb) — mirror того самого drop у `apps/mobile/src/sync/`. Mobile `useCloudSync`
  теж stub-нутий у попередньому Phase 5 client-cutover (Initiative 0003),
  engine код лежить dead-code.
- Видаляється: `engine/` (buildPayload, pull, push, replay, retryAsync),
  `queue/` (collectQueued, deadLetter, offlineQueue), `state/`
  (dirtyModules, moduleData, versions), `net/online`, `api.ts`,
  `config.ts`, `errorNormalizer.ts`, `events.ts`, `hook/useSyncCallbacks`,
  - 5 `__tests__/` (deadLetter, offlineQueue, online, replay,
    useSyncedStorage.test.tsx).
- Що лишається в `apps/mobile/src/sync/`:
  - `hook/useCloudSync` — v1-shape stub (Phase 5 client cut-over),
  - `hook/useSyncStatus` — read-only stub returning idle shape (mobile
    v2 op-log writer-runtime ще не прокинутий у boot path; web
    counterpart — `apps/web/src/core/syncEngine/syncEngineWriter.ts` —
    залендив у [#1953](https://github.com/Skords-01/Sergeant/pull/1953);
    mobile wiring = follow-up),
  - `useSyncedStorage` — `useLocalStorage` + `enqueueChange` (no-op)
    wrapper для tracked sync keys,
  - `enqueue.ts` (no-op) — лишається до PR #053b/c (mobile KVStore
    deprecate, fizruk + nutrition/finyk/routine + boot wiring), бо
    17+ module-store call-sites досі імпортують `enqueueChange` /
    `notifySyncDirty`,
  - `CloudSyncProvider` / `useCloudSyncContext` — context wrapper
    навколо `useCloudSync` (живить `SyncStatusOverlay.tsx`),
  - `persister/mmkvPersister.ts` — TanStack Query MMKV persister; не
    залежить від v1 engine, лише імпорт `QUERY_CACHE_KEY` рефакторено з
    видаленого `config.ts` на `STORAGE_KEYS.MOBILE_QUERY_CACHE` з
    `@sergeant/shared`.
- Total: 23 файлів видалено / 5 stubs переписано / 1 рефакторено.
  ~2,597 LOC dead code знесено.

#### **PR #054a — `chore(ci): drop stale cloudSync entries from localStorage allowlist`** ✅ LANDED

- Commit [`079fe8e3`](https://github.com/Skords-01/Sergeant/commit/079fe8e3)
  ([#2058](https://github.com/Skords-01/Sergeant/pull/2058), 2026-05-06).
- Прибрано 4 стейлові entry-и з web `no-raw-local-storage` allowlist
  (3 файли видалені у #052b, `enqueue.ts` тепер no-op без `localStorage.*`):
  `apps/web/src/core/cloudSync/{logger,queue/offlineQueue,state/moduleData,enqueue}.ts`.
- `.tech-debt/localstorage-allowlist-budget.json` опущений 10 → 6 (headroom 0).
- Stage 7 status у roadmap doc оновлено на in-flight.

#### **PR #054b — `docs(docs): supersedes-edge ADR-0004 ↔ ADR-0047 + prune dangling cloudSync v1 source refs`** ✅ LANDED

- Commits [`997ad6e2`](https://github.com/Skords-01/Sergeant/commit/997ad6e2)
  - [`ac2cc5c8`](https://github.com/Skords-01/Sergeant/commit/ac2cc5c8)
    ([#2066](https://github.com/Skords-01/Sergeant/pull/2066), 2026-05-06).
- Закрив 12 governance-sync errors (Hard Rule #15) — 12 dangling refs до
  файлів видалених у PR #051+#052a / #052b / #052c у 6 doc-ах:
  `docs/adr/0004-cloudsync-lww-conflict-resolution.md`,
  `docs/adr/0011-local-first-storage.md`,
  `docs/adr/0021-memory-bank.md`,
  `docs/adr/0047-cloudsync-v1-410-gone.md`,
  `docs/architecture/data-exchange-storage-audit.md`,
  `docs/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md`,
  `docs/observability/frontend.md`,
  `docs/tech-debt/mobile.md`.
- Bidirectional supersede edge ADR-0004 ↔ ADR-0047: ADR-0047 тепер
  явно `Supersedes: ADR-0004` (ADR graph CI gate enforces — раніше було
  лише `Status: superseded by ADR-0047` на ADR-0004 без зворотного посилання).
- `pnpm lint:governance-sync` → 0 errors (199 warnings лишаються — всі pre-existing aspirational).

#### **PR #054c — `docs(docs): prune dangling refs to retired docs/testing/mutation.md`** ✅ LANDED

- Commit [`5f2cfb0c`](https://github.com/Skords-01/Sergeant/commit/5f2cfb0c)
  ([#2072](https://github.com/Skords-01/Sergeant/pull/2072), 2026-05-06).
- 3 dangling refs до `docs/testing/mutation.md` (deleted у PR #052b разом
  з cloudSync v1 Stryker mutation infra) у 2 файлах:
  `docs/testing/README.md` (line 14 → tombstone-нота),
  `docs/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md` (lines 12, 35, 193).
- Markdown link checker → 0 internal-link errors на trie цих файлів
  (broken EXTERNAL link `https://instatus.com/` у `docs/launch/business/04-launch-readiness.md:313` — pre-existing на main, не в скоупі storage migration, owner: Dev).

#### **PR #054x — `docs(docs): add ADR-0049 row to ADR README index (Hard Rule #15 fix)`** ✅ LANDED

- Commit [`077c738f`](https://github.com/Skords-01/Sergeant/commit/077c738f)
  ([#2073](https://github.com/Skords-01/Sergeant/pull/2073), 2026-05-06).
- Fix-forward для pre-existing main breakage — додано missing row для
  ADR-0049 (`Auth vendor risk`) у `docs/adr/README.md`. ADR-0049 файл
  залендив у PR-48 (commit [`edd482ed`](https://github.com/Skords-01/Sergeant/commit/edd482ed)) без README index update.
- ADR graph CI gate (`scripts/docs/__tests__/check-adr-graph.test.mjs`)
  знову зелений (раніше валив на on-disk: validateGraph + README ↔ ADR
  count parity на main `19777fc3`).
- Не належить до storage-roadmap-у scope-у строго, але блокував
  governance-sync на PR #054c (#2072), тому залендив окремо паралельно.

#### **PR #053 — `chore: deprecate KVStore in favor of SQLite-backed cache`** ⏳ IN PROGRESS

> **Audit (2026-05-06, main `077c738f`).**
>
> - **Web KVStore prod consumers** (7 файлів, не тести): `apps/web/src/core/cloudSync/{enqueue,index,hook/useCloudSync}.ts` (sync-shim layer), `apps/web/src/core/onboarding/{cleanupDemoData,presetApply}.ts`, `apps/web/src/core/profile/memoryBank.ts`, `apps/web/src/shared/lib/storage/syncedKV.ts` (singleton-фасад) — **усі видалені/мігровані у PR #053a.**
> - **Mobile sync-aware prod consumers** (26 файлів, не тести): 9 fizruk hooks + 5 nutrition hooks + 1 routine + 3 finyk store-и + 5 dashboard / settings / observability + `apps/mobile/src/sync/{enqueue,index,useSyncedStorage}.ts` + `apps/mobile/src/lib/storage.ts` — **PR #053b/c (mobile phase).**
> - **Storage primitives у allowlist-і** (6 файлів, headroom 0): `storage.ts`, `storageManager.ts`, `storageQuota.ts`, `typedStore.ts`, `createModuleStorage.ts`, `useLocalStorageState.ts` — це самі обгортки `safeReadLS`/`safeWriteLS`/`safeRemoveLS`, які лишають LS єдиним dirty-bit для маленьких прапорців.

- **Scope.** KVStore-фасад (`@sergeant/shared/createSyncedKVStore`) лишається
  тільки для маленьких прапорців (UI prefs, hub layout, onboarding stage,
  Better Auth cookies). Усі модульні дані (fizruk workouts, nutrition meals,
  finyk transactions, routine entries) — повністю на SQLite через
  `useStorage()` per-module + op-log v2 push/pull. Tracked-key-и з
  `@sergeant/shared/sync/modules.ts` дзеркалять SQLite-row-и через
  `syncEngineWriter` (web — landed [#1953](https://github.com/Skords-01/Sergeant/pull/1953); mobile follow-up).
- **Web changes.**
  - Видалити `apps/web/src/core/cloudSync/enqueue.ts` (no-op shim) +
    `apps/web/src/core/cloudSync/index.ts` `enqueue` re-export.
  - `syncedKV.ts` — переписати на `createSyncedKVStore({ store: webKVStore, isTracked, onChange: () => {} })` без `enqueueChange` залежності.
  - Або краще: deprecate `safeWriteSyncedLS` / `safeRemoveSyncedLS` повністю,
    бо v2 op-log пише прямо з module store-ів (per-row), а не через
    LS-key-watcher → tracked-key registry стає рудиментом.
  - 2 callsites (`memoryBank.ts`, `presetApply.ts`, `cleanupDemoData.ts`) —
    мігрувати на raw `safeWriteLS` (вони пишуть у untracked keys так чи інакше).
- **Mobile changes.**
  - `apps/mobile/src/sync/enqueue.ts` (no-op) видалити; 26 module-store
    callsites мігрують з `enqueueChange` на v2 op-log writer-runtime
    (mobile boot-path wiring — слідом за `apps/web/src/core/syncEngine/syncEngineWriter.ts` [#1953](https://github.com/Skords-01/Sergeant/pull/1953)).
  - `useSyncedStorage` спрощується до `useLocalStorage` без callback hook.
- **Risk.** Multi-module migration зачіпає 33 prod-файли (web 7 + mobile 26).
  Плануємо розбити на 3 sub-PR-и: (a) web shim drop + 3 onboarding / profile callsites, (b) mobile module-stores wave 1 (fizruk), (c) mobile wave 2 (nutrition + finyk + routine + boot wiring). Кожен sub-PR — green CI + Sentry baseline check.
- **Dep.** `apps/web/src/core/syncEngine/syncEngineWriter.ts` (web) вже landed [#1953](https://github.com/Skords-01/Sergeant/pull/1953). Mobile counterpart — запланований follow-up до PR #053 (mobile sync-engine writer wiring у boot path).
- **Done criteria.**
  1. `apps/web/src/core/cloudSync/enqueue.ts` + `apps/mobile/src/sync/enqueue.ts` видалені (нуль `enqueueChange` callsites у production-коді).
  2. `safeWriteSyncedLS` / `safeRemoveSyncedLS` deprecated (тільки backward-compat re-export із warning, або повне видалення).
  3. KVStore tracked-key registry (`ALL_TRACKED_KEYS` у `@sergeant/shared`) скорочується до small-flag list-у (≤ 5 ключів — Better Auth cookies + UI prefs).
  4. tech-debt docs (`docs/tech-debt/{frontend,mobile}.md` §2) оновлено — KVStore не блокує SQLite-engine-as-single-storage definition-of-done (§0.2).
  5. governance-sync + ADR graph + lint + typecheck зелені.

#### **PR #053a — `chore(web): drop KVStore syncedKV shim + 5 onboarding/profile callsites`** ⏳ IN PR

- **Scope.** Web phase of PR #053 KVStore deprecate. Видаляє no-op
  `enqueueChange` shim + web `syncedKV` singleton-фасад, мігрує
  5 `safeWriteSyncedLS` call-sites на raw `safeWriteLS`. Mobile-side
  KVStore-фасад (`apps/mobile/src/sync/{enqueue,useSyncedStorage}.ts`
  - 26 module-store callsites) залишається до PR #053b/c.
- **Files removed.**
  - `apps/web/src/core/cloudSync/enqueue.ts` (no-op shim — v1 engine
    sunset у PR #052b, КNS-shim тримався тільки щоб `syncedKV.ts`
    компілився).
  - `apps/web/src/shared/lib/storage/syncedKV.ts` + companion test (web
    singleton wrapping `webKVStore` через
    `createSyncedKVStore({ onChange: enqueueChange, isTracked })` — обидва
    callbacks тепер дегенеровані).
  - `scripts/codemods/syncedKV/` (one-shot codemod, який мігрував
    `safeWriteLS(<tracked>, …) → safeWriteSyncedLS(…)` у PR #008 — нуль
    лишилось `safeWriteSyncedLS` callsites під `apps/web/src` для
    drift-check).
- **Files modified.**
  - `apps/web/src/core/cloudSync/index.ts` — drop `enqueueChange` /
    `notifySyncDirty` re-export, JSDoc оновлено.
  - 3 callsites переведено на raw `safeWriteLS`:
    `apps/web/src/core/onboarding/{cleanupDemoData,presetApply}.ts`
    (FINYK_MANUAL_EXPENSES, NUTRITION_LOG — обидва ключі вже не у
    `SYNC_MODULES` з PR #034/#039),
    `apps/web/src/core/profile/memoryBank.ts` (USER_PROFILE — все ще
    у tracked-key registry, але `enqueueChange` no-op + v2 op-log пише
    через `syncEngineWriter`, тож `safeWriteLS` достатньо).
  - `eslint.config.js` localStorage allowlist коментар оновлено
    (drops the carry-over note про `enqueue.ts` shim).
  - `apps/web/src/core/cloudSync/hook/useCloudSync.ts` — JSDoc
    "Removal: PR #052" → "Removal: roadmap Stage 7 follow-up after
    PR #053a".
  - `.tech-debt/localstorage-allowlist-budget.json` — rationale
    оновлено (production count = 6, fully reflects post-#053a state).
  - `scripts/codemods/README.md` — каталог оновлено: `syncedKV/` row
    замінено на _Removed_ note з посиланням на PR #053a.
  - `docs/architecture/data-exchange-storage-audit.md` §2.2 (web
    local-first sync v1) — наративний оновлення, що web `syncedKV` /
    `enqueueChange` шлях знесено.
- **Done criteria.**
  1. `pnpm lint` зелений (no-raw-local-storage allowlist не змінювався).
  2. `pnpm typecheck` зелений (5 callsites вже мали тип-сумісний
     `safeWriteLS` під рукою).
  3. `pnpm --filter @sergeant/web test` зелений; видалено 1 test file
     (`syncedKV.test.ts` — тестував поведінку видаленого `syncedKV`).
  4. Нульові `safeWriteSyncedLS` / `safeRemoveSyncedLS` references під
     `apps/web/src/**` (grep).
  5. ADR graph + governance-sync зелені (нічого не зачіпає, але CI має
     підтвердити).

#### **PR #053b — `chore(mobile): drop enqueueChange callsites in fizruk hooks`** ⏳ IN PR

- **Scope.** Mobile fizruk wave of PR #053 KVStore deprecate. Видаляє
  10 fizruk-hook call-sites `enqueueChange(STORAGE_KEY)` (no-op після
  PR #052c v1-engine sunset) і свопає `useMeasurements` з
  `useSyncedStorage` на raw `useLocalStorage`. Mobile-side
  `apps/mobile/src/sync/{enqueue,index,useSyncedStorage}.ts` shim
  тримається до PR #053c (nutrition + finyk + routine + dashboard /
  settings — 16 call-sites лишається).
- **Files modified (10 fizruk hooks).**
  - `useMonthlyPlan.ts` — drop import + 3 `enqueueChange(MONTHLY_PLAN_STORAGE_KEY)`.
  - `useCustomExercises.ts` — drop import + 1 call у `persist`; JSDoc оновлено.
  - `useFizrukWorkouts.ts` — drop import + 1 call у `persist`; JSDoc + 2 inline-коментарі оновлено.
  - `useActiveFizrukWorkout.ts` — drop import + 1 call у `setActiveWorkoutId`.
  - `useWorkoutTemplates.ts` — drop import + 1 call у `persist`; JSDoc оновлено.
  - `useDailyLog.ts` — drop import + 1 call у `persist`; JSDoc оновлено.
  - `useWellbeing.ts` — drop import + 1 call у `persist`; JSDoc + inline-коментар оновлено.
  - `usePlanTemplate.ts` — drop import + 1 call; JSDoc + return-doc оновлено.
  - `usePrograms.ts` — drop import + 1 call у `persist`.
  - `useMeasurements.ts` — `useSyncedStorage` → `useLocalStorage` (raw
    MMKV-backed hook без enqueue-callback hook), JSDoc-коментар
    оновлено. Single fizruk consumer of `useSyncedStorage`.
- **Files deleted (10 \*.enqueue.test.ts).** Тестували, що кожен мутатор
  кричить `enqueueChange` точно з потрібним ключем — контракт що тепер
  no-op. Вузли no-op-guard semantic-у (skip on `next === prev`) лишаються
  імпліцитно покритими hook-сирим contract-ом + продовжать тестуватися
  у sqliteOverlay-тестах.
  - `useActiveFizrukWorkout.enqueue.test.ts`
  - `useCustomExercises.enqueue.test.ts`
  - `useDailyLog.enqueue.test.ts`
  - `useFizrukWorkouts.enqueue.test.ts`
  - `useMeasurements.enqueue.test.ts`
  - `useMonthlyPlan.enqueue.test.ts`
  - `usePlanTemplate.enqueue.test.ts`
  - `usePrograms.enqueue.test.ts`
  - `useWellbeing.enqueue.test.ts`
  - `useWorkoutTemplates.enqueue.test.ts`
- **Files modified (tests).**
  - `useRecovery.test.ts` — drop unused `mockEnqueueChange` (recovery —
    pure computation hook, ніколи не писав).
- **Done criteria.**
  1. Нуль `enqueueChange` / `notifySyncDirty` / `useSyncedStorage`
     references під `apps/mobile/src/modules/fizruk/**` (grep).
  2. `pnpm lint` зелений.
  3. `pnpm typecheck` зелений.
  4. `pnpm --filter @sergeant/mobile test` зелений.
  5. governance-sync + ADR graph зелені.
- **Out of scope (для PR #053c).**
  - Mobile sync-engine writer-runtime wiring у boot-path (counterpart до
    web `apps/web/src/core/syncEngine/syncEngineWriter.ts` [#1953](https://github.com/Skords-01/Sergeant/pull/1953)).
  - Решта 16 mobile module-store call-sites: 5 nutrition hooks, 1
    routine, 3 finyk store-и, 5 dashboard / settings / observability,
    `apps/mobile/src/sync/{enqueue,index,useSyncedStorage}.ts` shim
    deletion + `apps/mobile/src/lib/storage.ts` allowlist budget.

#### **PR #053c — `chore(mobile): drop remaining enqueueChange callsites + delete sync shim`** ⏳ IN PR

- **Scope.** Mobile wave 2 of PR #053 KVStore deprecate. Завершує
  mobile-side cleanup: видаляє решту `enqueueChange` call-sites у
  nutrition / finyk / routine / settings stores, замінює `useSyncedStorage`
  на raw `useLocalStorage` у settings, і видаляє mobile sync-shim
  файли (`apps/mobile/src/sync/{enqueue,useSyncedStorage}.ts`) разом з
  їхніми re-export-ами з `sync/index.ts` барелю. Per-module SQLite
  dual-write адаптери
  (`apps/mobile/src/modules/{routine,fizruk,nutrition,finyk}/lib/dualWrite`)
  тепер відповідають за op-log v2 wiring без LS-key-watcher
  посередника.
- **Files modified (12 prod consumers).**
  - `apps/mobile/src/modules/routine/lib/routineStore.ts` — drop import
    - 13 `enqueueChange(ROUTINE_STORAGE_KEY)` calls (setRoutine,
      toggleHabit, bulkMarkDay, setCompletionNote, createHabit,
      updateHabit, setHabitArchived, deleteHabit, restoreHabit,
      moveHabitInOrder, setHabitOrder).
  - `apps/mobile/src/modules/nutrition/hooks/useNutritionLog.ts` — drop
    import + 1 call; JSDoc оновлено.
  - `apps/mobile/src/modules/nutrition/hooks/useNutritionPantries.ts` —
    drop import + 2 calls.
  - `apps/mobile/src/modules/nutrition/hooks/useNutritionPrefs.ts` —
    drop import + 1 call.
  - `apps/mobile/src/modules/nutrition/hooks/useWaterTracker.ts` — JSDoc
    only (water key local-only, не cloud-synced на жодній платформі).
  - `apps/mobile/src/modules/nutrition/lib/recipeBookStore.ts` — drop
    import + 2 calls (upsertSavedRecipe, removeSavedRecipe).
  - `apps/mobile/src/modules/nutrition/lib/nutritionStore.ts` — JSDoc
    оновлено (removed reference to `enqueueChange` / `useSyncedStorage`,
    pointer на dualWrite adapter).
  - `apps/mobile/src/modules/finyk/lib/transactionsStore.ts` — drop
    import + 5 calls (persist filters, hideTx, unhideTx,
    overrideCategory, setSplitTx, writeManual); JSDoc оновлено.
  - `apps/mobile/src/modules/finyk/lib/budgetsStore.ts` — drop import
    - 3 calls (setBudgets, setMonthlyPlan, setSubscriptions); JSDoc
      оновлено.
  - `apps/mobile/src/modules/finyk/lib/assetsStore.ts` — drop import
    - 4 calls (setManualAssets, setManualDebts, setReceivables,
      setHiddenAccounts).
  - `apps/mobile/src/core/settings/FinykSection.tsx` — `useSyncedStorage`
    → `useLocalStorage` (single settings consumer of `useSyncedStorage`
    after fizruk wave).
  - `apps/mobile/src/core/dashboard/useDashboardOrder.ts` — JSDoc only
    (removed reference до `useSyncedStorage` як до compared option).
  - `apps/mobile/src/lib/storage.ts` — JSDoc cloud-sync caveat block
    оновлено: видалено instructions про `useSyncedStorage`, додано
    pointer на per-module dualWrite adapter pattern.
  - `apps/mobile/src/sync/index.ts` — drop `useSyncedStorage` (line 34)
    - `enqueueChange` / `notifySyncDirty` (line 44) re-exports;
      JSDoc-барель переписано: surface зведено до 5 stub-ів
      (`useCloudSync`, `useSyncStatus`, `CloudSyncProvider`, контекст,
      types).
- **Files deleted (sync shim, 2).**
  - `apps/mobile/src/sync/enqueue.ts` (36 LOC, no-op since #052c).
  - `apps/mobile/src/sync/useSyncedStorage.ts` (69 LOC, wrapped no-op
    `enqueueChange` after `useLocalStorage` write).
- **Files deleted (4 \*.enqueue.test.\* + 1 routineStore.test.ts).**
  Тестували, що кожен мутатор кричить `enqueueChange` точно з потрібним
  ключем — контракт що тепер no-op (саме як з 10 fizruk \*.enqueue.test
  у PR #053b). Reducer-level no-op-guard тести (`next === prev`
  semantics) лишаються імпліцитно покритими через page-level
  integration-тести + reducer-tests у `@sergeant/routine-domain`.
  - `apps/mobile/src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts`
  - `apps/mobile/src/modules/finyk/lib/__tests__/budgetsStore.enqueue.test.ts`
  - `apps/mobile/src/modules/finyk/lib/__tests__/assetsStore.enqueue.test.ts`
  - `apps/mobile/src/core/settings/FinykSection.enqueue.test.tsx`
  - `apps/mobile/src/modules/routine/lib/__tests__/routineStore.test.ts`
    (cело — `enqueueChange wiring` describe-блок без альтернативного
    coverage-у; reducer-tests у `@sergeant/routine-domain` package
    залишаються джерелом істини).
- **Files modified (tests, 3).**
  - `apps/mobile/src/modules/nutrition/lib/__tests__/recipeBookStore.test.ts`
    — drop unused `mockEnqueue` + переіменовано "writes and enqueues sync"
    тест на "writes to MMKV under the saved-recipes key".
  - `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.test.tsx`
    — drop unused `jest.mock("@/sync/enqueue", ...)` block.
  - `apps/mobile/src/modules/finyk/pages/Budgets/BudgetsPage.test.tsx` —
    drop unused `jest.mock("@/sync/enqueue", ...)` block.
- **Done criteria.**
  1. Нуль `enqueueChange` / `notifySyncDirty` / `useSyncedStorage`
     references під `apps/mobile/src/**/*.{ts,tsx}` поза JSDoc
     historical comments (grep).
  2. `apps/mobile/src/sync/{enqueue,useSyncedStorage}.ts` фізично
     видалені.
  3. `pnpm lint` зелений.
  4. `pnpm typecheck` зелений.
  5. `pnpm --filter @sergeant/mobile test` зелений (модульні тести —
     full mobile suite має inherited unrelated failures, які
     підтверджені на main; fizruk + nutrition + finyk + routine + core
     зелені).
  6. governance-sync + ADR graph зелені.
- **Out of scope (наступні PR-и).**
  - Mobile sync-engine writer-runtime wiring у boot-path (counterpart до
    web `apps/web/src/core/syncEngine/syncEngineWriter.ts` [#1953](https://github.com/Skords-01/Sergeant/pull/1953))
    — окремий follow-up.
  - PR #054 final — 6 storage-primitive файлів на SQLite-backed
    `kv_store(key TEXT PK, value JSON)`, allowlist 6 → 0.

#### **PR #054 final — `chore(web): final localStorage burndown — eslint allowlist = []`** ✅ LANDED

> **Squash-merge на main:** commit
> [`5fdfcbe4`](https://github.com/Skords-01/Sergeant/commit/5fdfcbe4)
> (2026-05-06), **14 файлів, +497 / −276**. Один git commit, але
> всередині — **дев'ять переплетених sub-tasks**, які всі ламали б
> CI поодинці і тому залендили разом. Раніше у §3 цей PR знач��вся
> як ⏳ ROADMAP з 5-рядковим планом і одним абзацом про SQLite swap
> — реальність вийшла довшою, тому секція переписана нижче, щоб
> roadmap відображав, що насправді поїхало.

- **Сабтаск 1 — `KVStore.listKeys(): string[]` interface upgrade**
  (`packages/shared/src/storage/kv.ts`).
  Додано `listKeys` метод у `KVStore` interface і у всі **три**
  адаптери:
  - `createMemoryKVStore` → `Array.from(map.keys())`,
  - `createWebKVStore` → enumerate `Storage.length` + `Storage.key(i)`
    з graceful fallback на `[]` коли `length`/`key` відсутні
    (private mode, Node mocks),
  - `createMmkvKVStore` → делегує у `MMKV.getAllKeys()` через lazy
    `get()` resolver.

  Створено типовий boundary для `safeListLSKeys()` (раніше викликала
  `localStorage.length` напряму) — без цього №2–7 не могли б
  делегувати key-enumeration у `webKVStore`.

- **Сабтаск 2 — `createSyncedKVStore.listKeys` delegate**
  (`packages/shared/src/sync/syncedKV.ts`).
  Wrapper-фабрика, що обгортає базовий KVStore сигналом `onChange`
  для tracked keys. Раніше повертала `KVStore`-сумісний об'єкт без
  `listKeys` — типчек падав на `Property 'listKeys' is missing` у
  всіх споживачів. Додали `listKeys(): string[]` що делегує у
  `base.listKeys()` + парну спеку у
  `__tests__/syncedKV.test.ts`, що фіксує контракт.

- **Сабтаск 3 — `webKVStore` lazy-resolution refactor**
  (`apps/web/src/shared/lib/storage/storage.ts`). **Найкритичніший
  фікс — без нього 21 з 21 регрес-тестів падали.**
  Раніше модуль експортував `webKVStore` як module-level singleton,
  створений `createWebKVStore(window.localStorage, window)` на
  import-time. Vitest-node test suites поліфілять
  `globalThis.localStorage` всередині `beforeAll`/`beforeEach` —
  _після_ того як модуль вже імпортовано, тому singleton тримав
  stale reference на memory-fallback (бо в `--environment=node`
  `window.localStorage` undefined під час import-у). Writes через
  `webKVStore` ішли в memory, а тестові helper-и читали через
  `globalThis.localStorage.getItem(...)` з polyfill-у → парність 0.

  Розв'язали через `resolveStore()` лінивий resolver, що читає
  `globalThis.localStorage` (та `globalThis.window` як event
  target) **на кожен виклик** і повертає
  `createWebKVStore(...)` поверх свіжого reference. `webKVStore`
  тепер object-of-thunks — `getString`/`setString`/`remove`/
  `listKeys`/`onChange` всі делегують через `resolveStore()`.
  Memory fallback зберігається (для SSR + private-mode) і
  резолвиться кожного виклику.

  AST-верифікація eslint-rule:
  `packages/eslint-plugin-sergeant-design/index.js:385-410` —
  `no-raw-local-storage` тригериться на nested `MemberExpression`
  типу `globalThis.localStorage.foo`, але НЕ на single
  member-access типу `globalThis.localStorage` (який передається
  як arg у `createWebKVStore(...)`). Lazy-resolution pattern
  проходить eslint без allowlist entry-я.

- **Сабтаск 4–9 — 6 storage-primitive файлів делегують у
  `webKVStore`** замість прямого `localStorage.*`. Кожен — окремий
  логічний рефактор, який поодинці б одразу падав
  `no-raw-local-storage` (бо allowlist-entry для нього заплановано
  до видалення у сабтаску 11):
  - **#4** `apps/web/src/shared/lib/storage/storage.ts` — раніше
    hosting `safeReadLS`/`safeWriteLS`/`safeRemoveLS`/
    `safeReadLSValidated`/`safeReadStringLS`/`safeListLSKeys`
    обгортки з прямим `window.localStorage.*` доступом → тепер всі
    обгортки делегують у `webKVStore.{getString,setString,remove,
listKeys}`. (Цей файл також тепер експортує сам `webKVStore`
    як singleton-of-thunks.)
  - **#5** `apps/web/src/shared/lib/storage/storageManager.ts` —
    три migrations + ran-set bookkeeping (раніше читав/писав
    `__legacy_storage_migrations__` і per-migration результати
    напряму у LS) → тепер через `webKVStore`. Один регрес-фікс
    окремим сабтаском нижче (#10).
  - **#6** `apps/web/src/shared/lib/storage/storageQuota.ts` —
    `safeSetItem` (єдиний path, який має throw quota /
    private-mode setItem-помилки) переписано через rename-binding
    `const storage = window.localStorage` (eslint rule приймає
    одиночний MemberExpression), щоб setItem → setString-mapping
    зберіг семантику helper-а: caller розраховує отримати помилку
    коли LS повний — `safeJsonSet` будує над цим.
  - **#7** `apps/web/src/shared/lib/storage/typedStore.ts` —
    versioned typed store з cross-tab sync через `storage` event
    → reads/writes через `webKVStore.getString`/`setString`/
    `remove`, subscriptions через `webKVStore.onChange`.
  - **#8** `apps/web/src/shared/lib/storage/createModuleStorage.ts`
    — module-scoped helper-фабрика
    (`createModuleStorage('routine')` → `{get, set, remove, list,
subscribe}` з зашитим prefix-ом) → wrapper навколо
    `webKVStore`.
  - **#9** `apps/web/src/shared/hooks/useLocalStorageState.ts` —
    React hook (`[value, setValue] = useLocalStorageState(key,
default)`) → reads через `webKVStore`, write-back через
    `webKVStore.setString`, cross-tab sync через
    `webKVStore.onChange(key, ...)`.

- **Сабтаск 10 — Nutrition pantry migration regression fix**
  (у `storageManager.ts`).
  Migration #002 («nutrition: hoist legacy single pantry into
  multi-pantry shape») встановлювала
  `nutrition_active_pantry_id_v1 = "home"` через
  `safeJsonSet(ACTIVE_KEY, "home")`. `safeJsonSet` обгортає
  значення через `JSON.stringify`, тому raw string `"home"`
  ставав `'"home"'` на диску — а historical reader
  (`loadActivePantryId`) робить
  `localStorage.getItem(ACTIVE_KEY)` і очікує літеральний id
  назад, не JSON-encoded version. На main цей баг не вилазив бо
  тести юзали reset + ручний LS-setup; після переходу
  storageManager у `webKVStore` (де `setString` strict-string-only)
  vitest ловив parity issue. Fix: міграція тепер юзає
  `safeSetItem(ACTIVE_KEY, "home")` (не stringify-ить значення,
  але зберігає quota-error semantics щоб міграція лишилась
  re-runnable при private-mode failure). Коментар у коді
  пояснює invariant.

- **Сабтаск 11 — `eslint.config.js`
  `no-raw-local-storage.ignores` опускається 6 → 0 prod entries**
  (тільки `apps/web/src/**/*.test.{js,jsx,ts,tsx}` і
  `apps/web/src/**/__tests__/**` лишаються — fixture-и для
  testing-style storage-mock-ів).
  CI lint gate тепер ловить **навіть тривіальний**
  `localStorage.setItem('foo','bar')` у будь-якому prod-файлі.
  Додавання нового LS-callsite вимагає або проходження через
  `webKVStore`-boundary, або явного allowlist-entry-я (що буде
  дзвонити alarm bell у PR review).

- **Сабтаск 12 — `.tech-debt/localstorage-allowlist-budget.json`
  `production: 6 → 0`,** headroom 0 у обидва боки.
  `pnpm lint:localstorage-allowlist` зелений на 0/0.

- **Сабтаск 13 — `docs/tech-debt/frontend.md` §2
  («localStorage burndown — primitive callsites») закритий** —
  переведено у collapsible done-block з історією знесень
  (Stage 1 → Stage 7 → Stage 7 final).

- **Verification (на момент merge `5fdfcbe4`).**
  - `pnpm typecheck` — 16/16 tasks ✓
  - `pnpm --filter @sergeant/shared test` — 41 файл, 586 тестів ✓
  - `pnpm --filter @sergeant/web test` — 209 файлів, 2099 тестів ✓
    (storage-related: `storage.test.ts` 12, `typedStore.test.ts`
    14, `storageManager.test.ts` 15, `nutritionStorage.test.ts` 7
    — всі зелені)
  - `pnpm turbo run lint` — 0 errors
  - `pnpm lint:localstorage-allowlist` — 0/0 ✓ (production count
    6 → 0, headroom 0)

- **Out of scope — винесено у Stages 8 і 9.**
  Original Done criteria цього PR-у (ROADMAP-чернетка) включали
  тезу «6 storage-primitive файлів стають shim-ом над OPFS+SQLite
  (`webKVStore` → SQLite-backed table `kv_store(key TEXT PK,
value JSON)`)». Та редакція об'єднувала **дві** ортогональні
  ініціативи:
  1. _eslint allowlist = []_ (boundary через `webKVStore`) —
     закрито у цьому PR-і;
  2. _SQLite-backed `kv_store` impl_ (warm-cache, async init
     race, kvvfs cycle на iOS<16.4) — re-scoped в **Stage 9**
     нижче;
  3. _8 sqlite_v2 фіч-флагів default → on_ + drop LS-safety-net
     writes/reads у 4 модулях — re-scoped в **Stage 8** нижче.

  Поточний `webKVStore` лишається LS-backed, але через єдиний
  KVStore-boundary тепер можна свопнути impl-ацію в одному місці
  без зачіпання 6 споживачів — і саме тому Stage 9 окремо стає
  можливим.

- **Dep.** Усі попередні Stage 7 PR-и (#051+#052a, #052b, #052c,
  #053a, #053b, #053c) — без них tracked-key реєстр + cloudSync
  v1 enqueue-call-sites досі писали б у LS поза
  `webKVStore`-boundary, і refactor-ить storage-primitive-и не
  мало сенсу.

---

### Stage 8 — SQLite cut-over rollout

> **Status:** 🚧 IN PROGRESS (11/17). Stage 7 закрив **boundary** (eslint
> allowlist = [], 6 storage-primitive-ів делегують у `webKVStore`,
> KVStore interface повний). Stage 8 — це **operational rollout**:
> переводимо 8 `feature.{routine,fizruk,nutrition,finyk}.sqlite_v2.*`
> прапорців з `defaultValue: false` (opt-in, experimental) у
> `defaultValue: true` (default-on), потім видаляємо LS-safety-net
> писання і LS-reader-оверлеї у 4 модулях.
>
> **Landed (post-2026-05-06):**
>
> - Dual-write default-on quartet — Routine [#2133](https://github.com/Skords-01/Sergeant/pull/2133)
>   (PR #055r1), Fizruk [#2135](https://github.com/Skords-01/Sergeant/pull/2135)
>   (PR #055f1), Nutrition + Finyk + Finyk Mono mirror
>   [#2178](https://github.com/Skords-01/Sergeant/pull/2178)
>   (PR #055n1 + PR #055k1).
> - PR #058 mobile sync-engine writer-runtime boot path landed у
>   [#2118](https://github.com/Skords-01/Sergeant/pull/2118) alongside
>   CloudSync v1 client cleanup.
> - Stage 8 dual-write telemetry sink
>   ([`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4)) —
>   `apps/web/src/core/observability/dualWriteTelemetry.ts` Sentry
>   sink that powers the `<m>.sqlite.dualwrite.*` decision-gate
>   metrics; consumed by Routine `dualWrite/index.ts` + Finyk `dualWrite/index.ts`.
>
> **Re-rolled out (post-2026-05-08):** read-default-on quartet flipped
> back to `defaultValue: true` per-module after the PWA-canary fix
> landed — Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
> (PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
> (PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251)
> (PR #055n2), Finyk (`24616449`, PR #055k2). Initial slice
> [#2179](https://github.com/Skords-01/Sergeant/pull/2179) had been rolled
> back by [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
> (`2735fa75`) after a PWA habit-input regression — see risk
> register §5 row.
>
> **Routine flag-gating drop:** PR #056r landed with revised scope
> (drop `feature.routine.sqlite_v2.dual_write` flag-gating only, not
> the LS-write callsite — Routine SQLite schema gap; див. footnote)
> у commit
> [`ff852475`](https://github.com/Skords-01/Sergeant/commit/ff852475)
> (`chore(web,mobile): drop Routine dual-write feature-flag gating`).
>
> **Stage 8 §3 parity probe:** Routine module wired у
> [#2243](https://github.com/Skords-01/Sergeant/pull/2243)
> (`4ea2c952`) — `apps/web/src/modules/routine/lib/dualWrite/parity.ts`
> records `<m>.sqlite.dualwrite.parity` decision-gate metric.
> Fizruk / Nutrition / Finyk parity-probe wiring — pending focused
> follow-up PRs (Stage 8 §3 quartet).

> **Чому окрема Stage:** roadmap-у §3 раніше тримав цей блок як
> implicit «Stage 4 follow-up» в out-of-scope-секціях кожного
> per-module PR-а (PR #025/#026 для routine, аналогічно для
> fizruk/nutrition/finyk). Реальність — це 16+ PR-ів на 4 модулі ×
> 4 кроки, плюс mobile sync-engine writer-runtime wiring і shared
> telemetry — окрема Stage з власною таблицею прогресу і decision
> gate-ом точніше відображає шлях.

**Шаблон 4 PR-ів на модуль:**

| Крок | PR title shape                                                  | Що робить                                                                                                                                                                                 | Telemetry / canary gate                                                                              |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | `feat(<m>): default-on feature.<m>.sqlite_v2.dual_write`        | Перемкнути `defaultValue: false → true` у `apps/{web,mobile}/src/core/lib/featureFlags.ts`. LS-write шлях лишається authoritative; SQLite-write — best-effort fire-and-forget.            | `<m>.sqlite.dualwrite.error_rate ≤ 0.1%` за 7 днів. `<m>.sqlite.dualwrite.parity ≥ 99.9%` row-count. |
| 2    | `feat(<m>): default-on feature.<m>.sqlite_v2.read_sqlite`       | Перемкнути read-flag у default-on. Reads ідуть з SQLite з LS-overlay-fallback на miss. LS-write залишається active як safety net.                                                         | `<m>.sqlite.read.fallback` counter = 0 за 14 днів. UI smoke OK.                                      |
| 3    | `chore(<m>): remove LS-write safety net`                        | Видалити `localStorage.setItem` шлях у module storage layer (`<m>Storage.ts` / `<m>Store.ts`). Видалити dual-write helper (`triggerXyzDualWrite`) і feature flag (вже unconditional-on).  | Жодних `LS-write` подій у Sentry breadcrumbs за 14 днів. SQLite write error rate ≤ 0.05%.            |
| 4    | `chore(<m>): drop LS reader paths + tombstone STORAGE_KEYS.<M>` | Видалити `loadXyzState()` LS-overlay reader. Зняти модуль зі `STORAGE_KEYS` (або позначити `@deprecated tombstone`). One-time bootstrap migration читає residual LS → SQLite на 1-й boot. | LS-key counter = 0 у новому install. Existing users — read-residual + delete на boot.                |

**Per-module roadmap:**

#### **Routine (4 PR-и)**

##### **PR #055r1 — `feat(routine): default-on feature.routine.sqlite_v2.dual_write`** ✅ LANDED ([#2133](https://github.com/Skords-01/Sergeant/pull/2133))

- Flip `defaultValue: false → true` у обох
  `apps/{web,mobile}/src/core/lib/featureFlags.ts` (рядки
  `feature.routine.sqlite_v2.dual_write`).
- Landed via `df514265 feat(web): default-on routine dual-write flag`
  on 2026-05-06.
- Telemetry: `routine.sqlite.dualwrite.error_rate` (Sentry tag) +
  parity counter `routine.sqlite.dualwrite.parity` (web side у
  `triggerRoutineDualWrite` finally-block) — wired via
  [`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4)
  `dualWriteTelemetry.ts` sink.
- **Done criteria.** 7 днів proden у default-on без error-spike.
- **Risk.** Quota errors у power users з ~5+ MB SQLite даних.
  Mitigation: catch + tag без mute, dev panel у Settings →
  Експериментальне.
- **Dep.** PR #024 (boot wiring) — landed.

##### **PR #055r2 — `feat(routine): default-on feature.routine.sqlite_v2.read_sqlite`** ✅ LANDED ([#2244](https://github.com/Skords-01/Sergeant/pull/2244))

- Flip read-flag default-on. Reads ідуть з SQLite через
  `apps/{web,mobile}/src/modules/routine/lib/sqliteReader.ts` з
  LS-overlay-fallback на cache miss.
- Telemetry: `routine.sqlite.read.fallback` (counter, must be 0
  steady state).
- **Status.** Initial roll-out shipped у
  [#2179](https://github.com/Skords-01/Sergeant/pull/2179) (Routine +
  Fizruk read default-on, `07f306e1`) and was reverted by
  [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
  (`2735fa75 fix(web): restore pwa habit input stability`) after a
  PWA habit-input regression on installed-PWA Routine users.
  Re-rolled out per-module after the PWA-canary fix landed —
  Routine read-flag flipped back to `defaultValue: true` у
  [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
  (`feat(web,mobile): flip Routine read_sqlite default-on`).
- **Done criteria.** 14 днів без `read.fallback`. UI smoke
  (toggle entry, streak rendering, week view) OK на staging
  **AND** installed-PWA habit-input regression closed (немає
  Sentry events для `routine.pwa.habit_input.*` за 7 днів).
- **Dep.** PR #055r1 (default-on dual_write) — landed; +
  PWA-canary stability gate (додана у risk register
  §5 після #2179 incident; closed by #2244 re-rollout).

##### **PR #056r — `chore(routine): drop dual-write feature-flag gating`** ✅ LANDED (`ff852475`)

> **Re-interpretation note (2026-05-08).** The original Phase 4 plan
> for #056r was "drop LS-write safety net" — i.e. delete the
> `localStorage.setItem(STORAGE_KEYS.ROUTINE, …)` callsite in
> `saveRoutineState`. That literal reading is **not safe** for
> Routine because the SQLite schema (`packages/db-schema/src/sqlite/routine.ts`)
> only covers `routine_entries` (completions + denormalised habit
> name) and `routine_streaks` (server-driven aggregates). Seven of
> the eight fields in `RoutineState` — `habits`, `tags`,
> `categories`, `prefs`, `pushupsByDate`, `habitOrder`,
> `completionNotes` — are **LS/MMKV-only** and would be silently
> lost on every `saveRoutineState` if the LS write were dropped
> today.[^routine-schema-gap]
>
> **Revised scope:** drop only the feature-flag gating layer (the
> `feature.routine.sqlite_v2.dual_write` flag itself plus the
> `isEnabled()` callback on `RoutineDualWriteContext`). LS/MMKV-write
> remains as the **primary** writer for the seven non-completion
> fields (and as a safety mirror for the one field that is in SQLite
> too). The completion-mirror to `routine_entries` becomes
> unconditional whenever a dual-write context is registered. A full
> Routine SQLite cut-over (drop LS-write entirely) is **deferred to
> a future stage** — see Stage 10 candidate footnote below.

- Drop `feature.routine.sqlite_v2.dual_write` from
  `apps/{web,mobile}/src/core/lib/featureFlags.ts` (and from the
  governance registry in `docs/governance/feature-flags.md`).
- Drop `isEnabled()` from `RoutineDualWriteContext` interface plus
  the corresponding `if (!ctx.isEnabled()) → "flag-off"` skip-logic
  in `dualWriteRoutineState()`. Remove `"flag-off"` from
  `DualWriteOutcome.reason` union.
- Drop `isFlagEnabled` from `BootRoutineDualWriteInput` and the
  `useFlag(FLAG_ID)` / `getFlag(FLAG_ID)` reads in
  `useRoutineDualWriteBoot`. The hook now boots dual-write
  unconditionally as soon as `userId` is known.
- **Out of scope (revised, was in original):**
  `localStorage.setItem(STORAGE_KEYS.ROUTINE, …)` and
  `triggerRoutineDualWrite()` STAY. Routine LS-write is still the
  source-of-truth for non-completion fields.
- **Done criteria.** Flag entry gone from registries. CI grep gate
  proves no remaining references to
  `feature.routine.sqlite_v2.dual_write` outside roadmap/changelog.
  Existing `dualwrite.routine.*` Sentry tags continue to populate
  with `applied`/`skipped(reason)` buckets identical to pre-merge
  shape (minus `flag-off`).
- **Dep.** PR #055r2 (read default-on; ≥ 14 днів стабільно is no
  longer enforced — dev-stage, no users).

[^routine-schema-gap]:
    **Routine SQLite schema gap.** Unlike Fizruk
    / Nutrition / Finyk (which mirror every LS/MMKV key into
    normalised SQLite tables and so can drop LS-write outright per
    PR #056f / #056n / #056k), Routine's PR #022 SPIKE was
    deliberately narrow: only completions and streaks live in
    SQLite. `habits[]`, `tags[]`, `categories[]`, `prefs{}`,
    `pushupsByDate{}`, `habitOrder[]`, `completionNotes{}` are
    **not** part of the SQLite schema, and the dual-write `diff.ts`
    only emits `completion-add` / `completion-remove` /
    `habit-rename` ops. Until the schema gap is closed (see Stage
    10 candidate below), dropping Routine LS-write is silent
    data-loss.

##### **Stage 10 candidate — extend Routine SQLite schema to full LS coverage** 📋 PROPOSED

- New SQLite tables (`routine_habits`, `routine_tags`,
  `routine_categories`, `routine_prefs`, `routine_pushups`,
  `routine_habit_order`, `routine_completion_notes`) + Drizzle
  schemas + sequential migration (per Hard rule #4).
- Extend `dualWrite/diff.ts` to emit ops for habit-create /
  habit-update / habit-archive / habit-delete / habit-restore /
  tag-create / tag-update / tag-delete / category-create /
  category-update / category-delete / pref-set / pushup-add /
  habit-order-set / completion-note-set.
- New parity probe + read-path adapter, then a real PR #056r-bis
  (or PR #056r-final) that **does** drop the
  `localStorage.setItem(STORAGE_KEYS.ROUTINE, …)` callsite.
- Until then, Routine remains LS-primary / SQLite-mirror for
  non-completion fields.

##### **PR #057r — `chore(routine): drop LS reader paths + tombstone STORAGE_KEYS.ROUTINE`** 📋 ROADMAP

- Drop `loadRoutineState()` LS-read overlay у `routineStorage.ts`.
- Tombstone `STORAGE_KEYS.ROUTINE` (`@deprecated tombstone — read
via SqliteReader`).
- Boot-time one-time read-residual: якщо `localStorage[ROUTINE]`
  існує AND SQLite empty → bulk-import → delete LS key.
- **Done criteria.** `eslint-plugin-sergeant-design`
  tracked-keys-list зменшується на 1 entry. CI grep gate проти
  `STORAGE_KEYS.ROUTINE` reads-у поза boot-import-helper-ом.
- **Dep.** PR #056r (LS-write removed) ≥ 14 днів стабільно.

#### **Fizruk (4 PR-и)** — структура ідентична

- **PR #055f1** ✅ LANDED ([#2135](https://github.com/Skords-01/Sergeant/pull/2135),
  `e86f42b3 feat(web): default-on fizruk dual-write flag` +
  `39b71008 docs(docs): link fizruk rollout pr`) — default-on
  `feature.fizruk.sqlite_v2.dual_write`.
- **PR #055f2** ✅ LANDED ([#2247](https://github.com/Skords-01/Sergeant/pull/2247)) — default-on
  `feature.fizruk.sqlite_v2.read_sqlite`. Initial roll-out у
  [#2179](https://github.com/Skords-01/Sergeant/pull/2179) (Routine +
  Fizruk read default-on, `07f306e1`); reverted by
  [#2181](https://github.com/Skords-01/Sergeant/pull/2181)
  (`2735fa75`); re-rolled out у
  [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
  (`feat(web,mobile): flip Fizruk read_sqlite default-on`) після
  PWA-canary stability re-verify.
- **PR #056f** — drop LS-safety-net writes (`fizruk_workouts`,
  `fizruk_custom_exercises`, `fizruk_measurements`).
- **PR #057f** — drop LS readers + tombstone `STORAGE_KEYS.FIZRUK_*`.

#### **Nutrition (4 PR-и)** — структура ідентична

- **PR #055n1** ✅ LANDED ([#2178](https://github.com/Skords-01/Sergeant/pull/2178),
  `b33cf6a4 feat(shared): advance storage rollout`) — default-on
  `feature.nutrition.sqlite_v2.dual_write` (web + mobile defaults on).
- **PR #055n2** ✅ LANDED ([#2251](https://github.com/Skords-01/Sergeant/pull/2251)) —
  default-on `feature.nutrition.sqlite_v2.read_sqlite`
  (`feat(web,mobile): flip Nutrition read_sqlite default-on`).
  Re-rolled out квартет після PWA-canary stability re-verify
  (Nutrition read-flag не залендив у первинному #2179, тож тут
  це primary roll-out, не re-rollout).
- **PR #056n** — drop LS-safety-net writes (`nutrition_meals`,
  `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`,
  `nutrition_recipes`).
- **PR #057n** — drop LS readers + tombstone `STORAGE_KEYS.
NUTRITION_*`. Зняти стару migration `storageManager #002`
  (legacy single pantry → multi pantry), бо residual-import
  bootstrap покриє цей переїзд.

#### **Finyk (4 PR-и)** — структура ідентична

- **PR #055k1** ✅ LANDED ([#2178](https://github.com/Skords-01/Sergeant/pull/2178),
  `b33cf6a4 feat(shared): advance storage rollout`) — default-on
  `feature.finyk.sqlite_v2.dual_write` + `feature.finyk.sqlite_v2.mono_mirror`
  (web + mobile defaults on). Mono-mirror table set
  (`finyk_mono_transactions`, `finyk_mono_accounts`,
  `finyk_mono_account_snapshots`) populated по `mono_time` LWW;
  consumed by `apps/web/src/modules/finyk/lib/monoMirror.ts` +
  `apps/web/src/modules/finyk/lib/dualWrite/index.ts`.
- **PR #055k2** ✅ LANDED (`24616449`) — default-on
  `feature.finyk.sqlite_v2.read_sqlite`
  (`feat(web,mobile): flip Finyk read_sqlite default-on`,
  commit-only PR landed inline with the read-default-on
  re-rollout квартета). PWA-canary stability re-verify closed.
- **PR #056k** — drop LS-safety-net writes (14 finyk\_\* keys —
  `finyk_hidden_accounts`, `finyk_hidden_transactions`,
  `finyk_budgets`, `finyk_subscriptions`, `finyk_assets`,
  `finyk_debts`, `finyk_receivables`, `finyk_custom_categories`,
  `finyk_manual_expenses`, `finyk_tx_categories`, `finyk_tx_splits`,
  `finyk_mono_debt_links`, `finyk_networth_history`, `finyk_prefs`)
  - 3 mono cache LS-keys (`finyk_tx_cache`, `finyk_info_cache`,
    `finyk_tx_cache_last_good`).
- **PR #057k** — drop LS readers + tombstone `STORAGE_KEYS.FINYK_*`.

#### **PR #058 — `feat(mobile): wire sync-engine writer-runtime in boot path`** ✅ LANDED

- Mobile counterpart до web `apps/web/src/core/syncEngine/syncEngineWriter.ts`
  ([#1953](https://github.com/Skords-01/Sergeant/pull/1953)).
- Landed у [#2118](https://github.com/Skords-01/Sergeant/pull/2118)
  alongside CloudSync v1 client cleanup. Boot path:
  `apps/mobile/app/_layout.tsx`; singleton:
  `apps/mobile/src/core/syncEngine/singleton.ts`; runtime:
  `apps/mobile/src/core/syncEngine/syncEngineWriter.ts`.
- Mobile-сторона більше не є read-only stub: `useSyncStatus` читає
  v2 writer status, а boot path стартує push-loop після storage
  bootstrap. Це знімає hard-blocker для mobile-частини PR #056\*,
  але module rollout gates нижче лишаються обов'язковими.
- **Out-of-scope-таск** з PR #053c (line 2530-2532, "Mobile
  sync-engine writer-runtime wiring у boot-path... — окремий
  follow-up") закрито в PR #2118.

#### **PR #058a — `feat(web): add Stage 8 dual-write telemetry sink`** ✅ LANDED ([`ff92dbb4`](https://github.com/Skords-01/Sergeant/commit/ff92dbb4))

- Adds `apps/web/src/core/observability/dualWriteTelemetry.ts`
  Sentry sink (`recordDualWriteOutcome`) consumed by Routine
  (`apps/web/src/modules/routine/lib/dualWrite/index.ts`) and Finyk
  (`apps/web/src/modules/finyk/lib/dualWrite/index.ts`) dual-write
  pipelines, plus `monoMirror.ts` write-path. Powers the
  `<m>.sqlite.dualwrite.error_rate` /
  `<m>.sqlite.dualwrite.parity` decision-gate metrics referenced у
  PR #055\*1 + decision-gate-таблиці нижче.
- Не несе власного PR-номера у GitHub squash history (commit-only).
- **Out-of-scope:** Fizruk + Nutrition dual-write pipelines
  (`fizrukStorage.ts`, `nutritionStorage.ts`) не повністю
  під'єднані до `recordDualWriteOutcome` — own follow-up
  inside PR #056f / PR #056n cleanup wave (LS-write removal
  потребує цей telemetry hook як safety-net guard).

**Active rollout state:** Stage 8 default-on dual-write тепер покриває
Routine, Fizruk, Nutrition, Finyk і Finyk Mono mirror на web + mobile
(квартет PR #055\*1 — landed via #2133/#2135/#2178). Read-default-on
квартет re-rolled out per-module after PWA-canary fix landed:
Routine [#2244](https://github.com/Skords-01/Sergeant/pull/2244)
(PR #055r2), Fizruk [#2247](https://github.com/Skords-01/Sergeant/pull/2247)
(PR #055f2), Nutrition [#2251](https://github.com/Skords-01/Sergeant/pull/2251)
(PR #055n2), Finyk (`24616449`, PR #055k2). Усі 4 read-flag-и now
`defaultValue: true` у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
Stage 8 dual-write telemetry sink (`ff92dbb4`) wired для Routine +
Finyk + Finyk Mono. Stage 8 §3 parity probe wired у Routine
([#2243](https://github.com/Skords-01/Sergeant/pull/2243), `4ea2c952`)
— Fizruk / Nutrition / Finyk parity-probe wiring pending. PR #056r
landed with revised scope (drop dual-write feature-flag gating only;
Routine SQLite schema gap blocks LS-write removal — див. footnote)
у commit `ff852475`. Наступні rollout-кроки лишаються gated на
canary: drop LS/MMKV write safety net (PR #056f / #056n / #056k —
14d canary вікно на #055\*2) → drop legacy readers + tombstone
`STORAGE_KEYS.*` (PR #057\* quartet — 14d canary вікно на #056\*).

#### **Decision gate (Stage 8 → Stage 9).**

| Метрика                                              | Pass                  | Fail                        |
| ---------------------------------------------------- | --------------------- | --------------------------- |
| `<m>.sqlite.dualwrite.error_rate` (Sentry, 14 днів)  | ≤ 0.1% per module     | ≥ 0.5% — pause #055\*2      |
| `<m>.sqlite.read.fallback` (counter, post-#055\*2)   | 0 steady state        | > 0 — investigate, rollback |
| Total LS-write events per session (post-#056\*)      | ≤ 5 (only auth + ack) | > 10 — find missed callsite |
| `STORAGE_KEYS` enum entries (post-#057\*)            | ≤ 3 (auth + flags)    | > 5 — missed tombstone      |
| Bundle size delta after Stage 8 (web)                | ≤ -8 KB net           | > +5 KB — check tree-shake  |
| Mobile sync-engine writer-runtime active (post-#058) | yes                   | no — block #056\*           |

#### **Calendar.**

- 4 модулі × 4 кроки = 16 PR-ів кодом (~3 тижні чистого coding на
  1 FTE).
- Між кроками 1↔2 і 2↔3 — _≥ 7 і ≥ 14 днів_ canary spec-ів.
- **Total wall-clock:** 2-3 місяці (rollout-watching паралельно
  з Stage 9).

---

### Stage 9 — KV store swap (`webKVStore` → SQLite-backed `kv_store`)

> **Status:** ✅ COMPLETE (7/7). PRs #060–#066 всі landed:
> PR #060 ([#2155](https://github.com/Skords-01/Sergeant/pull/2155) `kv_store` SQLite table),
> PR #061 ([#2157](https://github.com/Skords-01/Sergeant/pull/2157) `createSqliteKVStore` warm-cache adapter),
> PR #062 ([#2159](https://github.com/Skords-01/Sergeant/pull/2159) web `bootstrapKvStore()`),
> PR #063 ([#2165](https://github.com/Skords-01/Sergeant/pull/2165) `webKVStore` swap),
> PR #064 ([#2168](https://github.com/Skords-01/Sergeant/pull/2168) drop LS mirror),
> PR #065 ([#2170](https://github.com/Skords-01/Sergeant/pull/2170) mobile KV mirror swap, commit `66a799bf`),
> PR #066 (`createMemoryKVStore` moved to `@sergeant/shared/test-utils`; web memory fallback is app-local).
> Це той самий «SQLite-backed
> `kv_store(key TEXT PK, value JSON)`» який original PR #054 final
> тезу обіцяв, але ніколи не входив у Done criteria цього PR-у.
> Виноситься у власну Stage, бо технічно нетривіальний — async
> SQLite init vs sync `KVStore.getString` API + кругова
> залежність kvvfs ↔ localStorage на iOS Safari < 16.4 (де SQLite
> сам сидить у LS, тому put-ити LS-data у SQLite, що сидить у LS,
> = circular).

**Цільова інфра.**

- Нова таблиця `kv_store(key TEXT PRIMARY KEY, value TEXT NOT NULL,
updated_at INTEGER NOT NULL)` у `packages/db-schema/src/sqlite/`.
- Boot-time warm-cache: `await sqlite.select().from(kvStore)` →
  `Map<string, string>`. Cache populates _до_ App-render
  (синхронний `getString` має повертати committed reads — тому
  warm-cache блокує boot до завершення SQLite init).
- Sync `getString(key)` → `cache.get(key) ?? null`.
- Sync `setString(key, value)` → `cache.set(key, value)` _плюс_
  fire-and-forget `sqlite.insert().onConflictDoUpdate({ key, value,
updated_at: Date.now() })`. Async-write enqueue-ується через
  op-log retry queue для durability.
- `onChange(key, listener)` працює через `BroadcastChannel`
  (cross-tab) + локальну sub-list.

**PR plan.**

#### **PR #060 — `feat(db-schema): add kv_store SQLite table + client migration`** 🚧 IN FLIGHT ([#2155](https://github.com/Skords-01/Sergeant/pull/2155))

- Drizzle SQLite schema у `packages/db-schema/src/sqlite/kvStore.ts`:
  ```ts
  export const kvStore = sqliteTable("kv_store", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  });
  ```
- Inline міграція у `packages/db-schema/src/sqlite/migrations/`
  - manifest entry.
- Postgres counterpart **НЕ потрібний** — `kv_store` суто
  client-local (per-device key-value, без sync-у на сервер;
  для cross-device prefs далі юзаємо нормалізовані модульні
  таблиці).
- **AC.** `pnpm --filter @sergeant/db-schema test` — passes;
  schema snapshot test покриває нову таблицю.
- **Out-of-scope.** Жодних змін у `webKVStore` impl-ації — це
  схема-only PR.

#### **PR #061 — `feat(shared): add createSqliteKVStore + warm-cache`** 🚧 IN FLIGHT ([#2157](https://github.com/Skords-01/Sergeant/pull/2157))

- New KVStore adapter у `packages/shared/src/storage/kv.ts` (поряд
  з `createMemoryKVStore`/`createWebKVStore`/`createMmkvKVStore`):
  ```ts
  export function createSqliteKVStore(deps: {
    sqlite: SqliteMigrationClient;
    boot: { warmCache: Map<string, string>; loaded: boolean };
    crossTab?: BroadcastChannelLike;
  }): KVStore;
  ```
- `getString` — sync read з `boot.warmCache`. Якщо
  `boot.loaded === false` → throw `KVStoreNotReadyError` (caller
  має зачекати boot).
- `setString` — sync update warm-cache + async write-back до
  SQLite через op-log queue.
- `listKeys` — sync `Array.from(boot.warmCache.keys())`.
- `onChange` — local list + `BroadcastChannel`-based cross-tab
  signal.
- **Tests** (`__tests__/sqliteKv.test.ts`) — boot-sequence,
  fallback на init failure, write-coalesce, BC stress test.
- **Dep.** PR #060.

#### **PR #062 — `feat(web): bootstrap warm-cache + LS→kv_store one-time migration`** 🚧 IN FLIGHT ([#2159](https://github.com/Skords-01/Sergeant/pull/2159))

- New `apps/web/src/core/db/kvStoreBoot.ts`:
  ```ts
  export async function bootstrapKvStore(): Promise<{
    warmCache: Map<string, string>;
    loaded: true;
  }>;
  ```
- Boot sequence:
  1. SQLite init (existing `apps/web/src/core/db/sqlite.ts`).
  2. Read `kv_store` → populate `warmCache`.
  3. Якщо `kv_store` empty AND `localStorage` non-empty AND
     migration flag (`kv_store_migrated_v1`) not set →
     bulk-import all LS keys → upsert до `kv_store` → set flag.
  4. Subscribe to `BroadcastChannel('kv-store')` для cross-tab.
- App entry (`main.tsx`) await-ить bootstrap до `<App />` mount.
- **Failure-mode**: SQLite init throw → render fallback UI +
  Sentry alarm; `webKVStore` лишається LS-backed (через
  `resolveStore()` ladder додається `if (!boot.loaded) → return
webLsKv`).
- **Dep.** PR #061.

#### **PR #063 — `feat(web): swap webKVStore impl from localStorage to SQLite-backed kv_store`** 🚧 IN FLIGHT ([#2165](https://github.com/Skords-01/Sergeant/pull/2165))

- Refactor `apps/web/src/shared/lib/storage/storage.ts ::
resolveStore()` — пріоритет 1: SQLite warm-cache (якщо
  `boot.loaded`); пріоритет 2: web LS adapter (fallback); пріоритет
  3: memory fallback (SSR/private mode).
- LS залишається як live mirror на 4 тижні (writes йдуть і в
  SQLite, і в LS) — щоб revert-нути PR без втрати юзер-даних.
- Telemetry: `kvstore.backend` tag (`sqlite | ls-fallback | memory`)
  - `kvstore.boot.duration_ms` histogram.
- **Done criteria.** SQLite backend у > 99% sessions після
  bootstrap-у на staging.
- **Dep.** PR #062.

#### **PR #064 — `chore(web): drop LS mirror in webKVStore (SQLite-only)`** ✅ LANDED ([#2168](https://github.com/Skords-01/Sergeant/pull/2168))

- Після 4 тижнів post-#063 без telemetry-incident-ів: drop LS
  mirror writes. `webKVStore` тепер strictly SQLite-backed (з
  memory fallback на init failure).
- Drop одноразової LS→kv_store migration (вже не треба).
- Removed `makeDualWriteKvStore()` — `resolveStore()` returns
  SQLite directly. Two-rung ladder: SQLite → LS-only fallback → memory.
- Restored original PR #062/063 JSDoc in `kvStoreBoot.ts` and
  `storage.ts` (pre-PR-#064 state with LS migration + dual-write).
- Updated `storage.dualwrite.test.ts` to verify LS is NOT mirrored.
- **Done criteria.** `kvstore.backend === "ls-fallback"` rate
  ≤ 0.1% за 14 днів.
- **Dep.** PR #063 + 4 тижні стабільного потоку.

#### **PR #065 — `feat(mobile): mirror — swap mobile webKVStore-equivalent onto SQLite-backed kv_store`** ✅ LANDED — [#2170](https://github.com/Skords-01/Sergeant/pull/2170)

- Mobile counterpart до PR #061-#064. Mobile вже використовує
  `createMmkvKVStore` (через `react-native-mmkv`) — Stage 9 на
  mobile = swap MMKV → SQLite-backed `kv_store`.
- New `apps/mobile/src/core/db/kvStoreBoot.ts` — mobile bootstrap
  pump: expo-sqlite init → kv_store migration → warm-cache scan →
  one-time MMKV→kv_store import → `createSqliteKVStore`.
- Dual-write pattern: SQLite primary + MMKV mirror for canary
  safety (PR #066 drops the mirror).
- `_layout.tsx` calls `bootstrapMobileKvStore()` after encrypted
  storage bootstrap, before sync-engine writer boot.
- MMKV native bundle (~80 KB) можна прибрати з app shell після
  cut-over — bundle saving + один менший native dep maintenance
  burden.
- **Risk.** MMKV — synchronous + faster (~µs); SQLite через
  `expo-sqlite` — синхронний на native side, але через JSI bridge
  має ~ms latency. Warm-cache pattern компенсує.
- **Dep.** PR #064.

#### **PR #066 — `chore(shared): drop createMemoryKVStore from prod shipping (tests-only)`** ✅ LANDED

- `createMemoryKVStore` винесено з production runtime barrel у
  `@sergeant/shared/test-utils`.
- Shared tests імпортують memory store з test-utils; production web/mobile
  code не імпортує його з `@sergeant/shared`.
- Web SSR/private-mode fallback лишився app-local memory adapter у
  `apps/web/src/shared/lib/storage/storage.ts`, щоб не втратити runtime
  resilience.

#### **Stage 9 hotfix tail (post-canary, 2026-05-07 → 2026-05-08).**

Production Sentry surfaced `SQLITE_ERROR: no such table: sync_op_outbox`
on installed-PWA users where the boot-path race left the outbox in a
partial-migration state after PR #063 (`webKVStore` swap). Five
hotfixes landed to harden the boot path; root-cause + decision tree
are documented у `docs/audits/2026-05-07-app-audit.md` §A1.

| Commit                                                                                         | PR                                                       | What it fixes                                                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`3f40a27e`](https://github.com/Skords-01/Sergeant/commit/3f40a27e) (alias `ac840eda` on main) | [#2192](https://github.com/Skords-01/Sergeant/pull/2192) | `fix(web): run outbox migrations at sync engine boot` — guarantees `sync_op_outbox` exists before enqueue. |
| [`7bc3b2f3`](https://github.com/Skords-01/Sergeant/commit/7bc3b2f3)                            | follow-up commit                                         | `fix(web): hotfix kvStoreBoot import + ESLint guard against db-schema/migrate umbrella`.                   |
| [`ba6cb113`](https://github.com/Skords-01/Sergeant/commit/ba6cb113)                            | [#2199](https://github.com/Skords-01/Sergeant/pull/2199) | `fix(web): self-heal sqlite outbox from partial 002 migration` — `repairPartialOutboxMigration` helper.    |
| [`ce4fb145`](https://github.com/Skords-01/Sergeant/commit/ce4fb145)                            | follow-up commit                                         | `fix(web): tag sync_op_outbox boot outcome in Sentry` — boot outcome breadcrumb for monitoring.            |
| [`316ef626`](https://github.com/Skords-01/Sergeant/commit/316ef626)                            | [#2201](https://github.com/Skords-01/Sergeant/pull/2201) | `fix(web): resolve app audit hotfixes` — bundle of audit §A1–A4 closures.                                  |
| [`12090d00`](https://github.com/Skords-01/Sergeant/commit/12090d00)                            | [#2220](https://github.com/Skords-01/Sergeant/pull/2220) | `fix(web): make localStorage writable in Vitest setup + close audit items 1-4` — audit follow-up.          |
| [`dcd31e02`](https://github.com/Skords-01/Sergeant/commit/dcd31e02)                            | follow-up commit                                         | `fix(web): route typedStore writes through webKVStore for SQLite consistency`.                             |

These commits are part of the Stage 9 boot-path resilience layer
(post-#063) but are not new PRs in the #060–#066 plan. They
strengthen the same swap rather than extending it. Tracked у audit
§A appendix; no new Stage 9 plan-row required.

#### **Risk register для Stage 9.**

| Ризик                                                                                       | Likelihood | Impact | Mitigation                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| SQLite init fails на iOS Safari < 16.4 (kvvfs fallback) → boot blocks                       | Medium     | High   | Fallback ladder: SQLite → web LS adapter → memory. Telemetry на real fallback rate.              |
| Warm-cache miss race: setItem-then-getItem у одному tick до flush                           | Low        | Medium | Sync update warm-cache **перед** async-write до SQLite — read-after-write consistency garantied. |
| BroadcastChannel doesn't fire між tabs у Safari Private mode                                | Low        | Low    | Fallback на localStorage `storage` event як signal-only (не для data).                           |
| One-time LS→kv_store migration ламається на 5+ MB user (LS quota error на read-then-import) | Low        | Medium | Idempotent batch-import (50 keys per batch); resume from migration flag.                         |
| Async write-back queue overflow під offline + heavy write пресс                             | Low        | Medium | Queue cap (1000 ops); dropping LRU з Sentry alarm.                                               |
| Drizzle `.onConflictDoUpdate` має edge-case bug на Safari WASM                              | Low        | Medium | Fallback на raw SQL (`INSERT OR REPLACE`).                                                       |

#### **Calendar.**

- 5 PR-ів × ~3 дні per PR + ~4 тижні canary post-#063 = **2 місяці
  wall-clock** (1 FTE кодом ~2 тижні + рest — telemetry-watching).

---

## 4. Зміни інфраструктури (cross-PR)

| Що                                                                                       | Де                                       | Коли                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` | `vercel.json`                            | Stage 2, PR #016                              |
| Self-hosted fonts                                                                        | `apps/web`                               | Stage 2, PR #017                              |
| Expo dev-client rebuild (expo-sqlite native)                                             | EAS Build                                | Stage 2, PR #018                              |
| Capacitor mobile-shell — iOS WKWebView OPFS check (16.4+)                                | `apps/mobile-shell`                      | Stage 3 SPIKE, fallback на IDB-VFS для старих |
| Railway: Redis addon                                                                     | Railway dashboard                        | Stage 6, PR #045                              |
| Railway: pgBouncer service                                                               | Railway                                  | Stage 6, PR #046                              |
| Railway: read replica                                                                    | Railway production tier                  | Stage 6, PR #047                              |
| Sentry release tracking з sync-engine version                                            | `apps/web/src/core/sentry.ts`            | Stage 5, PR #040                              |
| GitHub Actions: weekly backup-verify cron                                                | `.github/workflows/db-backup-verify.yml` | Stage 6, PR #049                              |
| Bundle-budget bump для sqlite-chunk (lazy)                                               | `apps/web/package.json` `size-limit`     | Stage 2, PR #015                              |

---

## 5. Risk register

| Ризик                                                                                                    | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPFS не вмикається через CORP-проблеми (Google Fonts, OAuth popup, Vercel Analytics)                     | Medium     | High   | Self-host fonts (PR #017), test all 3rd-party під CORP заздалегідь, fallback на IDB-VFS                                                                                                                                                                                                                                                                                                                                   |
| iOS WKWebView (Capacitor mobile-shell) на iOS<16.4 не підтримує OPFS                                     | High       | Medium | Fallback IDB-VFS; довгостроково — мігрувати mobile-shell users на native Expo app                                                                                                                                                                                                                                                                                                                                         |
| `expo-sqlite` SDK 52 native rebuild ламає custom dev-client                                              | Medium     | High   | Rebuild dev-client на feature branch перед merge, test на TestFlight/internal track                                                                                                                                                                                                                                                                                                                                       |
| Drizzle на mobile/SQLite має edge-case bugs                                                              | Low        | Medium | Fallback на raw SQL з типами через `@types`; Drizzle для server-only якщо що                                                                                                                                                                                                                                                                                                                                              |
| Backfill з module_data в нормалізовані таблиці провалюється для деяких юзерів (corrupted JSONB)          | Medium     | High   | Idempotent backfill з lookup-by-user; fallback skip + log; manual fix per case                                                                                                                                                                                                                                                                                                                                            |
| Bundle size growth ламає mobile WebView performance                                                      | Low        | Medium | Lazy chunk strategy (PR #015), bundle-budget CI gate                                                                                                                                                                                                                                                                                                                                                                      |
| CRDT bugs у routine streak (PR #042) дають wrong-counter                                                 | Medium     | High   | Shadow mode 4 тижні: пишемо паралельно LWW і CRDT, порівнюємо в Sentry                                                                                                                                                                                                                                                                                                                                                    |
| Vercel COEP ламає Better Auth Google OAuth popup                                                         | Medium     | High   | Test перед PR #016; fallback на same-tab redirect flow                                                                                                                                                                                                                                                                                                                                                                    |
| Railway PG instance не витримує op-log throughput                                                        | Low        | High   | Stage 6 read-replica + partition                                                                                                                                                                                                                                                                                                                                                                                          |
| Read-default-on PWA habit-input regression (installed PWA Routine users) — repeats on #055\*2 re-rollout | Medium     | High   | Pre-rollout PWA stability gate: 7 днів без Sentry events `routine.pwa.habit_input.*` after [#2181](https://github.com/Skords-01/Sergeant/pull/2181) (`2735fa75`); then re-flip via single-module slice (Routine first, hold 7 днів, then Fizruk/Nutrition/Finyk).                                                                                                                                                         |
| Stage 9 boot-path partial migration (`sync_op_outbox` not found post-#063) → dual-write pipeline crashes | Medium     | High   | Self-heal `repairPartialOutboxMigration` ([#2199](https://github.com/Skords-01/Sergeant/pull/2199), `ba6cb113`) + run outbox migrations at sync engine boot ([#2192](https://github.com/Skords-01/Sergeant/pull/2192), `3f40a27e`) + Sentry boot-outcome tag (`ce4fb145`); audit hotfix bundle ([#2201](https://github.com/Skords-01/Sergeant/pull/2201), `316ef626`). Detail у §A `docs/audits/2026-05-07-app-audit.md`. |

---

## 6. Decision gates / off-ramps

- **Після Stage 0 (тиждень 2):** review — security-debt closed. Можна
  зупинитись тут якщо команда має інші пріоритети. Архітектура не
  погіршилась.
- **Після Stage 1 (тиждень 6):** review — drift-баг закрито, KVStore єдиний,
  IDB-консолідовано, LS-burndown done. **Можна зупинитись на Stage 1**
  якщо ризик SQLite-міграції здається завеликим. Все ще приблизно 60% impact
  від повного roadmap.
- **Після Stage 2 (тиждень 9):** ✅ **PASSED (2026-05-02).** Drizzle працює,
  sqlite-wasm ленді, OPFS infra на Vercel налаштована, op-log sync v2
  ендпоінти задеплоєні. **Decision: чи йдемо у SPIKE — PENDING.**
- **Після Stage 3 SPIKE (тиждень 11):** **HARD GATE.** Якщо SPIKE fail-ить
  pass-criteria — STOP. Документуємо learnings, повертаємось до Stage 1+
  без SQLite. Якщо pass — full GO.
- **Після кожного модуля у Stage 4:** review conflict-rate, latency
  на проді. Якщо метрики деградують — паузу на наступному модулі.
- **Stage 5 (CRDT) — опційний.** Можна засіяти коли core міграція стабільна.

---

## 7. Метрики успіху (post-rollout)

| Метрика                               | Baseline (зараз)                  | Target                                              |
| ------------------------------------- | --------------------------------- | --------------------------------------------------- |
| Push p95 latency                      | ~800ms (LWW whole-blob)           | ≤ 250ms (per-row diff)                              |
| Conflict rate (per push)              | ~3-5% (whole-blob LWW collisions) | ≤ 0.5%                                              |
| Cold-start TTI (web installed PWA)    | ~1.2s                             | ≤ 0.5s (warm SQLite)                                |
| Storage cap encounter rate            | unknown, але >0 у power users     | 0 (нема cap)                                        |
| Cross-device toggle latency (routine) | до 60s (next sync cycle)          | ≤ 2s (SSE pull)                                     |
| LS-write count per user-session       | ~50                               | ≤ 5 (тільки Better Auth cookies + warm-cache flags) |
| Mono PAT plaintext leak risk          | high (LS+MMKV+server)             | 0 (server-only after PR #002)                       |
| Tech-debt items у `storage` категорії | ~12                               | 0                                                   |

---

## 8. Перші кроки (якщо approve)

Якщо план approve — починаємо так:

1. ~~**Тиждень 1:** PR #001 (MMKV encryption) + PR #002 (FINYK_TOKEN cleanup) +
   PR #004 (query-cache excludes). Це security-quick-wins, низький ризик.~~
2. ~~**Тиждень 2:** PR #003 (webhook rotation) + PR #005 (sync_audit) +
   review Stage 0.~~
3. ~~**Тиждень 3-6:** Stage 1 (Consolidation). PR #006 → #013.~~ ⏳ Майже готово — закриті: #006, #007, #009, #010 (open у #1543), #011, #012, #013. **Лишився тільки PR #008** (storagePatch → `useSyncedKVStore`).
4. ~~**Тиждень 7:** Перший draft RFC у `docs/rfcs/2026-q3-sqlite-migration.md`
   з фіксованими decision criteria для SPIKE.~~
5. ~~**Тиждень 8-9:** Stage 2 (Foundation) — найризикованіша частина в плані
   bundle/CORP/iOS-compat.~~ ✅ **Stage 2 завершено (2026-05-02).** Усі 8 PR-ів (#014–#021) landed.
6. **Тиждень 10-11:** SPIKE. Hard decision gate. ← **ЗАКРИВАЄТЬСЯ ЗАРАЗ.**
   Library + dev panels + automated gates landed; залишився operator
   pass на real hardware (iOS Safari 16.4+, multi-device toggle vs
   staging) перед фінальним go/no-go. Деталі — у
   [`docs/notes/spikes/routine-sqlite-v2.md`](../notes/spikes/routine-sqlite-v2.md#decision-gate-metrics).

---

## 9. Зв'язок з існуючим тех-боргом

| Існуючий debt-item                              | Закривається у         |
| ----------------------------------------------- | ---------------------- |
| `frontend.md §2 — localStorage burndown`        | Stage 1 (PR #006-#013) |
| `frontend.md §X — sync drift web vs mobile`     | Stage 1, PR #007       |
| `backend.md §Y — in-memory rate-limit`          | Stage 1, PR #011       |
| `backend.md §Z — module_data CHECK constraint`  | Stage 1, PR #012       |
| `frontend.md — IDB consolidation`               | Stage 1, PR #010       |
| `MMKV TODO(security)` (inline в коді)           | Stage 0, PR #001       |
| `whole-blob LWW не масштабується` (новий entry) | Stage 4                |
| `MAX_OFFLINE_QUEUE = 50 dropping payloads`      | Stage 1, PR #009       |
| `query-persister leak sensitive data`           | Stage 0, PR #004       |

Tech-debt docs оновлюються в кожному PR що закриває item — це вже в guardrail
(`scripts/check-tech-debt-freshness.mjs`).

---

## Підсумок

**Загальний effort: ~30-40 PR-ів, 7-8 місяців calendar з 0.5-1 FTE.**

Якщо команда хоче довести систему до prod-ready без SQLite-rewrite — **достатньо
Stage 0 + Stage 1 (6 тижнів)**. Це закриє security-debt і drift-баги, дасть ~60%
impact.

Якщо ціль — **повна довгострокова архітектура** (більше даних, multi-device без
collisions, scalability на N power-users) — Stage 2-7 у послідовному порядку
з hard-gate після SPIKE.

Я б порадив:

1. **Approve Stage 0 зараз** — починаємо з PR #001 на цьому тижні.
2. **Stage 1 в наступному циклі планування** — поки ще без commitment до SQLite.
3. **RFC + SPIKE як окрема ініціатива на Q3** — гейт через decision criteria.
