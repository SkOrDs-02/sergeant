# Storage & Sync — Roadmap до production-ready

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
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
| **1. Consolidation**        | Один KVStore, один SYNC_MODULES, IDB consolidated, LS-burndown finished. Без SQLite.                              | 4 тижні   | 1 FTE      | Stop тут = просто чистіша поточна архітектура, ще без SQLite.         |
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

#### **PR #001 — `chore(mobile): MMKV encryption with SecureStore-derived key`**

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

#### **PR #002 — `feat(server): rotate Mono PAT to backend-only flow, drop FINYK_TOKEN from sync keys`**

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

#### **PR #003 — `feat(server): persist Mono webhook secret rotation worker`**

- **Scope.** Cron-job (Railway scheduled task) який раз на 90 днів ротує
  `mono_connection.webhook_secret_hash`. Endpoint `/api/v1/mono/webhook/rotate`.
- **Risk.** Проґавити вікно ротації — Mono webhook відмовляє. Mitigation:
  alert у Sentry якщо secret > 100 днів.
- **AC.** Unit-test ротації; integration-test mono-mock.
- **Dep.** None.

#### **PR #004 — `feat(web): exclude sensitive query keys from IDB persister`**

- **Scope.** `apps/web/src/shared/lib/queryClientPersister.ts`:
  додати `dehydrateOptions.shouldDehydrateQuery` exclude list для
  `/api/coach/*`, `/api/me/finance/balance`, `/api/sync/*`, `/api/auth/*`.
- **Mirror.** Ті самі exclusions у `apps/mobile/src/sync/persister/mmkvPersister.ts`.
- **AC.** Vitest snapshot перевіряє що дегідрований стан не містить
  `coach`/`balance` query-keys. CI gate.
- **Dep.** None.

#### **PR #005 — `feat(server): sync_audit_log table + admin-only viewer`**

- **Scope.** Нова таблиця `sync_audit_log (id, user_id, op_type, module,
payload_size, conflict, created_at)`. Запис у `syncPushAll`/`syncPullAll`
  поряд з метриками. Admin endpoint для перегляду (Better Auth role).
- **Migration.** `023_sync_audit_log.{sql,down.sql}`.
- **AC.** Postgres-test, RLS перевірка (юзер не бачить чужі логи),
  performance — index `(user_id, created_at DESC)`.
- **Dep.** None.

---

### Stage 1 — Consolidation

#### **PR #006 — `refactor(shared): unified KVStore with platform adapters`**

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

#### **PR #007 — `refactor(shared): single SYNC_MODULES registry`**

- **Scope.** Винести `SYNC_MODULES` з `apps/web/src/core/cloudSync/config.ts`
  - `apps/mobile/src/sync/config.ts` у `packages/shared/src/sync/modules.ts`.
    **Закриває drift-баг** (зараз mobile знає ключі, яких нема у web → blob
    на сервері перетирає mobile-only дані порожнім).
- **AC.** Snapshot test що web і mobile bundle мають однакові keys per module.
- **Dep.** PR #006.

#### **PR #008 — `refactor(web): replace localStorage.setItem monkey-patch with explicit writeAndEnqueue`**

- **Scope.** Замість `storagePatch.ts` — explicit hook `useSyncedKVStore`
  у `packages/shared`. Усі writes у sync-tracked keys йдуть через нього.
- **Codemod.** Скрипт що знаходить `safeWriteLS(STORAGE_KEYS.X, …)` де
  X у sync-keys і замінює на `syncedKV.setString(...)`.
- **Risk.** Місця де writes ідуть прямо в `localStorage.setItem` (allowlist
  у `eslint.config.js`) — треба пройтись по них вручну.
- **AC.** Видалити `__hubSyncPatched` глобал. Test: write у sync-key триґерить
  push без monkey-patch.
- **Dep.** PR #006, #007.

#### **PR #009 — `refactor(web): move sync metadata + offline queue to IDB`**

- **Scope.** `SYNC_VERSIONS`, `SYNC_DIRTY_MODULES`, `SYNC_OFFLINE_QUEUE`
  переходять з LS у IDB (через `idb-keyval`). Знімає 5–10 MB cap для
  offline queue.
- **Bonus.** `MAX_OFFLINE_QUEUE` піднімається з 50 до ~10 000.
- **AC.** E2E-тест: 200 offline-операцій → online → сервер отримав усі.
- **Dep.** PR #007, #008.

#### **PR #010 — `refactor(web): consolidate 4 IDB databases into 1 sergeant-db`**

- **Scope.** Зараз: `sergeant-rq-cache`, `hub_nutrition_recipe_book`,
  `hub_nutrition_meal_photos`, `hub_nutrition_food_db`. Зливаємо в одну
  `sergeant` з 4 object-stores. Один schema-version registry. `rq-cache`
  лишається окремо тільки якщо buster-логіка реально несумісна.
- **Migration.** Idempotent open-and-copy на cold-boot. Видалити старі бази
  після успіху.
- **AC.** Vitest-fake-indexed-db покриває миграцію + rollback.
- **Dep.** None (паралельно зі #009).

#### **PR #011 — `feat(server): replace in-memory rate-limit with Postgres-backed sliding window`**

- **Scope.** `apps/server/src/http/rateLimit.ts` — переписати на
  Postgres (нова таблиця `rate_limit_buckets`) з sliding-window-counter.
  Опційно через Railway Redis addon (ENV flag).
- **Migration.** `024_rate_limit_buckets.{sql,down.sql}`.
- **Risk.** Latency — кожен request +1 SQL roundtrip. Mitigation:
  pg-pool warm + `IF NOT EXISTS` upsert; для Redis-варіанту atomic
  Lua-script.
- **AC.** Load test: 100 RPS × 10 min — limiter працює стабільно.
  Horizontal-scale тест на 2 інстанціях Railway.
- **Dep.** None.

#### **PR #012 — `feat(server): add CHECK constraint on module_data.module + soft-delete columns`**

- **Scope.** Додати `CHECK (module IN ('finyk','fizruk','routine','nutrition','profile'))`
  на `module_data`. Додати `deleted_at TIMESTAMPTZ` на high-volume tables
  (mono_transaction, push_subscriptions, ai_usage_daily, sync_audit_log).
- **Migration.** `025_module_check_and_soft_delete.{sql,down.sql}`.
- **AC.** Bad-data test: insert невідомого модуля → reject.
- **Dep.** None.

#### **PR #013 — `chore: complete localStorage burndown to 0 raw uses`**

- **Scope.** Останні ~46 файлів з allowlist у `eslint.config.js`. Перевести
  через `useSyncedKVStore` або `safeReadLS/safeWriteLS`. Allowlist → empty.
- **Risk.** Великий діф. Mitigation: розбити на 3 sub-PR-и по доменах.
- **AC.** ESLint `no-raw-local-storage` без exceptions, CI green.
- **Dep.** PR #006-#008.

---

### Stage 2 — Foundation для SQLite ✅ COMPLETE

> **Статус:** Усі 8 PR-ів (#014–#021) зленділи станом на 2026-05-02.
> Наступний крок — Stage 3 SPIKE (decision gate: go/no-go для SQLite).

#### **PR #014 — `feat: add Drizzle ORM as cross-platform schema source of truth`** ✅ LANDED — [#1290](https://github.com/Skords-01/Sergeant/pull/1290)

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

#### **PR #022 — `feat(spike): routine module on SQLite — proof of concept`** ⏳ IN-PROGRESS (DRAFT, time-boxed 2 weeks)

> **Статус:** PR відкрито 2026-05-02 у гілці `devin/1777743313-spike-routine-sqlite-v2`.
> Поточний стан — бібліотечний шар повністю готовий і покритий тестами,
> dev-UI panel і інтеграція в `RoutineApp` лишилися як follow-up частина
> цього ж SPIKE-у. Декізіон-гейт перевірятиметься після того, як UI
> підключений хоча б одній платформі.

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

##### **PR #023 — `feat(routine): Drizzle schema + SQLite migration files`** ⏳ IN-PROGRESS

> **Статус (2026-05-02):** PR відкрито у гілці
> `devin/1777757976-routine-sqlite-pr-023-schema`. Скоп — pure schema
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

##### **PR #024 — `feat(routine): dual-write LS↔SQLite behind feature flag`**

- Кожен write йде у LS (старий path) + у SQLite (новий path) синхронно.
- Read залишається з LS. Recoverable якщо SQLite ламається.
- Feature flag `feature.routine.sqlite_v2.dual_write` — gradual rollout
  через PostHog-cohort.

##### **PR #025 — `feat(routine): cut-over reads to SQLite, deprecate LS`**

- Read йде з SQLite. LS-write залишається на 2 тижні як safety net.
- Sync `module_data.routine` blob більше не оновлюється з клієнта.
- Server-side: backfill повторно для юзерів що не онлайн були під час
  rollout-у.

##### **PR #026 — `chore(routine): remove LS path, drop module_data.routine`**

- Видалити routine з `SYNC_MODULES`. Server: `DELETE FROM module_data WHERE module='routine'`.
- ESLint guard проти reads з `STORAGE_KEYS.ROUTINE`.

#### **Fizruk** (3 тижні) — PR #027–#030

#### **Nutrition** (3 тижні) — PR #031–#034

#### **Finyk** (4 тижні) — PR #035–#039 (один extra PR на Mono mirror на клієнті)

---

### Stage 5 — Sync engine v2 hardening

#### **PR #040 — `feat(sync): persistent op-log in SQLite with retry policy`**

- Scope. Op-log живе в SQLite (зараз in-memory). Retry з exponential
  backoff, dead-letter після N=10 failures.
- AC. Crash recovery: kill app → restart → unsent ops дойдуть.

#### **PR #041 — `feat(sync): real-time pull via Server-Sent Events`**

- Scope. `GET /v2/sync/stream` — SSE з push-нотифікаціями про нові op-log
  entries для цього юзера. Eliminates polling.
- AC. Multi-tab/multi-device test: зміна на одному девайсі ≤ 2s до іншого.
- Risk. Express+Vercel: SSE на serverless має edge-case з timeout. Mitigation:
  Keep-alive heartbeat 25s; reconnect on close.

#### **PR #042 — `feat(sync): per-row CRDT for routine_entries (PN-counter for streak)`**

- Scope. `routine_streaks.current_streak` стає PN-counter (positive/negative
  counter), не просто Int. Конкурентний toggle з двох девайсів дає коректний
  стрик.

#### **PR #043 — `feat(sync): G-set CRDT for nutrition_meals log`**

- Scope. `nutrition_meals` — append-only G-set. Видалення через
  tombstone (`deleted_at`) + LWW per-row.

#### **PR #044 — `feat(sync): conflict resolution UI for finyk_manual_expenses`**

- Scope. Для finyk деякі конфлікти користувач має побачити (наприклад
  edit одної транзакції з двох девайсів). Показуємо merge-UI.

---

### Stage 6 — Operational maturity

#### **PR #045 — `feat(infra): Railway Redis addon for rate-limit + sync queue`**

- Scope. Опційно — якщо Postgres rate-limit з PR #011 показав latency-issue
  на масштабі. Redis для buckets + pub/sub для SSE.

#### **PR #046 — `feat(server): pgBouncer connection pooling`**

- Scope. Railway не дає pgBouncer з коробки — деплоїмо окремий Railway
  service з `edoburu/pgbouncer`. ENV-перемикач `DATABASE_URL_POOL`.
- AC. Стабільні з'єднання при 200 concurrent users.

#### **PR #047 — `feat(server): Postgres read replica for analytics queries`**

- Scope. Railway production-tier — окремий read-replica. `growth_*`,
  `seo_*` queries ідуть туди.
- AC. Lag < 5s на p99.

#### **PR #048 — `feat(observability): sync health Grafana/Sentry dashboard`**

- Scope. Дашборд з RED (p50/p95/p99 push-latency, conflict rate, queue depth,
  op-log throughput per user). Алерти: conflict rate > 5%, queue depth > 100,
  push p99 > 5s.

#### **PR #049 — `feat(ops): backup/restore runbook + weekly verify CI`**

- Scope. Документувати full-restore-from-backup для Railway Postgres.
  GitHub Action раз на тиждень: restore latest dump на staging + smoke-test
  schema integrity. Failures → PagerDuty.

#### **PR #050 — `feat(ops): module_data partition + archival`**

- Scope. Партиція по `client_updated_at` (range monthly). Архівувати старші
  3 місяці у cold-storage (S3-compatible, Backblaze B2).

---

### Stage 7 — Cleanup

#### **PR #051 — `chore: drop module_data table after all modules migrated`**

- Migration `999_drop_module_data.{sql,down.sql}`. Тільки після
  4 модулів в Stage 4 + 30-day burn-in.

#### **PR #052 — `chore: remove cloudSync v1 engine (storagePatch, dirty tracking, offline queue)`**

- Видаляється `apps/web/src/core/cloudSync/` + `apps/mobile/src/sync/`
  старі файли. Лишається тільки v2 (op-log).

#### **PR #053 — `chore: deprecate KVStore in favor of SQLite-backed cache`**

- KVStore залишається тільки для маленьких прапорців і Better Auth cookies.
  Все інше — SQLite. Update tech-debt docs.

#### **PR #054 — `chore: final localStorage burndown — eslint allowlist = []`**

- Останні exceptions у `eslint.config.js` видаляються. CI gate.

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

| Ризик                                                                                           | Likelihood | Impact | Mitigation                                                                              |
| ----------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------- |
| OPFS не вмикається через CORP-проблеми (Google Fonts, OAuth popup, Vercel Analytics)            | Medium     | High   | Self-host fonts (PR #017), test all 3rd-party під CORP заздалегідь, fallback на IDB-VFS |
| iOS WKWebView (Capacitor mobile-shell) на iOS<16.4 не підтримує OPFS                            | High       | Medium | Fallback IDB-VFS; довгостроково — мігрувати mobile-shell users на native Expo app       |
| `expo-sqlite` SDK 52 native rebuild ламає custom dev-client                                     | Medium     | High   | Rebuild dev-client на feature branch перед merge, test на TestFlight/internal track     |
| Drizzle на mobile/SQLite має edge-case bugs                                                     | Low        | Medium | Fallback на raw SQL з типами через `@types`; Drizzle для server-only якщо що            |
| Backfill з module_data в нормалізовані таблиці провалюється для деяких юзерів (corrupted JSONB) | Medium     | High   | Idempotent backfill з lookup-by-user; fallback skip + log; manual fix per case          |
| Bundle size growth ламає mobile WebView performance                                             | Low        | Medium | Lazy chunk strategy (PR #015), bundle-budget CI gate                                    |
| CRDT bugs у routine streak (PR #042) дають wrong-counter                                        | Medium     | High   | Shadow mode 4 тижні: пишемо паралельно LWW і CRDT, порівнюємо в Sentry                  |
| Vercel COEP ламає Better Auth Google OAuth popup                                                | Medium     | High   | Test перед PR #016; fallback на same-tab redirect flow                                  |
| Railway PG instance не витримує op-log throughput                                               | Low        | High   | Stage 6 read-replica + partition                                                        |

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
3. ~~**Тиждень 3-6:** Stage 1 (Consolidation). PR #006 → #013.~~
4. ~~**Тиждень 7:** Перший draft RFC у `docs/rfcs/2026-q3-sqlite-migration.md`
   з фіксованими decision criteria для SPIKE.~~
5. ~~**Тиждень 8-9:** Stage 2 (Foundation) — найризикованіша частина в плані
   bundle/CORP/iOS-compat.~~ ✅ **Stage 2 завершено (2026-05-02).** Усі 8 PR-ів (#014–#021) landed.
6. **Тиждень 10-11:** SPIKE. Hard decision gate. ← **НАСТУПНИЙ КРОК**

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
