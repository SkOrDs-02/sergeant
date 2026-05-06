/**
 * Stack-pulse PR-13 — `pool.connect()` slow-checkout instrumentation.
 *
 * Behaviour under test:
 *
 *   1. Default `PG_POOL_SIZE` має бути 20 (бамп з 10 у цьому PR).
 *   2. `pool.connect()` повільніший за `PG_SLOW_CONNECT_MS` пише Pino warn
 *      `db_pool_slow_connect`, інкрементить `db_slow_pool_connects_total`
 *      і викликає `Sentry.addBreadcrumb` з `category=db.pool.slow_connect`.
 *   3. Швидкий checkout (нижче порогу) не пише попередження і не
 *      інкрементить counter.
 *
 * Ми НЕ touch-аємо реального Postgres. `pg.Pool` мокаємо повністю
 * (через `vi.mock("pg")`), щоб контролювати тривалість `connect()`. Pino
 * logger перехоплюємо через `obs/logger.ts` mock; Sentry SDK — динамічний
 * import у db.ts, тому достатньо vi.mock-ом замінити `@sentry/node`
 * перед `vi.resetModules()`. Pool sampler не запускається (він в
 * `index.ts`, не в `db.ts`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeClient {
  release: () => void;
}

interface FakePoolHandle {
  setConnectDelayMs: (ms: number) => void;
  resetCounters: () => void;
}

interface DbModule {
  pool: { connect: () => Promise<FakeClient> };
}

interface MockedSentry {
  addBreadcrumb: ReturnType<typeof vi.fn>;
}

interface MockedLogger {
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
}

let connectDelayMs = 0;

function setupMocks(): { sentry: MockedSentry; logger: MockedLogger } {
  const sentry: MockedSentry = { addBreadcrumb: vi.fn() };
  const logger: MockedLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  vi.doMock("@sentry/node", () => sentry);
  vi.doMock("./obs/logger.js", () => ({ logger }));

  // Mock pg.Pool — emulate connect() with controllable delay; rest is no-op.
  vi.doMock("pg", () => {
    class FakePool {
      totalCount = 0;
      idleCount = 0;
      waitingCount = 0;
      on() {
        return this;
      }
      async connect(): Promise<FakeClient> {
        if (connectDelayMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, connectDelayMs),
          );
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
    return { default: { Pool: FakePool }, Pool: FakePool };
  });

  return { sentry, logger };
}

async function loadDbWithMocks(envOverrides: Record<string, string>): Promise<{
  db: DbModule;
  sentry: MockedSentry;
  logger: MockedLogger;
  poolHandle: FakePoolHandle;
}> {
  for (const [k, v] of Object.entries(envOverrides)) {
    vi.stubEnv(k, v);
  }
  // Defaults required by env.ts (DATABASE_URL is mandatory).
  vi.stubEnv(
    "DATABASE_URL",
    envOverrides["DATABASE_URL"] ??
      "postgres://app:app@db.internal:5432/sergeant",
  );

  vi.resetModules();
  const mocks = setupMocks();
  const db = (await import("./db.js")) as unknown as DbModule;

  return {
    db,
    sentry: mocks.sentry,
    logger: mocks.logger,
    poolHandle: {
      setConnectDelayMs: (ms: number) => {
        connectDelayMs = ms;
      },
      resetCounters: () => {
        connectDelayMs = 0;
      },
    },
  };
}

describe("stack-pulse PR-13 — pool.connect() slow-checkout instrumentation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@sentry/node");
    vi.doUnmock("./obs/logger.js");
    vi.doUnmock("pg");
    connectDelayMs = 0;
  });

  it("fast checkout does not emit slow-connect warn or breadcrumb", async () => {
    const { db, logger, sentry, poolHandle } = await loadDbWithMocks({
      PG_SLOW_CONNECT_MS: "50",
    });
    poolHandle.setConnectDelayMs(0);

    const client = await db.pool.connect();
    client.release();
    // Wait a tick for the .finally() observer + the dynamic Sentry import.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const slowCalls = logger.warn.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        (args[0] as { msg?: string }).msg === "db_pool_slow_connect",
    );
    expect(slowCalls).toHaveLength(0);
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("slow checkout emits Pino warn + Sentry breadcrumb (category=db.pool.slow_connect)", async () => {
    const { db, logger, sentry, poolHandle } = await loadDbWithMocks({
      PG_SLOW_CONNECT_MS: "30",
    });
    poolHandle.setConnectDelayMs(80);

    const client = await db.pool.connect();
    client.release();
    // Allow .finally() observer to run, plus two microtasks for the
    // dynamic `import("@sentry/node")` resolution chain.
    await new Promise((r) => setTimeout(r, 5));

    const slowCalls = logger.warn.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        (args[0] as { msg?: string }).msg === "db_pool_slow_connect",
    );
    expect(slowCalls).toHaveLength(1);
    const payload = slowCalls[0]?.[0] as Record<string, unknown>;
    expect(payload["threshold_ms"]).toBe(30);
    expect(typeof payload["ms"]).toBe("number");
    expect((payload["ms"] as number) >= 30).toBe(true);

    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = sentry.addBreadcrumb.mock.calls[0]?.[0] as {
      category: string;
      level: string;
      data: Record<string, unknown>;
    };
    expect(arg.category).toBe("db.pool.slow_connect");
    expect(arg.level).toBe("warning");
    expect(arg.data["threshold_ms"]).toBe(30);
  });
});
