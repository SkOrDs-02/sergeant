# Data exchange & storage audit

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Зріз поточного стану: як у Sergeant рухаються і зберігаються дані, де слабкі місця, і який практичний напрям розвитку варто тримати.

## 1. Короткий висновок

Sergeant зараз має **v2-first data-архітектуру**:

- **Server-first для централізованих і чутливих речей:** Better Auth, Monobank, AI usage, push devices, sync audit, AI memory, normalized domain tables (`routine_entries`, `routine_streaks`, `fizruk_workouts` і т.д.), `coach_memory`, `billing_subscriptions`, `tg_topic_archive` — зберігаються у PostgreSQL.
- **Local-first для продуктового стану модулів:** web пише у SQLite-WASM (OPFS / kvvfs), mobile — у MMKV; cloud sync переносить операції через `sync_op_outbox` → `/api/v2/sync/*`.
- **CloudSync v1 повністю знятий (ADR-0047):** старі `/api/sync/*` endpoints повертають `410 Gone`. v1 engine (`dirtyMap`, `collectQueued`, `offlineQueue`, `resolver`) видалений з web і mobile кодових баз. `module_data` blob-таблиця дропнута міграцією 046.
- **v2 op-log sync — єдиний sync-шлях для всіх доменів:** `routine`, `fizruk`, `finyk`, `nutrition`, `profile` — усі через `sync_op_outbox` (web SQLite outbox) → `/api/v2/sync/push` → Postgres per-row tables.
- **Кеші окремо від source-of-truth:** React Query cache на web персиститься в IndexedDB, mobile — в MMKV; Service Worker кешує навігацію та частину GET `/api/*`, але не sync/auth.

## 2. Як зараз працює обмін даними

### 2.1. HTTP API та auth

- Клієнти ходять через `@sergeant/api-client`; default API prefix — `/api/v1`, а legacy `/api/*` частково дзеркалиться server middleware.
- Web використовує Better Auth session cookies.
- Mobile читає Better Auth session token з `expo-secure-store` і додає `Authorization: Bearer <token>` для REST `/api/v1/*` (`apps/mobile/src/api/apiClient.ts`).
- Server — Express + PostgreSQL pool. Pool має ліміти, idle/connect timeout і `statement_timeout`; DB wrapper ретраїть transient Postgres errors (`apps/server/src/db.ts`).

### 2.2. CloudSync v1 — знятий (historical reference)

v1 cloud sync повністю видалений (ADR-0047, web phase PR #053a, mobile phase PR #053b/c):

- **Web:** `cloudSync/engine/`, `cloudSync/queue/`, `cloudSync/conflict/`, `storagePatch.ts`, `enqueue.ts` — всі видалені. `cloudSync/` тепер — мінімальний barrel, що експортує лише `useSyncStatus` (статус поточного v2 sync cycle).
- **Mobile:** `sync/config.ts`, `sync/api.ts`, `sync/useSyncedStorage.ts`, та вся v1 mobile engine tree — видалені у PR #052c/053c.
- **Server:** `POST /api/sync` і `GET /api/sync` routes тепер повертають `410 Gone` через `respondV1Gone` middleware (PR #2003). `module_data` table дропнута міграцією 046 (Stage 7 cleanup).
- **`SYNC_MODULES` registry** (`packages/shared/src/sync/modules.ts`) — практично видалений: усі продуктові модулі знято з v1 в окремих PRs (Routine → PR #026, Fizruk → PR #030, Nutrition → PR #034, Finyk → PR #039, Coach → PR #053a + міграція 045). Реєстр тримає лише `profile` entry (`USER_PROFILE`, `HUB_BIOMETRICS`) як test-fixture для ESLint parity-check `no-raw-tracked-storage`. Decision-pending tombstone: див. [storage-roadmap §Stage 13 → B6](../planning/storage-roadmap.md). `MAX_OFFLINE_QUEUE` / `MAX_QUEUE_ATTEMPTS` константи з того ж файла теж лишилися як test-fixture, runtime-споживачів немає (v2 outbox у SQLite не cap-нутий цією константою).

### 2.3. Sync v2 / operation log — primary sync шлях

Новий шлях — `/api/v2/sync/*`:

- **Web:** UI пише через domain-specific write helpers → SQLite-WASM (`sync_op_outbox` таблиця). `syncEngine/` (singleton: `apps/web/src/core/syncEngine/singleton.ts`) — `SyncEnginePushScheduler` збирає batch операцій з outbox і пушить на сервер. `SyncEngineFlushOnReconnect` — replay при відновленні зв'язку.
- **Mobile:** MMKV-backed outbox з explicit enqueue у domain write paths; окремий push scheduler.
- **Server:** whitelist таблиць у `OP_LOG_TABLE_REGISTRY` (усі 4 домени): `routine_entries`, `routine_streaks`, `fizruk_workouts`, `fizruk_workout_items`, `fizruk_workout_sets`, `fizruk_custom_exercises`, `fizruk_measurements` + finyk i nutrition per-row tables. `sync_op_log` — append-only stream: `user_id`, `idempotency_key`, `table_name`, `op`, `row`, `client_ts`, `server_ts`, `origin_device_id`, `status` (`apps/server/src/migrations/027_sync_op_log.sql`).
- Unique `(user_id, idempotency_key)` захищає від повторного застосування offline replay.
- Dead-letter recovery: `SyncEngineWriterRuntime.recoverAllDeadLetters()` — відновлення операцій, що впали після max retries.

Контракт:

- `POST /api/v2/sync/push` — пуш batch операцій, відповідь `{applied, rejected, duplicate}`.
- `GET /api/v2/sync/pull?since=<cursor>` — pull змін з інших пристроїв після `cursor`.

### 2.4. Monobank flow

Monobank винесений із client-side proxy в server-side webhook flow:

- Public webhook endpoint: `POST /api/mono/webhook/:secret` без session auth; захист — path secret, lookup через hash, constant-time логіка у handler (`apps/server/src/routes/mono-webhook.ts`).
- User endpoints (`connect`, `accounts`, `transactions`, `backfill`) захищені `requireSession()`.
- DB schema має `mono_connection`, `mono_account`, `mono_transaction`; amounts/balances зберігаються як `BIGINT` у minor units (`apps/server/src/migrations/008_mono_integration.sql`).
- Plain webhook secret поступово замінено hash-keyed lookup: `webhook_secret_hash`, unique index (`apps/server/src/migrations/017_mono_webhook_secret_hash.sql`).

### 2.5. AI memory та черги

- `/api/ai-memory/ingest` і `/api/ai-memory/recall` захищені session auth і rate-limit 30 req / 5 min / IP (`apps/server/src/routes/ai-memory.ts`).
- Service facade робить `remember()` / `recall()` через embedding provider + vector store; при `AI_MEMORY_ENABLED=false` це no-op (`apps/server/src/modules/ai-memory/service.ts`).
- Store — PostgreSQL + pgvector `HALFVEC(1024)`, hash partition by `user_id` на 32 partitions, HNSW index (`apps/server/src/migrations/025_ai_memories_pgvector.sql`).
- BullMQ queue `ai-memory-ingest` — async embedding у тому самому процесі, що й Express.

### 2.6. Coach memory

- `coach_memory` — окрема per-user JSONB таблиця (PK = `user_id`, FK `→ "user".id ON DELETE CASCADE`). Мігрована з `module_data WHERE module='coach'` міграцією 045.
- Читається/пишеться виключно через `apps/server/src/modules/chat/coach.ts` — server-side write, без client-side blob sync.
- Поля: `data` (JSONB з `weeklyDigests[]`, `lastInsightDate`, `lastInsightText`), `version`, `client_updated_at`, `server_updated_at`.

### 2.7. Billing

- `billing_subscriptions` — Stripe subscription state (міграція 047): `user_id`, `provider`, `plan` (`plus`/`pro`), `status`, `stripe_*_id`, `current_period_end`.
- Вебхуки Stripe ідемпотентно ресолвляться через `webhook_events` (міграція 011).
- Checkout-сесія → `billing_subscriptions` через `apps/server/src/modules/billing/stripe.ts`.
- Pricing page: `apps/web/src/core/pricing/WaitlistForm.tsx` (раніше `PricingPage.tsx`, перейменовано в pricing → waitlist UX-roast).

### 2.8. Nutrition backup

Є окремий backup path:

- Upload пише encrypted client-side blob у filesystem `.data/nutrition-backup-<safe-token>.json`, cap близько 2.5 MB (`apps/server/src/modules/nutrition/backup-upload.ts`).
- Download читає той файл і повертає blob (`apps/server/src/modules/nutrition/backup-download.ts`).

Це простий recovery/import path, але не такий надійний і операційний, як PostgreSQL або object storage.

### 2.9. Transcribe

- `POST /api/transcribe` — audio → text через Whisper / provider. USD-cap per user per day: ledger у `ai_usage_daily` з bucket pattern `transcribe:<model>` (виправлено міграцією 049 — `CHECK` був надто вузький).
- `apps/server/src/modules/transcribe/usdCap.ts` — fail-open throttle: при перевищенні `TRANSCRIBE_USD_CAP_DAILY` повертає 429, але при DB-помилці пропускає (не блокує юзера).

## 3. Як зараз зберігаються дані

### 3.1. PostgreSQL (migrations 001–049)

Основні таблиці:

- Better Auth: `user`, `session`, `account`, `verification` (003).
- Monobank: `mono_connection`, `mono_account`, `mono_transaction` (008).
- Normalized domain tables: `routine_entries`, `routine_streaks` (026); `fizruk_workouts`, `fizruk_workout_items`, `fizruk_workout_sets`, `fizruk_custom_exercises`, `fizruk_measurements` (Stage 4 migrations).
- Sync v2 op-log: `sync_op_log` (027); `sync_op_outbox` partial-view (server side).
- Sync audit: `sync_audit_log` (023).
- AI memory: `ai_memories`, partitioned + HNSW (025).
- Coach state: `coach_memory` — per-user JSONB, замінила `module_data.coach` (045).
- Billing: `billing_subscriptions` — Stripe subscription state (047).
- Ops/Telegram: `tg_topic_archive` — append-only message history для Sergeant_ops supergroup topics (048).
- AI usage: `ai_usage_daily` — bucket pattern розширено до `transcribe:<model>` (049).
- Push audit: `push_send_audit` (041).
- Email: `email_unsubscribes` (043/044).

> **`module_data` — видалена.** Дропнута міграцією 046 (`CASCADE` → всі partitions + helper function). Дані `module='profile'` списані свідомо (pre-launch); `module='coach'` мігровані в `coach_memory` (045).

DB-level safety:

- High-volume tables отримали `deleted_at` для soft-delete/recovery.
- Mono active reads мають partial indexes `WHERE deleted_at IS NULL`.

### 3.2. Web storage

- **Основний local-first module state — SQLite-WASM** (`apps/web/src/core/db/sqlite.ts`). VFS priority: OPFS-SAH → kvvfs/localStorage → memory. `sync_op_outbox` у SQLite — джерело для v2 push scheduler.
- React Query warm-start cache — IndexedDB (`sergeant-db`, store `rq_cache`), TTL 7 днів, build-id buster, sensitive query keys не персистяться (`apps/web/src/shared/lib/api/queryClientPersister.ts`).
- Service Worker:
  - precache + NetworkFirst navigation cache;
  - GET `/api/*` cache на 30 хв, але auth/sync/coach/weekly-digest виключені (`apps/web/src/sw.ts`);
  - IndexedDB `sergeant-sw/notified-keys` для dedupe reminder notifications.
- `cloudSync/` тепер — лише barrel `useSyncStatus` (статус v2 engine cycle). Усі v1 engine файли видалені.

### 3.3. Mobile storage

- Основний local-first state — MMKV instance `sergeant.mobile.v1` (`apps/mobile/src/lib/storage.ts`).
- Encryption bootstrap створює encrypted MMKV з key у `expo-secure-store`; якщо SecureStore/encryption недоступні — fallback у plaintext з error reporting (`apps/mobile/src/lib/storageEncryption.ts`).
- React Query cache — MMKV-backed persister, max age 7 днів, sensitive query keys не персистяться (`apps/mobile/src/providers/QueryProvider.tsx`).
- Better Auth cookie JSON/session token — `expo-secure-store`, використовується для bearer auth (`apps/mobile/src/api/apiClient.ts`).

## 4. Слабкі місця та ризики

### 4.1. SQLite cut-over — LS-write залишається source-of-truth

`sync_op_log` і normalized per-domain tables є для всіх доменів, і read-default-on квартет (Stage 8 PR #055r2/#055f2/#055n2/#055k2) лендив: всі 4 `feature.<m>.sqlite_v2.read_sqlite` флаги зараз `defaultValue: true` у `apps/{web,mobile}/src/core/lib/featureFlags.ts`. Stage 8 dual-write feature-flag drop квартет (#056r/#056f/#056n/#056k) також лендив — SQLite mirror фірить unconditionally whenever a dual-write context is registered. Але **LS/MMKV-write залишається source-of-truth** практично для всіх 4 модулів доки не видаляться LS readers + tombstone для `STORAGE_KEYS.*` (PR #057\* quartet — outstanding). Routine додатково блокований SQLite-схемою: 7 з 8 полів `RoutineState` (habits, tags, categories, prefs, pushupsByDate, habitOrder, completionNotes) — LS-only, питання повного LS-write drop-у винесено в Stage 10 candidate (розширення Routine SQLite-схеми). Деталі — [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md#stage-8--sqlite-cut-over-rollout) Stage 8.

### 4.2. `sync_op_log` append-only retention

`sync_op_log` та `sync_audit_log` ростуть append-only. Без retention / partition policy операційне навантаження зростатиме пропорційно до кількості операцій. Партиціонування `module_data` (042) стало прецедентом — аналогічна стратегія потрібна для `sync_op_log`.

### 4.3. Nutrition backup у filesystem `.data`

Backup upload/download пише файли під `process.cwd()/.data`. Ризики:

- ephemeral filesystem у деяких deployment environments;
- складніше робити backup/restore/retention/audit;
- нема object-store lifecycle/versioning;
- token-derived filename — краще, ніж raw token, але все ще окремий auth/storage контур.

### 4.4. Sensitive data та XSS/device-risk

Є хороші обмеження: sensitive React Query keys не персистяться, Mono PAT не синкається в MMKV/cloud-sync, webhook secret hash. Але local-first дизайн означає, що багато персональних даних лежить на клієнті:

- web SQLite-WASM (OPFS) — accessible до extension-рівневих атак але не XSS (sandboxed origin).
- IndexedDB snapshots readable from devtools/XSS, хоч sensitive query keys і відфільтровані.
- mobile plaintext fallback можливий, якщо SecureStore/encryption недоступні.

### 4.5. Bigint/number boundary

PostgreSQL `BIGINT` приходить з `pg` як string. Repo має hard rule coerce bigint → number. Boundary залишається крихким: кожен новий serializer для money/balance/ids має не забути правило. У Monobank amounts/balances — `BIGINT` у DB (`apps/server/src/migrations/008_mono_integration.sql`).

### 4.6. Cache invalidation complexity

Є кілька cache/storage шарів: module SQLite-WASM, React Query persisted cache, Service Worker API cache, PostgreSQL. Чим більше normalized/read paths, тим важливіше централізувати invalidation policy.

## 5. Перспективи і рекомендований roadmap

### P0 / короткий горизонт

1. **Завершити SQLite cut-over** (Stage 8 PR #057\* quartet).
   - Read-default-on квартет уже лендив (PR #055r2/#055f2/#055n2/#055k2) — всі 4 `feature.<m>.sqlite_v2.read_sqlite` флаги `defaultValue: true`.
   - Дропнути LS reader оверлеї + tombstone `STORAGE_KEYS.{ROUTINE,FIZRUK_*,NUTRITION_*,FINYK_*}` (PR #057\* quartet, 14d canary gate на #056\*).
   - Розширити Routine SQLite-схему до повного покриття LS стану (Stage 10 candidate — `routine_habits`, `routine_tags`, `routine_categories`, `routine_prefs`, `routine_pushups`, `routine_habit_order`, `routine_completion_notes`) перед Routine LS-write drop.

2. **Додати retention/partition для `sync_op_log`.**
   - Визначити retention window (active + archive).
   - Partition strategy аналогічна до `module_data` (042).

3. **Перенести Nutrition backup із `.data` у durable storage.**
   - Мінімум: PostgreSQL table з `user_id`, encrypted blob, size, checksum, created_at.
   - Краще: S3/R2 object storage + DB metadata + lifecycle.

### P1 / середній горизонт

4. **Уніфікувати client storage abstraction.**
   - Один typed storage API з tracked/untracked режимом.
   - Runtime warnings у dev, якщо tracked key пишеться raw шляхом.

5. **Conflict UX замість silent LWW.**
   - Для важливих доменів показувати "є конфлікт з іншого пристрою".
   - Автоматичний merge для independent fields/rows.

6. **Partition/retention для append-only таблиць.**
   - `sync_audit_log` 90/180 days retention.
   - AI memory compaction strategy.

### P2 / довший горизонт

7. **Data portability / recovery.**
   - Export/import per module.
   - Per-user purge з audit.

8. **`billing_subscriptions` feature gating.**
   - Замикати features на `plan=plus/pro` — потребує middleware-gate у server routes.

## 6. Практичний підсумок

Поточна архітектура перейшла з гібридного v1/v2 стану у **v2-only**: `module_data` дропнута, v1 sync endpoints повертають 410 Gone, `sync_op_outbox`-based engine є єдиним sync-шляхом. Нові surfaces (billing, transcribe, coach memory, Telegram topic archive) мають власні dedicated tables і server modules. Найбільший ROI зараз — довести read cutover для Finyk/Nutrition, додати retention/partition для `sync_op_log`, і стабілізувати Nutrition backup у durable storage.
