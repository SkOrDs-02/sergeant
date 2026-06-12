# Storage & Sync — PR-плани: Stage 5 (Sync engine v2 hardening)

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 4](./03-stage-4.md) · [→ Stage 6–7](./05-stage-6-7.md)

### Stage 5 — Sync engine v2 hardening

> **2026-05-06 implementation note.** The remaining writer-wiring slice landed
> in [#1953](https://github.com/Skords-01/Sergeant/pull/1953) (`feat(web): wire sync engine writer runtime`):
> web boot (`apps/web/src/main.tsx` → `apps/web/src/core/syncEngine/{singleton,syncEngineWriter}.ts`)
> composes `createSyncEnginePushScheduler` + `createSyncEngineFlushOnReconnect`
> із `@sergeant/api-client` поверх `drainSyncOpOutbox` / `mark*` / `recoverDeadLetter`
> із `@sergeant/db-schema/sqlite`, проводить tick/flush у Sentry breadcrumbs,
> опційно показує dead-letter count в `OfflineBanner` + retry-action через
> `useSyncStatus`. Stage 7 cleanup ✅ COMPLETE (9/9) — burn-in завершено,
> `module_data` колонка дропнута, v1 cloudSync engine видалено з web/mobile,
> KVStore syncedKV shim знесено.
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
> (`useCloudSync` stub-shim, `CloudSyncProvider`) ✅ COMPLETE — landed у
> PR #052c ([`20793adb`](https://github.com/Skords-01/Sergeant/commit/20793adb)).

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
  no-duplicates; `docs/03-operations/observability/metrics.md` §4 — оновлений cardinality
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
