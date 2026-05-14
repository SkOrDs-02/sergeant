/**
 * Pool metric emission tests for the two new metrics added in the DB
 * pool observability PR:
 *
 *   - `db_pool_acquire_duration_seconds` (histogram) — observed on
 *     EVERY `pool.connect()` checkout, fast or slow.
 *   - `db_pool_size_current{state=active|idle|waiting}` (labeled gauge)
 *     — sampled by `startPoolSampler()` alongside the existing
 *     `db_pool_total` / `db_pool_idle` / `db_pool_waiting` gauges.
 *
 * Strategy: we mock `pg` so checkouts are synchronous and we can
 * advance a fake pool's counters by hand. The prom-client default
 * registry is shared, so `metric.get()` returns observed values
 * directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeClient {
  release: () => void;
}

interface MockedLogger {
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
}

interface FakePool {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  connect: () => Promise<FakeClient>;
  on: () => unknown;
  query: () => Promise<{ rows: unknown[]; rowCount: number }>;
  end: () => Promise<void>;
}

let connectDelayMs = 0;

function setupMocks(): { logger: MockedLogger } {
  const logger: MockedLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  vi.doMock("@sentry/node", () => ({ addBreadcrumb: vi.fn() }));
  vi.doMock("./obs/logger.js", () => ({ logger }));

  vi.doMock("pg", () => {
    class FakePoolImpl implements FakePool {
      totalCount = 0;
      idleCount = 0;
      waitingCount = 0;
      on() {
        return this;
      }
      async connect(): Promise<FakeClient> {
        if (connectDelayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, connectDelayMs));
        }
        this.totalCount += 1;
        return {
          release: () => {
            this.totalCount = Math.max(0, this.totalCount - 1);
          },
        };
      }
      async query() {
        return { rows: [], rowCount: 0 };
      }
      async end() {
        /* no-op */
      }
    }
    return { default: { Pool: FakePoolImpl }, Pool: FakePoolImpl };
  });

  return { logger };
}

async function loadDbWithMocks(): Promise<{
  db: { pool: { connect: () => Promise<FakeClient> } };
}> {
  vi.stubEnv("DATABASE_URL", "postgres://app:app@db.internal:5432/sergeant");
  vi.resetModules();
  setupMocks();
  const db = (await import("./db.js")) as unknown as {
    pool: { connect: () => Promise<FakeClient> };
  };
  return { db };
}

describe("pool metrics — acquire duration histogram + labeled state gauge", () => {
  beforeEach(() => {
    connectDelayMs = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@sentry/node");
    vi.doUnmock("./obs/logger.js");
    vi.doUnmock("pg");
    connectDelayMs = 0;
  });

  it("observes pool.connect() duration into db_pool_acquire_duration_seconds histogram on every checkout", async () => {
    const { db } = await loadDbWithMocks();
    const { dbPoolAcquireDurationSeconds } = await import("./obs/metrics.js");

    const before = await dbPoolAcquireDurationSeconds.get();
    const beforeCount =
      before.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_count",
      )?.value ?? 0;

    const c1 = await db.pool.connect();
    c1.release();
    const c2 = await db.pool.connect();
    c2.release();
    const c3 = await db.pool.connect();
    c3.release();
    // Allow .finally() observers to flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const after = await dbPoolAcquireDurationSeconds.get();
    const afterCount =
      after.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_count",
      )?.value ?? 0;
    expect(afterCount - beforeCount).toBe(3);
  });

  it("observes slow acquires in the same histogram (above PG_SLOW_CONNECT_MS threshold)", async () => {
    vi.stubEnv("PG_SLOW_CONNECT_MS", "10");
    const { db } = await loadDbWithMocks();
    const { dbPoolAcquireDurationSeconds } = await import("./obs/metrics.js");
    connectDelayMs = 40;

    const before = await dbPoolAcquireDurationSeconds.get();
    const beforeCount =
      before.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_count",
      )?.value ?? 0;
    const beforeSum =
      before.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_sum",
      )?.value ?? 0;

    const c = await db.pool.connect();
    c.release();
    await new Promise((r) => setTimeout(r, 5));

    const after = await dbPoolAcquireDurationSeconds.get();
    const afterCount =
      after.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_count",
      )?.value ?? 0;
    const afterSum =
      after.values.find(
        (v) => v.metricName === "db_pool_acquire_duration_seconds_sum",
      )?.value ?? 0;

    expect(afterCount - beforeCount).toBe(1);
    // Sum increased by at least the simulated 40 ms (= 0.04 s).
    expect(afterSum - beforeSum).toBeGreaterThanOrEqual(0.03);
  });

  it("startPoolSampler emits db_pool_size_current{state=active|idle|waiting}", async () => {
    await loadDbWithMocks();
    const { startPoolSampler, dbPoolSizeCurrent } =
      await import("./obs/metrics.js");

    const fakePool = {
      totalCount: 12,
      idleCount: 4,
      waitingCount: 3,
    } as unknown as Parameters<typeof startPoolSampler>[0];

    const handle = startPoolSampler(fakePool, { intervalMs: 60_000 });
    try {
      const data = await dbPoolSizeCurrent.get();
      const byState = new Map(
        data.values.map((v) => [v.labels["state"] as string, v.value]),
      );
      // active = total - idle = 12 - 4 = 8
      expect(byState.get("active")).toBe(8);
      expect(byState.get("idle")).toBe(4);
      expect(byState.get("waiting")).toBe(3);
    } finally {
      clearInterval(handle);
    }
  });

  it("active state clamps at 0 when idleCount > totalCount (defensive)", async () => {
    await loadDbWithMocks();
    const { startPoolSampler, dbPoolSizeCurrent } =
      await import("./obs/metrics.js");

    const fakePool = {
      totalCount: 2,
      idleCount: 5, // bogus / racy snapshot
      waitingCount: 0,
    } as unknown as Parameters<typeof startPoolSampler>[0];

    const handle = startPoolSampler(fakePool, { intervalMs: 60_000 });
    try {
      const data = await dbPoolSizeCurrent.get();
      const byState = new Map(
        data.values.map((v) => [v.labels["state"] as string, v.value]),
      );
      expect(byState.get("active")).toBe(0);
    } finally {
      clearInterval(handle);
    }
  });
});
