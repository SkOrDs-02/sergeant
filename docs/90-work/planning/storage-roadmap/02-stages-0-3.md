# Storage & Sync — PR-плани: Stage 0–3 (Security, Consolidation, Foundation, SPIKE)

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Overview](./01-overview.md) · [→ Stage 4](./03-stage-4.md)

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
  у [../../../../apps/server/src/routes/internal/mono.ts](../../../../apps/server/src/routes/internal/mono.ts);
  логіка у [../../../../apps/server/src/modules/mono/rotateSecret.ts](../../../../apps/server/src/modules/mono/rotateSecret.ts);
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

#### **PR #022 — `feat(spike): routine module on SQLite — proof of concept`** ✅ CLOSED / ARCHIVED — initial SPIKE landed [#1366](https://github.com/Skords-01/Sergeant/pull/1366); SPIKE scaffolding decommissioned [#1421](https://github.com/Skords-01/Sergeant/pull/1421) (2026-05-03)

> **Статус (2026-05-03):** decision-gate **GO** — Stage 4 за цим SPIKE-ом
> вже виконано (routine cut-over PR #025 + cleanup PR #026), тому SPIKE
> code було розкомпоновано: production-critical файли (`clientMigrate.ts`,
> `expoSqliteAdapter.ts`, `testSqlite.ts`) промоутнули у не-SPIKE-шляхи,
> решту бібліотеки + dev-panel-і + feature flag видалили у [#1421](https://github.com/Skords-01/Sergeant/pull/1421).
> SPIKE-нотатник архівовано: [`../../../02-engineering/notes/spikes/routine-sqlite-v2.md`](../../../02-engineering/notes/spikes/routine-sqlite-v2.md#decision-gate-metrics)
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
  - Документ `../../../02-engineering/notes/spikes/routine-sqlite-v2.md` — кваліфікаційний
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
