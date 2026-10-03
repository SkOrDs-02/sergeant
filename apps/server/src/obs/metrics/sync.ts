import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── Sync ───────────────────────────────
export const syncOperationsTotal = new client.Counter({
  name: "sync_operations_total",
  help: "Sync push/pull operations by module and outcome",
  // op=push|pull|push_all|pull_all; outcome=ok|conflict|unauthorized|invalid|too_large|error|empty
  labelNames: ["op", "module", "outcome"],
  registers: [register],
});

export const syncDurationMs = new client.Histogram({
  name: "sync_duration_ms",
  help: "Sync operation duration in ms",
  labelNames: ["op", "module"],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

export const syncPayloadBytes = new client.Histogram({
  name: "sync_payload_bytes",
  help: "Sync blob size in bytes",
  labelNames: ["op", "module"],
  // 1KB..5MB — MAX_BLOB_SIZE = 5MB
  buckets: [1024, 8192, 65536, 262144, 1048576, 3145728, 5242880],
  registers: [register],
});

/**
 * Stage 5 / PR #041: live SSE стрім real-time op-log (`syncV2Stream`).
 * Окремий gauge — long-lived connection-и не вписуються в існуючий
 * `sync_duration_ms` histogram (їх duration — це час до disconnect-у,
 * не час обробки op-у), а кардинальність `module=v2` фіксована.
 */
export const syncStreamConnectionsActive = new client.Gauge({
  name: "sync_stream_connections_active",
  help: "Active /api/v2/sync/stream SSE connections",
  labelNames: ["module"],
  registers: [register],
});

/**
 * Per-op apply outcome для v2 op-log (PR #048, Stage 5 DoD #10).
 *
 * `syncOperationsTotal{op="v2_push"}` рахує **запит** (`ok|partial|conflict`),
 * але апдейтити дашборд RED-метрик per-table треба бачити **per-op**
 * розклад: applied/rejected/duplicate × table × reject_reason. Цей лічильник
 * інкрементиться один раз на `op` всередині `syncV2Push`, на тому ж місці,
 * де ми вже пишемо row у `sync_op_log` (тож кардинальність обмежена записами).
 *
 * Лейбли:
 *   - `table` ∈ whitelist `OP_LOG_TABLE_REGISTRY` (≤ ~15)
 *     + `__unknown__` для table_not_allowed-rejected ops.
 *   - `status` ∈ `applied|rejected|duplicate`.
 *   - `reason` — машинно-читабельний reject-reason (`lww_conflict`,
 *     `tombstoned`, `fk_violation`, `clock_skew`, `apply_failed`,
 *     `table_not_allowed`, `missing_*`, `invalid_*`, …) для `rejected`;
 *     `"none"` для `applied`; `"duplicate"` для `duplicate`. Reasons
 *     походять із зафіксованого набору в коді (`syncV2.ts`) — нові варіанти
 *     додаються свідомо разом із кодовою зміною, тож кардинальність не
 *     розповзається.
 *
 * Cardinality cap: ~15 tables × 3 statuses × ~25 reasons ≈ 1100 series
 * worst-case (типовий runtime ~50–100 active series, бо більшість reject-
 * reason-ів не репродукуються в production).
 *
 * Grafana queries (`docs/observability/dashboards/sync.json`):
 *   sum by (table, status) (rate(sync_op_log_apply_total[5m]))
 *   topk(10, sum by (table, reason)
 *     (rate(sync_op_log_apply_total{status="rejected"}[5m])))
 */
export const syncOpLogApplyTotal = new client.Counter({
  name: "sync_op_log_apply_total",
  help: "v2 sync op-log per-op apply outcomes (PR #048): applied / rejected / duplicate, broken down by table and reject_reason",
  labelNames: ["table", "status", "reason"],
  registers: [register],
});

/**
 * Counter for `sync_op_log` inserts where `origin_device_id` came in as
 * NULL on the client side (i.e. the client did not forward
 * `X-Origin-Device-Id`). The pull/SSE filter rejects every NULL-origin
 * row when called with a NULL header (`NULL IS DISTINCT FROM NULL`
 * evaluates to `FALSE` in PG), so a sustained non-zero rate here is a
 * data-integrity regression: multi-device convergence is silently
 * broken for the affected user(s).
 *
 * Labels:
 *   - `module` is always `"v2"` for label-uniformity with the other
 *     sync_* metrics — the dimension exists so a future op-log dialect
 *     can be tagged without breaking dashboards.
 *
 * Alert: `rate(sync_op_log_null_origin_device_id_total[15m]) > 0` for
 * 30m. Expected resting value post-fix: 0. Spikes during canary rollout
 * are expected for clients that have not yet picked up the new bundle.
 */
export const syncOpLogNullOriginDeviceIdTotal = new client.Counter({
  name: "sync_op_log_null_origin_device_id_total",
  help: "Inserts into sync_op_log where origin_device_id arrived as NULL (client did not forward X-Origin-Device-Id). Sustained non-zero = multi-device convergence broken.",
  labelNames: ["module"],
  registers: [register],
});

/**
 * Pull-lag (queue-staleness) гістограма для v2 sync (PR #048, RED-stack
 * "Latency"). На кожному `GET /v2/sync/pull` із непорожньою відповіддю
 * спостерігаємо `now - server_ts(newest_op_returned)` — це проксі
 * *user-perceived staleness*: скільки часу ops чекали в op-log, перш
 * ніж клієнт їх забрав. SSE stream-у (PR #041) має тримати це <100ms у
 * happy path; cursor-based polling — кілька секунд.
 *
 * Spike = клієнт довго був offline (ОК) **або** SSE-стрім впав і клієнт
 * fallback-нувся на polling (warning). Persistent-spike → аларм.
 *
 * Bucket-сітка покриває під 100ms (SSE happy path) до 1h (offline-replay
 * після довгої відсутності).
 */
export const syncOpLogPullLagMs = new client.Histogram({
  name: "sync_op_log_pull_lag_ms",
  help: "v2 sync pull staleness in ms: now - server_ts of newest op returned in this pull (PR #048)",
  buckets: [
    50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 300_000,
    900_000, 3_600_000,
  ],
  registers: [register],
});

/**
 * Queue-depth histogram для pull-у: скільки ops повернули за один
 * `GET /v2/sync/pull` (PR #048). Це проксі *behind-cursor depth*:
 * якщо p95 = LIMIT (зазвичай 200), значить є ще ops за курсором — клієнт
 * має зробити наступний pull. Sustained p95 = LIMIT → backpressure.
 *
 * Окрема метрика від `sync_payload_bytes`, бо кількість ops не корелює
 * лінійно з байтами (один meal ≪ один workout зі 50 set-ами).
 */
export const syncOpLogPullQueueDepth = new client.Histogram({
  name: "sync_op_log_pull_queue_depth",
  help: "v2 sync pull op-count returned per request (PR #048) — proxy for behind-cursor queue depth",
  buckets: [0, 1, 5, 10, 25, 50, 100, 200, 500, 1000],
  registers: [register],
});
