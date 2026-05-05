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
  getPoolStats: () => {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    routedThrough: "pgbouncer" | "direct";
  };
}

async function loadDb(
  envOverrides: Record<string, string | undefined>,
): Promise<DbModuleShape> {
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
