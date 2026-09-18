/**
 * PR #047 — Read-replica routing helpers.
 *
 * Behaviour-under-test: `REPLICA_ENABLED`, `getReplicaPoolStats()`, and the
 * presence/absence of a replica `pg.Pool` at module load. Like
 * `db.test.ts`, scenarios reload the module via `vi.resetModules()` so
 * each test sees a fresh eagerly-constructed pool.
 *
 * No real Postgres is touched — `pg.Pool` does not open TCP connections
 * until a query is issued. Integration coverage for actual replica
 * round-trip will live alongside the existing Testcontainers harness in
 * `apps/server/src/modules/sync/syncV2.integration.test.ts` (out of scope
 * for this PR — Testcontainers does not natively spin replicas).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { EndPoolOptions } from "./lib/poolShutdown.js";

type DrainReplicaResultShape =
  | { ok: true; reason: "ended" | "skipped" }
  | { ok: false; reason: "aborted"; abortedAfterMs: number }
  | { ok: false; reason: "error"; err: unknown };

interface ReplicaModuleShape {
  REPLICA_ENABLED: boolean;
  getReplicaPoolStats: () =>
    | { enabled: false }
    | {
        enabled: true;
        totalCount: number;
        idleCount: number;
        waitingCount: number;
      };
  drainReplicaPool: (
    options: Omit<EndPoolOptions, "poolLabel">,
  ) => Promise<DrainReplicaResultShape>;
}

async function loadReplica(
  envOverrides: Record<string, string | undefined>,
): Promise<ReplicaModuleShape> {
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      vi.stubEnv(k, "");
    } else {
      vi.stubEnv(k, v);
    }
  }
  vi.resetModules();
  return (await import("./dbReplica.js")) as unknown as ReplicaModuleShape;
}

describe("PR #047 — read-replica routing via DATABASE_URL_REPLICA", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("enables replica when DATABASE_URL_REPLICA is set", async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: "postgres://ro:ro@replica.internal:5432/sergeant",
    });
    expect(mod.REPLICA_ENABLED).toBe(true);
    const stats = mod.getReplicaPoolStats();
    expect(stats).toMatchObject({
      enabled: true,
      totalCount: expect.any(Number),
      idleCount: expect.any(Number),
      waitingCount: expect.any(Number),
    });
  });

  it("disables replica when DATABASE_URL_REPLICA is empty", async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: "",
    });
    expect(mod.REPLICA_ENABLED).toBe(false);
    expect(mod.getReplicaPoolStats()).toEqual({ enabled: false });
  });

  it("disables replica when DATABASE_URL_REPLICA is unset", async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: undefined,
    });
    expect(mod.REPLICA_ENABLED).toBe(false);
    expect(mod.getReplicaPoolStats()).toEqual({ enabled: false });
  });

  it("getReplicaPoolStats() shape mirrors getPoolStats() counters when enabled", async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: "postgres://ro:ro@replica.internal:5432/sergeant",
    });
    const stats = mod.getReplicaPoolStats();
    if (!stats.enabled) {
      throw new Error("expected replica enabled in this scenario");
    }
    expect(stats.totalCount).toBeGreaterThanOrEqual(0);
    expect(stats.idleCount).toBeGreaterThanOrEqual(0);
    expect(stats.waitingCount).toBeGreaterThanOrEqual(0);
  });
});

describe("drainReplicaPool — graceful-shutdown drain for the replica pool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('drains the replica pool with a `pool: "replica"` log when configured', async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: "postgres://ro:ro@replica.internal:5432/sergeant",
    });

    // Жоден query не робився → replica pool не має checked-out клієнтів, тож
    // реальний `pg.Pool.end()` резолвиться миттєво без TCP-раунд-тріпу.
    const info = vi.fn<(obj: object) => void>();
    const warn = vi.fn<(obj: object) => void>();

    const result = await mod.drainReplicaPool({
      timeoutMs: 1_000,
      logger: { info, warn },
    });

    expect(result).toEqual({ ok: true, reason: "ended" });
    expect(info).toHaveBeenCalledWith({
      msg: "pg_pool_ended",
      pool: "replica",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("is a no-op returning `skipped` when the replica is not configured", async () => {
    const mod = await loadReplica({
      DATABASE_URL: "postgres://app:app@primary.internal:5432/sergeant",
      DATABASE_URL_REPLICA: "",
    });

    const info = vi.fn<(obj: object) => void>();
    const warn = vi.fn<(obj: object) => void>();

    let thrown: unknown = null;
    let result: DrainReplicaResultShape | undefined;
    try {
      result = await mod.drainReplicaPool({
        timeoutMs: 1_000,
        logger: { info, warn },
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result).toEqual({ ok: true, reason: "skipped" });
    // No-op не має нічого дренувати чи логувати.
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
