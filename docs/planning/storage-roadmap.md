# Storage & Sync — Roadmap до production-ready

> **Last validated:** 2026-05-04 by Devin — **Stage 1 COMPLETE, Stage 4 Finyk read-overlay in CI.** Stage 1: all 8/8 PRs landed (PR #008 `ff217246`, PR #010 [#1543](https://github.com/Skords-01/Sergeant/pull/1543), PR #013 via 4 sub-PRs). Stage 4 Fizruk: 5/5 PRs merged (PR #027–#030 + #029a). Stage 4 Nutrition: PR #031 / #032 / #033 LANDED ([#1574](https://github.com/Skords-01/Sergeant/pull/1574)), PR #034 LANDED ([#1636](https://github.com/Skords-01/Sergeant/pull/1636)). Stage 4 Finyk: PR #035 LANDED ([#1667](https://github.com/Skords-01/Sergeant/pull/1667) — schema + apply-fns), PR #036 LANDED ([#1680](https://github.com/Skords-01/Sergeant/pull/1680) — dual-write web + mobile), PR #037 IN CI (read-overlay web + mobile under `feature.finyk.sqlite_v2.read_sqlite`, default off). Stage 0: PR #003 LANDED ([#1497](https://github.com/Skords-01/Sergeant/pull/1497)). Boot-wiring follow-up для `register{Routine,Fizruk,Nutrition}DualWriteContext` ще не залендили. **Next review:** 2026-08-01.
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

#### **PR #003 — `feat(server): persist Mono webhook secret rotation worker`**

- **Scope.** Cron-job (Railway scheduled task) який раз на 90 днів ротує
  `mono_connection.webhook_secret_hash`. Endpoint `/api/v1/mono/webhook/rotate`.
- **Risk.** Проґавити вікно ротації — Mono webhook відмовляє. Mitigation:
  alert у Sentry якщо secret > 100 днів.
- **AC.** Unit-test ротації; integration-test mono-mock.
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
  далі зелені. Ручна перевірка міграції живої бази робиться на наступному
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

#### **PR #022 — `feat(spike): routine module on SQLite — proof of concept`** ⏳ IN-PROGRESS (closure PR відкрито 2026-05-02)

> **Статус (2026-05-02):** library + dev panels + automated decision-gate
> measurements landed. Closure PR — `devin/1777755997-close-routine-sqlite-spike`.
> SPIKE pre-decision: **conditionally GO** — bundle delta = 0 KB і local
> build-time proxy ≈ 19 s обидва PASS із запасом; лишилося три
> hardware-pending перевірки (first-open latency, OPFS на iOS Safari 16.4+,
> multi-device toggle), для яких dev panel уже виставляє всі
> метрики — потрібен лише operator pass. Деталі та operator runbook
> у [`docs/notes/spikes/routine-sqlite-v2.md`](../notes/spikes/routine-sqlite-v2.md#decision-gate-metrics).

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

##### **PR #033 — `feat(nutrition-domain): cut-over reads to SQLite under feature flag`** ⏳ IN PROGRESS — [#1574](https://github.com/Skords-01/Sergeant/pull/1574)

> **Статус (2026-05-03):** read-overlay library files implemented for
> both web and mobile (6 new files). UI overlay hooks (wiring into
> existing nutrition hooks under feature flag
> `feature.nutrition.sqlite_v2.read_sqlite`) — pending next PR.

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
- **Що ще треба (наступний PR).**
  - Web: UI overlay у nutrition хуках (`useMeals`, `usePantries`,
    `useNutritionPrefs`, `useRecipes`) під feature flag — аналог
    fizruk `useFizrukWorkouts` / `useCustomExercises` overlay.
  - Mobile: аналогічний UI overlay + `useNutritionSqliteReadBoot`
    виклик у Dashboard/module entry.
  - Feature flag `feature.nutrition.sqlite_v2.read_sqlite` реєстрація
    у `apps/{web,mobile}/src/core/lib/featureFlags.ts`.
- **Dep.** PR #032.

##### **PR #034 — `chore(nutrition-domain): drop module_data.nutrition cloud-sync wiring + ESLint guard`** ⏳ DRAFT

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

##### **PR #035 — `feat(finyk-domain): Drizzle SQLite + Postgres normalized tables + server apply-fns`** ⏳ DRAFT (in CI — [#1667](https://github.com/Skords-01/Sergeant/pull/1667))

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

##### **PR #036 — `feat(finyk-domain): dual-write LS/MMKV↔SQLite`** ⏳ DRAFT (in CI — TBD)

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

##### **PR #037 — `feat(finyk-domain): cut-over reads to SQLite under feature flag`** ⏳ IN CI

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

##### **PR #038 — `feat(finyk-domain): client-side Mono cache mirror in SQLite`** ⏳ DRAFT

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

##### **PR #039 — `chore(finyk-domain): drop module_data.finyk cloud-sync wiring + ESLint guard`** ⏳ DRAFT

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
