import type { Request, Response } from "express";
import client from "prom-client";
import type { Pool } from "pg";

import { env } from "../../env/env.js";
import { safeStringEqual } from "../../http/safeCompare.js";

/**
 * Prometheus-реєстр з default-метриками (event loop lag, RSS, heap, GC)
 * плюс HTTP-RED, Postgres-USE і domain-лічильники. Експортується через
 * `GET /metrics` (захищено bearer-токеном `METRICS_TOKEN`).
 */
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ───────────────────────── Postgres pool (USE) ────────────────
export const dbPoolTotal = new client.Gauge({
  name: "db_pool_total",
  help: "PG pool total connections",
  registers: [register],
});

export const dbPoolIdle = new client.Gauge({
  name: "db_pool_idle",
  help: "PG pool idle connections",
  registers: [register],
});

export const dbPoolWaiting = new client.Gauge({
  name: "db_pool_waiting",
  help: "PG pool waiting clients",
  registers: [register],
});

export const dbSlowPoolConnectsTotal = new client.Counter({
  name: "db_slow_pool_connects_total",
  help: "PG `pool.connect()` checkouts slower than PG_SLOW_CONNECT_MS — leading indicator of pool saturation before `db_pool_waiting > 0` sustains.",
  registers: [register],
});

// Single labeled gauge that mirrors `db_pool_total` / `db_pool_idle` /
// `db_pool_waiting` (above) with the `state` label model preferred for
// new dashboards. We keep both shapes so existing alerts + panels keep
// working unmodified.
//
// `state="active"`  = pool.totalCount - pool.idleCount (checked-out clients)
// `state="idle"`    = pool.idleCount                    (free connections)
// `state="waiting"` = pool.waitingCount                 (queued acquires)
export const dbPoolSizeCurrent = new client.Gauge({
  name: "db_pool_size_current",
  help: "PG pool connection count by state (active|idle|waiting)",
  labelNames: ["state"],
  registers: [register],
});

// Histogram of `pool.connect()` acquire latency in seconds. Pairs with
// `dbSlowPoolConnectsTotal` — the counter catches outliers above
// `PG_SLOW_CONNECT_MS`, this histogram gives the full p50/p95/p99
// distribution for dashboards and SLO computation.
// Buckets chosen for typical Railway / pgBouncer round-trip latencies:
// sub-ms (warm hit) → second-scale (saturation).
export const dbPoolAcquireDurationSeconds = new client.Histogram({
  name: "db_pool_acquire_duration_seconds",
  help: "Latency of pg pool.connect() acquires in seconds",
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ───────────────────────── Build info ─────────────────────────
// Const-`1` gauge with version/commit/release/env labels — the standard
// Prometheus pattern for shipping immutable build metadata. Two reasons we
// want it as a label-rich gauge instead of a plain log line at boot:
//
//   1. Dashboards can join `app_build_info` against any other series via
//      `* on (instance) group_left(version, commit) <metric>` to attribute
//      latency/error spikes to a specific deploy without re-tagging every
//      counter.
//   2. Alertmanager can include `{{ $labels.commit }}` in pages without
//      having to hit Sentry / Railway. Cardinality stays at 1 series per
//      pod (labels are constant for the process lifetime).
//
// Sources are read at module load (process.env is frozen for our purposes
// after dotenv-flow). `RAILWAY_GIT_COMMIT_SHA` is injected by Railway on
// every build; `SENTRY_RELEASE` is the canonical release tag if both
// Sentry-cli and Railway are present (Sentry-cli takes precedence). Empty
// strings collapse to `"unknown"` so PromQL queries never see an empty
// label value (which Prometheus treats as label absence — breaks joins).
export const appBuildInfo = new client.Gauge({
  name: "app_build_info",
  help: "Static gauge=1 with build/release metadata for join-on-labels in dashboards",
  labelNames: ["version", "commit", "release", "env", "node_version"],
  registers: [register],
});

appBuildInfo
  .labels({
    version: env.npm_package_version || "unknown",
    commit: (
      env.RAILWAY_GIT_COMMIT_SHA ||
      env.GIT_COMMIT ||
      env.VERCEL_GIT_COMMIT_SHA ||
      "unknown"
    ).slice(0, 12),
    release: env.SENTRY_RELEASE || env.RAILWAY_GIT_COMMIT_SHA || "unknown",
    env: env.NODE_ENV || "development",
    node_version: process.version,
  })
  .set(1);

// ───────────────────────── Helpers ────────────────────────────
export type StatusClass = "5xx" | "4xx" | "3xx" | "2xx" | "other";

/** Класифікує HTTP-статус у одне з 4 відер для SLO / latency-дашбордів. */
export function statusClass(status: number | string | undefined): StatusClass {
  const s = Number(status) || 0;
  if (s >= 500) return "5xx";
  if (s >= 400) return "4xx";
  if (s >= 300) return "3xx";
  if (s >= 200) return "2xx";
  return "other";
}

export interface PoolSamplerOptions {
  intervalMs?: number;
}

/**
 * Sample pg pool gauges periodically. Call once at boot.
 * Returns an unref-ed interval handle so the process can still exit cleanly.
 */
export function startPoolSampler(
  pool: Pool,
  { intervalMs = 10_000 }: PoolSamplerOptions = {},
): NodeJS.Timeout {
  const sample = () => {
    try {
      const total = pool.totalCount ?? 0;
      const idle = pool.idleCount ?? 0;
      const waiting = pool.waitingCount ?? 0;
      dbPoolTotal.set(total);
      dbPoolIdle.set(idle);
      dbPoolWaiting.set(waiting);
      // Same numbers re-emitted under the labeled gauge for newer
      // dashboards. `active` = currently checked-out connections.
      const active = Math.max(0, total - idle);
      dbPoolSizeCurrent.set({ state: "active" }, active);
      dbPoolSizeCurrent.set({ state: "idle" }, idle);
      dbPoolSizeCurrent.set({ state: "waiting" }, waiting);
    } catch {
      /* ignore */
    }
  };
  sample();
  const h = setInterval(sample, intervalMs);
  if (typeof h.unref === "function") h.unref();
  return h;
}

/**
 * Express handler для `GET /metrics`. Якщо задано `METRICS_TOKEN` — вимагає
 * `Authorization: Bearer <token>`. У dev/локально можна не ставити токен
 * (production хард-фейлить у `assertStartupEnv` — див. T2 audit #4).
 *
 * Токен-compare використовує `safeStringEqual` (поверх
 * `crypto.timingSafeEqual`) замість наївного `!==`, щоб не лікати
 * позицію першої розбіжності через CPU branch-timing — мережевий
 * атакуючий міг би статистично відновити токен побайтово.
 */
export function metricsHandler(req: Request, res: Response): void {
  const expected = env.METRICS_TOKEN;
  if (expected) {
    const auth = req.get("authorization") || "";
    const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!safeStringEqual(got, expected)) {
      res.status(401).type("text/plain").send("unauthorized");
      return;
    }
  }
  register
    .metrics()
    .then((body) => {
      res.setHeader("Content-Type", register.contentType);
      res.send(body);
    })
    .catch((err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : String(err);
      res.status(500).type("text/plain").send(`metrics_error: ${msg}`);
    });
}
