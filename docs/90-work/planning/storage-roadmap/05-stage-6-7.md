# Storage & Sync — PR-плани: Stage 6–7 (Operational maturity та Cleanup)

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 5](./04-stage-5.md) · [→ Stage 8–9](./06-stage-8-9.md)

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
  - `docs/03-operations/runbooks/database-connection-pooling.md` — Railway-deploy shape (`edoburu/pgbouncer`, transaction-mode, MAX_CLIENT_CONN sizing), верифікація, rollback, prepared-statement caveat.
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
  - `docs/03-operations/runbooks/postgres-read-replica.md` — Railway deploy shape, мінімальні
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
  `docs/03-operations/observability/dashboards/sync.json` (per-op outcomes stacked,
  topk-10 reject reasons, pull lag p50/95/99, queue depth p50/95/99).
  Cardinality cap: ~1100 worst-case (phenomenologically ~50–100 active).
  3 нові тести в `apps/server/src/obs/metrics.test.ts` фіксують registry
  - label-set + bucket boundaries `le=100` / `5000` / `200`, на які
    будуть прив'язані SLO-алерти. PromQL рецепти оновлені в
    `docs/03-operations/observability/metrics.md` §4 і `docs/03-operations/observability/dashboards.md`.

#### **PR #049 — `feat(ops): backup/restore runbook + weekly verify CI`** ✅ LANDED — split into PR #049 (docs) + PR #049b (CI)

- Scope. Документувати full-restore-from-backup для Railway Postgres.
  GitHub Action раз на тиждень: restore latest dump на staging + smoke-test
  schema integrity. Failures → PagerDuty.
- **Split.** Розділено на два кроки: docs-only PR #049 LANDED ([#1757](https://github.com/Skords-01/Sergeant/pull/1757));
  weekly-verify GitHub Action — окремий PR #049b (потребує `RAILWAY_TOKEN` у
  GH Secrets + staging instance, поза скоупом docs-only).

##### **PR #049 — `docs(docs): Railway Postgres backup/restore runbook (PR #049 docs portion)`** ✅ LANDED ([#1757](https://github.com/Skords-01/Sergeant/pull/1757))

- Scope. Новий runbook у [`docs/03-operations/runbooks/database-backup-restore.md`](../../../03-operations/runbooks/database-backup-restore.md):
  Railway dashboard + локальні `pg_dump`/`pg_restore` команди (custom format,
  `--no-owner --no-privileges --clean --if-exists`); sync-aware row-level
  restore матриця (which tables safe per CRDT semantics з PR #043 / #043a / #043b);
  smoke-test SQL пінить migration ledger, row-counts, tombstone-інваріанти,
  op-log monotonic server_ts, FK orphans; migration-skew handling; escalation
  paths. Cross-link із concept-level [`docs/00-start/playbooks/restore-from-backup.md`](../../../00-start/playbooks/restore-from-backup.md),
  [`docs/00-start/playbooks/test-backup-restore.md`](../../../00-start/playbooks/test-backup-restore.md),
  [`docs/04-governance/security/disaster-recovery.md`](../../../04-governance/security/disaster-recovery.md).
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
  `docs/04-governance/adr/0004-cloudsync-lww-conflict-resolution.md`,
  `docs/04-governance/adr/0011-local-first-storage.md`,
  `docs/04-governance/adr/0021-memory-bank.md`,
  `docs/04-governance/adr/0047-cloudsync-v1-410-gone.md`,
  `docs/02-engineering/architecture/data-exchange-storage-audit.md`,
  `docs/90-work/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md`,
  `docs/03-operations/observability/frontend.md`,
  `docs/90-work/tech-debt/mobile.md`.
- Bidirectional supersede edge ADR-0004 ↔ ADR-0047: ADR-0047 тепер
  явно `Supersedes: ADR-0004` (ADR graph CI gate enforces — раніше було
  лише `Status: superseded by ADR-0047` на ADR-0004 без зворотного посилання).
- `pnpm lint:governance-sync` → 0 errors (199 warnings лишаються — всі pre-existing aspirational).

#### **PR #054c — `docs(docs): prune dangling refs to retired docs/02-engineering/testing/mutation.md`** ✅ LANDED

- Commit [`5f2cfb0c`](https://github.com/Skords-01/Sergeant/commit/5f2cfb0c)
  ([#2072](https://github.com/Skords-01/Sergeant/pull/2072), 2026-05-06).
- 3 dangling refs до `docs/02-engineering/testing/mutation.md` (deleted у PR #052b разом
  з cloudSync v1 Stryker mutation infra) у 2 файлах:
  `docs/02-engineering/testing/README.md` (line 14 → tombstone-нота),
  `docs/90-work/audits/2026-05-03-web-deep-dive/round-13-burndown-sprint.md` (lines 12, 35, 193).
- Markdown link checker → 0 internal-link errors на trie цих файлів
  (broken EXTERNAL link `https://instatus.com/` у `docs/01-product/launch/business/04-launch-readiness.md:313` — pre-existing на main, не в скоупі storage migration, owner: Dev).

#### **PR #054x — `docs(docs): add ADR-0049 row to ADR README index (Hard Rule #15 fix)`** ✅ LANDED

- Commit [`077c738f`](https://github.com/Skords-01/Sergeant/commit/077c738f)
  ([#2073](https://github.com/Skords-01/Sergeant/pull/2073), 2026-05-06).
- Fix-forward для pre-existing main breakage — додано missing row для
  ADR-0049 (`Auth vendor risk`) у `docs/04-governance/adr/README.md`. ADR-0049 файл
  залендив у PR-48 (commit [`edd482ed`](https://github.com/Skords-01/Sergeant/commit/edd482ed)) без README index update.
- ADR graph CI gate (`scripts/docs/__tests__/check-adr-graph.test.mjs`)
  знову зелений (раніше валив на on-disk: validateGraph + README ↔ ADR
  count parity на main `19777fc3`).
- Не належить до storage-roadmap-у scope-у строго, але блокував
  governance-sync на PR #054c (#2072), тому залендив окремо паралельно.

#### **PR #053 — `chore: deprecate KVStore in favor of SQLite-backed cache`** ✅ LANDED — закрита трилогією [#053a (#2078)](https://github.com/Skords-01/Sergeant/pull/2078) + [#053b (#2082)](https://github.com/Skords-01/Sergeant/pull/2082) + [#053c (#2091)](https://github.com/Skords-01/Sergeant/pull/2091)

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
  4. tech-debt docs (`docs/90-work/tech-debt/{frontend,mobile}.md` §2) оновлено — KVStore не блокує SQLite-engine-as-single-storage definition-of-done (§0.2).
  5. governance-sync + ADR graph + lint + typecheck зелені.

#### **PR #053a — `chore(web): drop KVStore syncedKV shim + 5 onboarding/profile callsites`** ✅ LANDED ([#2078](https://github.com/Skords-01/Sergeant/pull/2078))

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
  - `docs/02-engineering/architecture/data-exchange-storage-audit.md` §2.2 (web
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

#### **PR #053b — `chore(mobile): drop enqueueChange callsites in fizruk hooks`** ✅ LANDED ([#2082](https://github.com/Skords-01/Sergeant/pull/2082))

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

#### **PR #053c — `chore(mobile): drop remaining enqueueChange callsites + delete sync shim`** ✅ LANDED ([#2091](https://github.com/Skords-01/Sergeant/pull/2091))

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

- **Сабтаск 13 — `docs/90-work/tech-debt/frontend.md` §2
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
