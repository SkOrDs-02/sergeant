/**
 * Smoke-тести Prometheus-реєстру: переконуємось, що ключові метрики
 * зареєстровані у спільному `register`-і й експортуються через
 * `register.metrics()` у форматі, який Prometheus може відфетчити.
 *
 * Не вимірюємо самі значення (collectDefaultMetrics + business counters
 * — це стани процесу, які тестувати в unit-форматі дорого і крихко).
 * Покриваємо саме контракт: ім'я метрики, тип, набір лейблів, видимість
 * у експорт-payload-і. Це той контракт, на який зав'язані Grafana-дашборди
 * (e.g. `* on (instance) group_left(version, commit) http_request_duration_ms`)
 * — тут ми ловимо drift, який інакше з'явився б тільки під alert-evaluator-ом.
 */
import { describe, it, expect } from "vitest";
import {
  register,
  appBuildInfo,
  aiRequestDurationMs,
  aiRequestsTotal,
  syncOpLogApplyTotal,
  syncOpLogPullLagMs,
  syncOpLogPullQueueDepth,
} from "./metrics.js";
import {
  APPLY_REJECT_REASONS,
  ENGINE_REJECT_REASONS,
} from "../modules/sync/syncV2.js";

describe("metrics registry — `app_build_info` gauge", () => {
  it("реєструється у спільному `register`-і з ім'ям `app_build_info`", () => {
    const metric = register.getSingleMetric("app_build_info");
    expect(metric).toBe(appBuildInfo);
    expect(metric).toBeDefined();
  });

  it("експортує єдиний sample зі значенням 1 і повним набором лейблів", async () => {
    const text = await register.metrics();
    // `app_build_info{version="…", commit="…", release="…", env="…", node_version="…"} 1`
    // — точна форма, яку Prometheus зчитує. Якщо хтось забуде один з
    // лейблів (наприклад, прибере `env` для "стиснення"), всі дашборди,
    // що роблять `group_left(commit, release)`, мовчки втратять точку
    // join-а — тому лейбли явно фіксуємо у тесті.
    expect(text).toMatch(/^app_build_info\{.*?\} 1$/m);
    expect(text).toMatch(/version="[^"]+"/);
    expect(text).toMatch(/commit="[^"]+"/);
    expect(text).toMatch(/release="[^"]+"/);
    expect(text).toMatch(/env="[^"]+"/);
    expect(text).toMatch(/node_version="[^"]+"/);
  });

  it("`commit` обрізається до 12 символів (slice ув'язується з prom-cardinality bound-ом)", async () => {
    const text = await register.metrics();
    const match = /commit="([^"]+)"/.exec(text);
    expect(match).not.toBeNull();
    // 12 символів = стандартний short-SHA, який Railway/GitHub вставляють
    // у release-таги. Більше — невиправдана cardinality, менше — ризик
    // колізій SHA-prefix-у в великих репах.
    if (match) expect(match[1].length).toBeLessThanOrEqual(12);
  });
});

describe("metrics registry — AI per-endpoint duration histogram", () => {
  it("`ai_request_duration_ms` зареєстрований і має лейбли provider/model/endpoint/outcome", () => {
    // SLO/dashboards зав'язані саме на цей набір лейблів. Дзеркалить
    // labelNames у `aiRequestsTotal` — щоб p95-латентність помилкових
    // запитів можна було виокремити з `outcome="error"`.
    const metric = register.getSingleMetric("ai_request_duration_ms");
    expect(metric).toBe(aiRequestDurationMs);

    const counter = register.getSingleMetric("ai_requests_total");
    expect(counter).toBe(aiRequestsTotal);
  });

  it("експорт містить `# TYPE ai_request_duration_ms histogram` і lable-set", async () => {
    aiRequestDurationMs.observe(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        endpoint: "chat",
        outcome: "ok",
      },
      123,
    );
    const text = await register.metrics();
    expect(text).toContain("# TYPE ai_request_duration_ms histogram");
    expect(text).toMatch(
      /ai_request_duration_ms_bucket\{.*?endpoint="chat".*?outcome="ok".*?\}/,
    );
  });
});

describe("metrics registry — v2 sync op-log RED metrics (PR #048)", () => {
  it("`sync_op_log_apply_total` зареєстрований із labels {table, status, reason}", () => {
    const metric = register.getSingleMetric("sync_op_log_apply_total");
    expect(metric).toBe(syncOpLogApplyTotal);

    const lag = register.getSingleMetric("sync_op_log_pull_lag_ms");
    expect(lag).toBe(syncOpLogPullLagMs);

    const depth = register.getSingleMetric("sync_op_log_pull_queue_depth");
    expect(depth).toBe(syncOpLogPullQueueDepth);
  });

  it("апдейтиться через .inc({table,status,reason}) і експортується з повним label-set-ом", async () => {
    syncOpLogApplyTotal.inc({
      table: "nutrition_meals",
      status: "rejected",
      reason: "tombstoned",
    });
    syncOpLogApplyTotal.inc({
      table: "nutrition_meals",
      status: "applied",
      reason: "none",
    });
    const text = await register.metrics();
    expect(text).toContain("# TYPE sync_op_log_apply_total counter");
    // SLO/dashboard PromQL: `sum by (table, status) (rate(...))`. Якщо
    // лейбли drift-нуть, дашборд тихо обмалюється — тому фіксуємо
    // повний набір labels у експорті.
    expect(text).toMatch(
      /sync_op_log_apply_total\{table="nutrition_meals",status="rejected",reason="tombstoned"\} \d+/,
    );
    expect(text).toMatch(
      /sync_op_log_apply_total\{table="nutrition_meals",status="applied",reason="none"\} \d+/,
    );
  });

  it("`APPLY_REJECT_REASONS` + `ENGINE_REJECT_REASONS` фіксують cardinality budget для `reason` label-у", () => {
    // PR-C / PR #043c (Stage 5): closed allowlist причин відхилення —
    // джерело правди для `sync_op_log_apply_total{reason}`.
    // PR #042a (Stage 5): engine-level allowlist розширено `op_not_supported`
    // (gate на `op='increment'` для таблиць поза `INCREMENT_OP_SUPPORTED_TABLES`).
    // PR #042b (Stage 5): apply-level allowlist розширено `missing_delta` +
    // `invalid_delta` (PN-counter primitive payload validation у
    // `applyRoutineStreaks`).
    // Cardinality cap у `docs/observability/metrics.md` §4 = ~28 tables ×
    // 3 statuses × 53 reasons ≈ 4_452 series worst-case (phenomenologically <100,
    // більшість табл/reason-пар не зустрічаються одночасно). Якщо сума
    // елементів у двох масивах drift-ує — оновити cardinality calc у
    // metrics.md + dashboard top-10 reject reasons panel.
    expect(APPLY_REJECT_REASONS.length).toBe(47);
    expect(ENGINE_REJECT_REASONS.length).toBe(5);

    // Ключові CRDT-інваріанти, на які прив'язаний sync health alerting,
    // фіксуємо явно — щоб accidental refactor не приховав їх із
    // допустимого набору.
    expect(APPLY_REJECT_REASONS).toContain("lww_conflict");
    expect(APPLY_REJECT_REASONS).toContain("tombstoned");
    expect(APPLY_REJECT_REASONS).toContain("not_found");
    expect(APPLY_REJECT_REASONS).toContain("user_id_mismatch");
    expect(ENGINE_REJECT_REASONS).toContain("clock_skew");
    expect(ENGINE_REJECT_REASONS).toContain("apply_failed");
    expect(ENGINE_REJECT_REASONS).toContain("table_not_allowed");
    expect(ENGINE_REJECT_REASONS).toContain("op_not_supported");

    // Жодних дублікатів — Set.size має дорівнювати довжині масиву.
    const all = [...APPLY_REJECT_REASONS, ...ENGINE_REJECT_REASONS];
    expect(new Set(all).size).toBe(all.length);

    // Допустимі тільки snake_case-літерали (захист від випадкового
    // copy-paste-у з іншого namespace-у з пробілами / великими літерами).
    for (const r of all) {
      expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("histogram метрики `sync_op_log_pull_lag_ms` і `sync_op_log_pull_queue_depth` мають TYPE=histogram", async () => {
    syncOpLogPullLagMs.observe(150);
    syncOpLogPullQueueDepth.observe(42);
    const text = await register.metrics();
    expect(text).toContain("# TYPE sync_op_log_pull_lag_ms histogram");
    expect(text).toContain("# TYPE sync_op_log_pull_queue_depth histogram");
    // Bucket borders, на які зав'язані SLO-алерти (SSE happy-path <100ms,
    // polling-fallback <5s) — фіксуємо у тесті, щоб випадковий refactor
    // bucket-ів не зламав алерти.
    expect(text).toMatch(/sync_op_log_pull_lag_ms_bucket\{le="100"\}/);
    expect(text).toMatch(/sync_op_log_pull_lag_ms_bucket\{le="5000"\}/);
    expect(text).toMatch(/sync_op_log_pull_queue_depth_bucket\{le="200"\}/);
  });
});
