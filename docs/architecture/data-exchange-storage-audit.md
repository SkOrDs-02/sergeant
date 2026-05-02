# Data exchange & storage audit

> **Last validated:** 2026-05-02 by Devin. **Next review:** 2026-07-31.
> **Status:** Active

Зріз поточного стану: як у Sergeant рухаються і зберігаються дані, де слабкі місця, і який практичний напрям розвитку варто тримати.

## 1. Короткий висновок

Sergeant зараз має гібридну data-архітектуру:

- **Server-first для централізованих і чутливих речей:** Better Auth, Monobank, AI usage, push devices, sync audit, AI memory, normalized Routine tables зберігаються у PostgreSQL.
- **Local-first для продуктового стану модулів:** web пише у `localStorage`, mobile — у MMKV; cloud sync переносить знімки модулів у Postgres `module_data`.
- **Поступовий перехід від blob-sync до row-level sync:** поточний v1 sync — whole-blob last-write-wins; v2 sync — operation log з idempotency keys і per-row apply, поки обмежений Routine SPIKE.
- **Кеші окремо від source-of-truth:** React Query cache на web персиститься в IndexedDB, mobile — в MMKV; Service Worker кешує навігацію та частину GET `/api/*`, але не sync/auth.

Головний ризик: частина важливих доменних даних усе ще живе як великі JSON/blob-и. Тому multi-device конфлікти, quota, schema drift і partial recovery залишаються слабкими місцями. Найправильніша перспектива — завершити roadmap: normalized tables, dual-write, cut-over і op-log sync для high-value модулів.

## 2. Як зараз працює обмін даними

### 2.1. HTTP API та auth

- Клієнти ходять через `@sergeant/api-client`; default API prefix — `/api/v1`, а legacy `/api/*` частково дзеркалиться server middleware.
- Web використовує Better Auth session cookies.
- Mobile читає Better Auth session token з `expo-secure-store` і додає `Authorization: Bearer <token>` для REST `/api/v1/*` (`apps/mobile/src/api/apiClient.ts`).
- Server — Express + PostgreSQL pool. Pool має ліміти, idle/connect timeout і `statement_timeout`; DB wrapper ретраїть transient Postgres errors (`apps/server/src/db.ts`).

### 2.2. Web local-first sync v1

Поточний основний cloud-sync шлях:

1. Модулі пишуть state у `localStorage`.
2. `storagePatch.ts` monkey-patch-ить `localStorage.setItem/removeItem`, визначає module за ключем, ставить dirty flag і емiтить sync event (`apps/web/src/core/cloudSync/storagePatch.ts`).
3. `SYNC_MODULES` визначає, які ключі входять у `finyk`, `fizruk`, `routine`, `nutrition`, `profile` (`apps/web/src/core/cloudSync/config.ts`).
4. `pushDirty()` збирає dirty modules, робить `syncApi.pushAll(modules)`, а якщо offline/error — додає payload в offline queue (`apps/web/src/core/cloudSync/engine/push.ts`).
5. Offline queue коалесить послідовні push-и і має hard cap `MAX_OFFLINE_QUEUE = 50` (`apps/web/src/core/cloudSync/queue/offlineQueue.ts`).
6. Server пише module payload в `module_data` як JSONB blob з `version`, `client_updated_at`, `server_updated_at` (`apps/server/src/migrations/003_baseline_schema.sql`).

Модель конфліктів v1: **last-write-wins на рівні цілого module blob-а**. Це просто і добре для швидкого offline-first UX, але погано для одночасних правок різних частин одного модуля з різних пристроїв.

### 2.3. Mobile local-first sync v1

Mobile дзеркалить web-підхід, але замість `localStorage` має MMKV:

- `SYNC_MODULES` на mobile має `finyk`, `fizruk`, `routine`, `nutrition` і не включає `profile` (`apps/mobile/src/sync/config.ts`).
- Mobile API seam реекспортує `apiClient.sync` як `syncApi`, щоб engine-и читались як web (`apps/mobile/src/sync/api.ts`).
- Через MMKV немає глобального patch як у web, тому tracked writes мають явно викликати `enqueueChange`; для цього додали `useSyncedStorage()` як safer wrapper (`apps/mobile/src/sync/useSyncedStorage.ts`).

### 2.4. Sync v2 / operation log

Новий шлях — `/api/v2/sync/*`:

- Server має whitelist таблиць: `routine_entries`, `routine_streaks` (`apps/server/src/modules/sync/syncV2.ts`).
- `sync_op_log` зберігає append-only stream: `user_id`, `idempotency_key`, `table_name`, `op`, `row`, `client_ts`, `server_ts`, `origin_device_id`, `status` (`apps/server/src/migrations/027_sync_op_log.sql`).
- Unique `(user_id, idempotency_key)` захищає від повторного застосування offline replay.
- Mobile Routine SPIKE має локальний outbox, пушить FIFO batch-и, видаляє applied/duplicate, rejected лишає для triage (`apps/mobile/src/modules/routine/lib/sqliteSpike/syncEngine.ts`).

Це правильний напрям: per-row conflict handling, `pull?since=<op_id>` курсори і multi-device convergence без перетирання цілого blob-а.

### 2.5. Monobank flow

Monobank винесений із client-side proxy в server-side webhook flow:

- Public webhook endpoint: `POST /api/mono/webhook/:secret` без session auth; захист — path secret, lookup через hash, constant-time логіка у handler (`apps/server/src/routes/mono-webhook.ts`).
- User endpoints (`connect`, `accounts`, `transactions`, `backfill`) захищені `requireSession()`.
- DB schema має `mono_connection`, `mono_account`, `mono_transaction`; amounts/balances зберігаються як `BIGINT` у minor units (`apps/server/src/migrations/008_mono_integration.sql`).
- Plain webhook secret поступово замінено hash-keyed lookup: `webhook_secret_hash`, unique index (`apps/server/src/migrations/017_mono_webhook_secret_hash.sql`).

### 2.6. AI memory та черги

- `/api/ai-memory/ingest` і `/api/ai-memory/recall` захищені session auth і rate-limit 30 req / 5 min / IP (`apps/server/src/routes/ai-memory.ts`).
- Service facade робить `remember()` / `recall()` через embedding provider + vector store; при `AI_MEMORY_ENABLED=false` це no-op (`apps/server/src/modules/ai-memory/service.ts`).
- Store — PostgreSQL + pgvector `HALFVEC(1024)`, hash partition by `user_id` на 32 partitions, HNSW index (`apps/server/src/migrations/025_ai_memories_pgvector.sql`).

### 2.7. Nutrition backup

Є окремий backup path:

- Upload пише encrypted client-side blob у filesystem `.data/nutrition-backup-<safe-token>.json`, cap близько 2.5 MB (`apps/server/src/modules/nutrition/backup-upload.ts`).
- Download читає той файл і повертає blob (`apps/server/src/modules/nutrition/backup-download.ts`).

Це простий recovery/import path, але не такий надійний і операційний, як PostgreSQL або object storage.

## 3. Як зараз зберігаються дані

### 3.1. PostgreSQL

Основні таблиці:

- Better Auth: `user`, `session`, `account`, `verification` (`apps/server/src/migrations/003_baseline_schema.sql`).
- Local-first sync blobs: `module_data`.
- Monobank: `mono_connection`, `mono_account`, `mono_transaction`.
- Sync audit: `sync_audit_log` — per-user audit trail of `/api/sync/*`, індекси за user/time/outcome (`apps/server/src/migrations/023_sync_audit_log.sql`).
- Sync v2 op-log: `sync_op_log` (`apps/server/src/migrations/027_sync_op_log.sql`).
- AI memory: `ai_memories`, partitioned + HNSW (`apps/server/src/migrations/025_ai_memories_pgvector.sql`).
- Normalized Routine target: `routine_entries`, `routine_streaks` (`apps/server/src/migrations/026_routine_tables.sql`).

DB-level safety:

- `module_data.module` має CHECK constraint на known modules + `coach` (`apps/server/src/migrations/024_module_check_and_soft_delete.sql`).
- High-volume tables отримали `deleted_at` для soft-delete/recovery.
- Mono active reads мають partial indexes `WHERE deleted_at IS NULL`.

### 3.2. Web storage

- Основний local-first module state — `localStorage`, згрупований через `SYNC_MODULES`.
- React Query warm-start cache — IndexedDB через `idb-keyval`, DB `sergeant-rq-cache`, TTL 7 днів, build-id buster, sensitive query keys не персистяться (`apps/web/src/shared/lib/queryClientPersister.ts`).
- Service Worker:
  - precache + NetworkFirst navigation cache;
  - GET `/api/*` cache на 30 хв, але auth/sync/coach/weekly-digest виключені (`apps/web/src/sw.ts`);
  - IndexedDB `sergeant-sw/notified-keys` для dedupe reminder notifications.
- SQLite-WASM foundation: lazy-loaded SQLite з VFS priority OPFS-SAH → kvvfs/localStorage → memory (`apps/web/src/core/db/sqlite.ts`). Це ще не основний source-of-truth, а foundation для storage roadmap.

### 3.3. Mobile storage

- Основний local-first state — MMKV instance `sergeant.mobile.v1` (`apps/mobile/src/lib/storage.ts`).
- Encryption bootstrap створює encrypted MMKV з key у `expo-secure-store`; якщо SecureStore/encryption недоступні — fallback у plaintext з error reporting (`apps/mobile/src/lib/storageEncryption.ts`).
- React Query cache — MMKV-backed persister, max age 7 днів, sensitive query keys не персистяться (`apps/mobile/src/providers/QueryProvider.tsx`).
- Better Auth cookie JSON/session token — `expo-secure-store`, використовується для bearer auth (`apps/mobile/src/api/apiClient.ts`).

## 4. Слабкі місця та ризики

### 4.1. Whole-blob LWW у v1 sync

`module_data` — зручний, але грубий storage. Якщо два пристрої змінюють різні частини одного module blob-а, server бачить це як один об'єкт і один timestamp. Результат — можливе перетирання свіжої частини стану.

Особливо ризикові модулі:

- `finyk`: budgets, debts, tx cats, splits, custom cats, tx cache;
- `fizruk`: workouts, templates, measurements, active workout;
- `nutrition`: log, pantries, prefs;
- `routine`: уже визнаний candidate для normalized tables.

### 4.2. Quota та main-thread blocking у localStorage

Web module state усе ще пишеться в `localStorage`, який:

- синхронний і блокує main thread;
- має малий quota, зазвичай близько 5 MB;
- погано підходить для великих tx/workout/nutrition blobs;
- легко ламається при direct `localStorage.setItem`, якщо код обходить sync wrapper/patched path.

Offline queue має cap 50 і коалесинг, але це захищає від росту queue, не від росту самих module payloads.

### 4.3. Mobile enqueue discipline

На web patch ловить tracked `localStorage` writes. На mobile кожен tracked write має явно викликати `enqueueChange`, і сам код документує, що раніше Finyk/Fizruk хуки “silently shipped without that call” (`apps/mobile/src/sync/useSyncedStorage.ts`). `useSyncedStorage` зменшує ризик, але raw MMKV writes досі можуть обійти sync.

### 4.4. v2 sync ще не загальний

`sync_op_log` і Routine normalized tables уже є, але whitelist поки тільки `routine_entries` / `routine_streaks`. Тобто основні high-volume модулі ще на v1 blob sync.

Також `sync_op_log` append-only; без retention/partition ростиме операційне навантаження.

### 4.5. Nutrition backup у filesystem `.data`

Backup upload/download пише файли під `process.cwd()/.data`. Ризики:

- ephemeral filesystem у деяких deployment environments;
- складніше робити backup/restore/retention/audit;
- нема object-store lifecycle/versioning;
- token-derived filename — краще, ніж raw token, але все ще окремий auth/storage контур.

### 4.6. Sensitive data та XSS/device-risk

Є хороші обмеження: sensitive React Query keys не персистяться, Mono PAT не синкається в MMKV/cloud-sync, webhook secret hash. Але local-first дизайн означає, що багато персональних даних лежить на клієнті:

- web `localStorage` readable by any successful XSS;
- IndexedDB snapshots readable from devtools/XSS, хоч sensitive query keys і відфільтровані;
- mobile plaintext fallback можливий, якщо SecureStore/encryption недоступні.

### 4.7. Bigint/number boundary

PostgreSQL `BIGINT` приходить з `pg` як string. Repo має hard rule coerce bigint → number, і sync audit прямо це робить (`apps/server/src/modules/sync/audit.ts`). Але boundary залишається крихким: кожен новий serializer для money/balance/ids має не забути правило. У Monobank amounts/balances — `BIGINT` у DB (`apps/server/src/migrations/008_mono_integration.sql`).

### 4.8. Cache invalidation complexity

Є кілька cache/storage шарів: module `localStorage`/MMKV, React Query persisted cache, Service Worker API cache, SQLite-WASM, PostgreSQL. Це дає швидкий UX, але підвищує ризик “ghost state” після logout/deploy/schema change. Частину ризику вже покрито: build buster у RQ persister, auth/sync exclusions у Service Worker. Але чим більше normalized/read paths додасться, тим важливіше централізувати invalidation policy.

## 5. Перспективи і рекомендований roadmap

### P0 / короткий горизонт

1. **Заборонити direct storage writes для tracked keys.**
   - Web: lint rule/test проти direct `localStorage.setItem` для ключів із `SYNC_MODULES`, окрім allowed storage layer.
   - Mobile: static check, що tracked keys пишуться через `useSyncedStorage` або approved store helper.

2. **Покращити observability sync.**
   - Показувати user-facing sync audit/conflicts у UI.
   - Додати dashboards по `sync_audit_log.outcome`, payload size, conflict rate, queue length.

3. **Закріпити bigint serializers.**
   - Snapshot/contract tests для Mono balances/amounts і sync audit IDs.
   - Єдині serializer helpers для money-like fields.

4. **Перенести Nutrition backup із `.data` у durable storage.**
   - Мінімум: PostgreSQL table з `user_id`, encrypted blob, size, checksum, created_at.
   - Краще: S3/R2 object storage + DB metadata + lifecycle.

### P1 / середній горизонт

5. **Завершити Routine migration.**
   - Backfill → dual-write → shadow-read validation → cut-over → remove old blob path двофазно.
   - Закрити SPIKE race: local row write + outbox enqueue мають бути atomic transaction.

6. **Поширити v2 op-log на Finyk/Nutrition/Fizruk.**
   - Почати з high-conflict collections: Finyk custom categories/splits/manual expenses, Nutrition log/pantries, Fizruk active workout/workout log.
   - Не обов'язково нормалізувати все одразу; можна module-by-module.

7. **Partition/retention для append-only таблиць.**
   - `sync_op_log`, `sync_audit_log`, AI memory growth.
   - Визначити retention: op-log active window + archive, audit 90/180 days, AI memory compaction.

8. **Уніфікувати client storage abstraction.**
   - Один typed storage API з tracked/untracked режимом.
   - Runtime warnings у dev, якщо tracked key пишеться raw шляхом.

### P2 / довший горизонт

9. **Move local-first source-of-truth з `localStorage`/MMKV blobs до SQLite/normalized local DB.**
   - Web уже має SQLite-WASM foundation (OPFS/kvvfs/memory).
   - Mobile може мати SQLite/Drizzle або MMKV тільки для small prefs.
   - Це відкриє локальні індекси, migrations, atomic transactions, outbox в одній DB.

10. **Conflict UX замість silent LWW.**
    - Для важливих доменів показувати “є конфлікт з іншого пристрою”.
    - Автоматичний merge для independent fields/rows.
    - Manual resolution для money/habit/workout conflicts.

11. **Data portability / recovery.**
    - Export/import per module.
    - Per-user purge з audit.
    - Restore point для module blobs під час cut-over.

## 6. Практичний підсумок

Поточна архітектура вже досить зріла для offline-first продукту: є централізований API client, Better Auth, PostgreSQL, sync audit, queue coalescing, mobile encryption, IndexedDB/MMKV query persistence, webhook hardening, AI memory foundation.

Але система перебуває у перехідній фазі: **v1 blob sync ще несе основне навантаження**, а **v2 normalized/op-log модель уже закладена, але не завершена**. Найбільший ROI — не додавати ще один storage шар, а довести існуючий storage roadmap: normalized per-domain tables, op-log sync, atomic local outbox, retention/partitioning і stricter storage-write discipline.
