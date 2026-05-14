/**
 * `/perf` slash-command backend — server aggregator coverage.
 *
 * Тестуємо:
 *   - `estimateQuantileFromBuckets` — pure unit (interpolation, edge cases).
 *   - Per-section reader (`fetchTopHttpRoutes`, `fetchAiLatency`,
 *     `fetchDbPool`, `fetchAiMemoryQueue`, `fetchTopErrors`) — через
 *     прямі inc/observe/set у тестовому процесі (той самий patter, що
 *     `aiCostSummary.test.ts` для prom-helpers).
 *   - `buildPerfSnapshot` — happy end-to-end + missing-metric fail-soft.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPerfSnapshot,
  estimateQuantileFromBuckets,
  fetchAiLatency,
  fetchAiMemoryQueue,
  fetchDbPool,
  fetchTopErrors,
  fetchTopHttpRoutes,
} from "./perfSnapshot.js";
import {
  aiMemoryIngestQueueDepth,
  aiRequestDurationMs,
  dbPoolIdle,
  dbPoolTotal,
  dbPoolWaiting,
  httpErrorsTotal,
  httpRequestDurationMs,
  register,
} from "../../obs/metrics.js";

beforeEach(() => {
  register.resetMetrics();
});

describe("estimateQuantileFromBuckets", () => {
  it("повертає -Infinity для порожніх / нульових даних", () => {
    expect(estimateQuantileFromBuckets([], 0, 0.95)).toBe(
      Number.NEGATIVE_INFINITY,
    );
    expect(
      estimateQuantileFromBuckets([{ le: 100, cumCount: 0 }], 0, 0.95),
    ).toBe(Number.NEGATIVE_INFINITY);
  });

  it("p50 коли всі 10 observations у [50,100] → 75ms (середина bucket-у)", () => {
    // Buckets `[le=50: cum=0, le=100: cum=10]` означає: 10 observations
    // мають value у діапазоні (50, 100]. p50 = target 5.
    // Iteration: le=50, cum=0 < 5 → skip (prevLe=50). le=100, cum=10 >= 5
    //   → bucketCount = 10, fraction = 5/10 = 0.5
    //   → result = 50 + 0.5 * (100-50) = 75ms.
    const buckets = [
      { le: 50, cumCount: 0 },
      { le: 100, cumCount: 10 },
      { le: Number.POSITIVE_INFINITY, cumCount: 10 },
    ];
    expect(estimateQuantileFromBuckets(buckets, 10, 0.5)).toBeCloseTo(75, 4);
  });

  it("p95 — інтерполяція всередині matched bucket", () => {
    // Розподіл: 90 ops в [0..50], 10 в [50..100]. p95 → target=95 → у bucket
    // [50..100], cumCount-prev = 10, fraction = (95-90)/10 = 0.5 → 50 + 0.5*50 = 75
    const buckets = [
      { le: 50, cumCount: 90 },
      { le: 100, cumCount: 100 },
      { le: Number.POSITIVE_INFINITY, cumCount: 100 },
    ];
    expect(estimateQuantileFromBuckets(buckets, 100, 0.95)).toBeCloseTo(75, 4);
  });

  it("p99 коли всі observation-и у +Inf bucket → повертає upper-bound останнього скінченного bucket-у", () => {
    const buckets = [
      { le: 100, cumCount: 0 },
      { le: 1000, cumCount: 0 },
      { le: Number.POSITIVE_INFINITY, cumCount: 50 },
    ];
    expect(estimateQuantileFromBuckets(buckets, 50, 0.99)).toBe(1000);
  });
});

describe("fetchTopHttpRoutes (real httpRequestDurationMs histogram)", () => {
  it("повертає posortovani top-N routes by call count з p50/p95/p99", async () => {
    // Mock 100 observations для GET /api/x → 90 у <50ms, 10 у <250ms
    for (let i = 0; i < 90; i++) {
      httpRequestDurationMs.observe(
        { method: "GET", path: "/api/x", status_class: "2xx" },
        30,
      );
    }
    for (let i = 0; i < 10; i++) {
      httpRequestDurationMs.observe(
        { method: "GET", path: "/api/x", status_class: "2xx" },
        200,
      );
    }
    // POST /api/y — 20 спостережень
    for (let i = 0; i < 20; i++) {
      httpRequestDurationMs.observe(
        { method: "POST", path: "/api/y", status_class: "2xx" },
        80,
      );
    }

    const top = await fetchTopHttpRoutes(5);
    expect(top.length).toBe(2);
    expect(top[0]?.method).toBe("GET");
    expect(top[0]?.path).toBe("/api/x");
    expect(top[0]?.count).toBe(100);
    expect(top[0]?.p50Ms).toBeLessThan(50); // 90/100 спостережень <50ms
    expect(top[0]?.p95Ms).toBeGreaterThan(50);
    expect(top[0]?.p95Ms).toBeLessThanOrEqual(250);
    expect(top[1]?.method).toBe("POST");
    expect(top[1]?.path).toBe("/api/y");
    expect(top[1]?.count).toBe(20);
  });

  it("повертає [] коли histogram порожній", async () => {
    const top = await fetchTopHttpRoutes(5);
    expect(top).toEqual([]);
  });

  it("обмежує до topN", async () => {
    for (let i = 0; i < 5; i++) {
      const path = `/api/r${i}`;
      for (let j = 0; j < i + 1; j++) {
        httpRequestDurationMs.observe(
          { method: "GET", path, status_class: "2xx" },
          10,
        );
      }
    }
    const top = await fetchTopHttpRoutes(2);
    expect(top.length).toBe(2);
    expect(top[0]?.path).toBe("/api/r4"); // 5 hits
    expect(top[1]?.path).toBe("/api/r3"); // 4 hits
  });

  it("агрегує однакову route з різними status_class-у одну row", async () => {
    httpRequestDurationMs.observe(
      { method: "GET", path: "/api/x", status_class: "2xx" },
      50,
    );
    httpRequestDurationMs.observe(
      { method: "GET", path: "/api/x", status_class: "5xx" },
      300,
    );
    const top = await fetchTopHttpRoutes(5);
    expect(top).toHaveLength(1);
    expect(top[0]?.count).toBe(2);
  });
});

describe("fetchAiLatency (real aiRequestDurationMs histogram)", () => {
  it("повертає per-provider p95 посортовано за count", async () => {
    for (let i = 0; i < 15; i++) {
      aiRequestDurationMs.observe(
        {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          endpoint: "chat",
          outcome: "ok",
        },
        500,
      );
    }
    for (let i = 0; i < 5; i++) {
      aiRequestDurationMs.observe(
        {
          provider: "voyage",
          model: "voyage-3",
          endpoint: "embed",
          outcome: "ok",
        },
        200,
      );
    }

    const rows = await fetchAiLatency();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.provider).toBe("anthropic");
    expect(rows[0]?.count).toBe(15);
    expect(rows[0]?.p95Ms).toBeGreaterThan(0);
    expect(rows[1]?.provider).toBe("voyage");
    expect(rows[1]?.count).toBe(5);
  });

  it("порожній histogram → [] (fail-soft)", async () => {
    const rows = await fetchAiLatency();
    expect(rows).toEqual([]);
  });
});

describe("fetchDbPool (db_pool_* gauges)", () => {
  it("повертає snapshot з derived active = total - idle", async () => {
    dbPoolTotal.set(20);
    dbPoolIdle.set(7);
    dbPoolWaiting.set(2);
    const snapshot = await fetchDbPool();
    expect(snapshot).toEqual({ total: 20, idle: 7, waiting: 2, active: 13 });
  });

  it("active не йде у негатив (total<idle — нерозумно, але safe-default 0)", async () => {
    dbPoolTotal.set(5);
    dbPoolIdle.set(10);
    dbPoolWaiting.set(0);
    const snapshot = await fetchDbPool();
    expect(snapshot?.active).toBe(0);
  });
});

describe("fetchAiMemoryQueue (ai_memory_ingest_queue_depth gauge)", () => {
  it("повертає row per status label", async () => {
    aiMemoryIngestQueueDepth.set({ status: "waiting" }, 5);
    aiMemoryIngestQueueDepth.set({ status: "active" }, 2);
    aiMemoryIngestQueueDepth.set({ status: "failed" }, 0);

    const rows = await fetchAiMemoryQueue();
    // Includes failed=0 — це валідний стан.
    expect(rows.length).toBe(3);
    const waiting = rows.find((r) => r.status === "waiting");
    expect(waiting?.depth).toBe(5);
  });

  it("порожній gauge → [] (fail-soft)", async () => {
    const rows = await fetchAiMemoryQueue();
    expect(rows).toEqual([]);
  });
});

describe("fetchTopErrors (http_errors_total counter)", () => {
  it("повертає top-N error routes by count, decending", async () => {
    httpErrorsTotal.inc(
      { method: "GET", path: "/api/a", status_class: "5xx", module: "finyk" },
      10,
    );
    httpErrorsTotal.inc(
      { method: "POST", path: "/api/b", status_class: "4xx", module: "core" },
      3,
    );
    httpErrorsTotal.inc(
      { method: "GET", path: "/api/c", status_class: "5xx", module: "core" },
      7,
    );

    const rows = await fetchTopErrors(5);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.path).toBe("/api/a");
    expect(rows[0]?.count).toBe(10);
    expect(rows[1]?.path).toBe("/api/c");
    expect(rows[2]?.path).toBe("/api/b");
  });

  it("пропускає zero-value rows", async () => {
    httpErrorsTotal.inc(
      { method: "GET", path: "/api/a", status_class: "5xx", module: "core" },
      0,
    );
    const rows = await fetchTopErrors(5);
    expect(rows).toEqual([]);
  });
});

describe("buildPerfSnapshot — end-to-end", () => {
  it("happy-path: всі секції наповнені", async () => {
    httpRequestDurationMs.observe(
      { method: "GET", path: "/api/x", status_class: "2xx" },
      40,
    );
    aiRequestDurationMs.observe(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        endpoint: "chat",
        outcome: "ok",
      },
      800,
    );
    dbPoolTotal.set(10);
    dbPoolIdle.set(5);
    dbPoolWaiting.set(0);
    aiMemoryIngestQueueDepth.set({ status: "waiting" }, 3);
    httpErrorsTotal.inc(
      { method: "GET", path: "/api/x", status_class: "5xx", module: "core" },
      1,
    );

    const snap = await buildPerfSnapshot({
      now: () => new Date("2026-05-13T19:00:00Z"),
    });
    expect(snap.generatedAt).toBe("2026-05-13T19:00:00.000Z");
    expect(snap.uptimeSeconds).toBeGreaterThan(0);
    expect(snap.topHttpRoutes).toHaveLength(1);
    expect(snap.aiLatency).toHaveLength(1);
    expect(snap.dbPool).toMatchObject({ total: 10, idle: 5, waiting: 0 });
    expect(snap.aiMemoryQueue).toHaveLength(1);
    expect(snap.topErrors).toHaveLength(1);
  });

  it("fail-soft: усі metrics нульові → snapshot валідний, секції порожні", async () => {
    const snap = await buildPerfSnapshot();
    expect(snap.topHttpRoutes).toEqual([]);
    expect(snap.aiLatency).toEqual([]);
    // dbPool тут — null або all-zeros. У тестовому процесі gauges вже
    // зареєстровані але не set-нуті → їх рестарт у beforeEach дає
    // values=[], тому fetchDbPool повертає null.
    expect(snap.dbPool === null || snap.dbPool?.total === 0).toBe(true);
    expect(snap.aiMemoryQueue).toEqual([]);
    expect(snap.topErrors).toEqual([]);
  });
});
