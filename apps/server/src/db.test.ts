/**
 * PR #046 — Runtime pool routing through `DATABASE_URL_POOL` (pgBouncer).
 *
 * The behaviour under test is purely env-derived: `POOL_VIA_PGBOUNCER` and
 * the `routedThrough` flag in `getPoolStats()` must follow whichever URL
 * the pool was constructed with at module load. Because `apps/server/src/db.ts`
 * builds its `pg.Pool` eagerly on import, each scenario re-imports the
 * module from a clean module cache via `vi.resetModules()` plus a stubbed
 * env, mirroring the pattern in `env/__tests__/assertStartupEnv.test.ts`.
 *
 * No real Postgres is touched here — `pg.Pool` instantiation does not open
 * a TCP connection; the pool only dials when `query()` / `connect()` is
 * called, which these tests intentionally avoid. Integration coverage for
 * the actual pgBouncer round-trip lives in
 * `apps/server/src/modules/sync/syncV2.integration.test.ts` via the
 * Testcontainers harness.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

interface DbModuleShape {
  POOL_VIA_PGBOUNCER: boolean;
  ensureSchema: () => Promise<void>;
  query: <T = unknown>(
    text: string | { text: string; values?: unknown[] },
    values?: unknown[],
    meta?: { op?: string; noRetry?: boolean },
  ) => Promise<{ rows: T[]; rowCount: number }>;
  getPoolStats: () => {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    routedThrough: "pgbouncer" | "direct";
  };
}

interface FakePool {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  __connectMock: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

let createdPools: FakePool[] = [];
let fsReaddir: ReturnType<typeof vi.fn> | null = null;
let fsReadFile: ReturnType<typeof vi.fn> | null = null;

function installPgMock(): void {
  createdPools = [];
  vi.doMock("pg", () => {
    class Pool {
      query = vi.fn();
      __connectMock = vi.fn(async () => ({
        query: vi.fn(),
        release: vi.fn(),
      }));
      connect = this.__connectMock;
      on = vi.fn();
      totalCount = 3;
      idleCount = 2;
      waitingCount = 1;

      constructor(public readonly config: unknown) {
        createdPools.push(this);
      }
    }
    const types = { setTypeParser: vi.fn() };
    return { default: { Pool, types }, Pool, types };
  });
}

function latestPool(): FakePool {
  const pool = createdPools.at(-1);
  if (!pool) throw new Error("pg.Pool was not constructed");
  return pool;
}

function installFsMock(): void {
  fsReaddir = vi.fn();
  fsReadFile = vi.fn();
  vi.doMock("fs/promises", () => ({
    default: {
      readdir: fsReaddir,
      readFile: fsReadFile,
    },
    readdir: fsReaddir,
    readFile: fsReadFile,
  }));
}

async function loadDb(
  envOverrides: Record<string, string | undefined>,
  opts: { mockFs?: boolean } = {},
): Promise<DbModuleShape> {
  installPgMock();
  if (opts.mockFs) installFsMock();
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      vi.stubEnv(k, "");
    } else {
      vi.stubEnv(k, v);
    }
  }
  vi.resetModules();
  return (await import("./db.js")) as unknown as DbModuleShape;
}

describe("PR #046 — runtime pool routing via DATABASE_URL_POOL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("pg");
    vi.doUnmock("fs/promises");
    vi.resetModules();
  });

  it("routes through pgBouncer when DATABASE_URL_POOL is set", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      DATABASE_URL_POOL: "postgres://app:app@pgbouncer.internal:6432/sergeant",
    });
    expect(db.POOL_VIA_PGBOUNCER).toBe(true);
    expect(db.getPoolStats().routedThrough).toBe("pgbouncer");
  });

  it("falls back to DATABASE_URL when DATABASE_URL_POOL is empty", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      DATABASE_URL_POOL: "",
    });
    expect(db.POOL_VIA_PGBOUNCER).toBe(false);
    expect(db.getPoolStats().routedThrough).toBe("direct");
  });

  it("falls back to DATABASE_URL when DATABASE_URL_POOL is unset", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      DATABASE_URL_POOL: undefined,
    });
    expect(db.POOL_VIA_PGBOUNCER).toBe(false);
    expect(db.getPoolStats().routedThrough).toBe("direct");
  });

  it("getPoolStats() preserves the existing pool counter shape", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
    });
    const stats = db.getPoolStats();
    expect(stats).toMatchObject({
      totalCount: expect.any(Number),
      idleCount: expect.any(Number),
      waitingCount: expect.any(Number),
      routedThrough: expect.stringMatching(/^(pgbouncer|direct)$/),
    });
  });
});

describe("query wrapper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("pg");
    vi.doUnmock("fs/promises");
    vi.resetModules();
  });

  it("delegates to pool.query and returns successful results", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
    });
    const pool = latestPool();
    pool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });

    const result = await db.query<{ ok: number }>("SELECT 1 AS ok", [], {
      op: "health",
    });

    expect(result.rows).toEqual([{ ok: 1 }]);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1 AS ok", []);
  });

  it("accepts object query text and retries transient PG errors", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      DB_MAX_RETRIES: "1",
    });
    const pool = latestPool();
    pool.query
      .mockRejectedValueOnce(
        Object.assign(new Error("deadlock"), { code: "40P01" }),
      )
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });

    const result = await db.query<{ ok: number }>(
      { text: "SELECT $1 AS ok" },
      [1],
      { op: "retryable" },
    );

    expect(result.rows).toEqual([{ ok: 1 }]);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenLastCalledWith("SELECT $1 AS ok", [1]);
  });

  it("does not retry when noRetry is set", async () => {
    const db = await loadDb({
      DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      DB_MAX_RETRIES: "3",
    });
    const pool = latestPool();
    pool.query.mockRejectedValue(
      Object.assign(new Error("serialization failure"), { code: "40001" }),
    );

    await expect(
      db.query("UPDATE things SET x = 1", [], {
        op: "mutation",
        noRetry: true,
      }),
    ).rejects.toThrow("serialization failure");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe("ensureSchema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("pg");
    vi.doUnmock("fs/promises");
    vi.resetModules();
  });

  it("applies pending SQL migrations and always releases the advisory lock", async () => {
    const db = await loadDb(
      {
        DATABASE_URL: "postgres://app:app@db.internal:5432/sergeant",
      },
      { mockFs: true },
    );
    fsReaddir!.mockResolvedValue([
      "001_init.sql",
      "002_rollback.down.sql",
      "003_empty.sql",
    ]);
    fsReadFile!.mockImplementation(async (filePath: string) => {
      if (filePath.includes("003_empty.sql")) return "   ";
      return "CREATE TABLE demo(id int);";
    });
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    };
    latestPool().__connectMock.mockResolvedValue(client);

    await db.ensureSchema();

    const sqlCalls = (client.query.mock.calls as unknown[][]).map((call) =>
      String(call[0]),
    );
    expect(sqlCalls[0]).toContain("pg_advisory_lock");
    expect(sqlCalls.some((sql) => sql.includes("schema_migrations"))).toBe(
      true,
    );
    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("CREATE TABLE demo(id int);");
    expect(sqlCalls).toContain("COMMIT");
    expect(sqlCalls.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(
      true,
    );
    expect(sqlCalls).not.toContain("002_rollback.down.sql");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
