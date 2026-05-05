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
