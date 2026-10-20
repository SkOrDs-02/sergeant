import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

let primary: Pool;
let replica: Pool | null;

async function loadReplica(enabled = true) {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@primary.invalid/test");
  vi.stubEnv(
    "DATABASE_URL_REPLICA",
    enabled ? "postgres://test:test@replica.invalid/test" : "",
  );
  const mod = await import("./dbReplica.js");
  primary = (await import("./db.js")).default;
  replica = mod.__replicaPoolForTests;
  return mod;
}

function clientFixture() {
  const release = vi.fn();
  return { client: { release } as unknown as PoolClient, release };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([primary?.end(), replica?.end()]);
  vi.unstubAllEnvs();
});

describe("queryReplica routing and failures", () => {
  it("returns the replica result without querying primary", async () => {
    const { queryReplica } = await loadReplica();
    const result = { rows: [{ count: 7 }], rowCount: 1 };
    const replicaQuery = vi
      .spyOn(replica!, "query")
      .mockImplementation(async () => result);
    const primaryQuery = vi.spyOn(primary, "query");

    await expect(queryReplica("SELECT $1::int AS count", [7])).resolves.toBe(
      result,
    );
    expect(replicaQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT $1::int AS count",
      [7],
    );
    expect(primaryQuery).not.toHaveBeenCalled();
  });

  it("uses primary directly when no replica is configured", async () => {
    const { queryReplica } = await loadReplica(false);
    const result = { rows: [{ count: 3 }], rowCount: 1 };
    const query = vi
      .spyOn(primary, "query")
      .mockImplementation(async () => result);

    await expect(queryReplica("SELECT 3 AS count")).resolves.toBe(result);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "SELECT 3 AS count",
      undefined,
    );
  });

  it.each([
    Object.assign(new Error("replica unavailable"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("statement timeout"), { code: "57014" }),
    "non-Error rejection",
    null,
  ])("falls back once after replica rejects with %s", async (error) => {
    const { queryReplica } = await loadReplica();
    const result = { rows: [{ count: 9 }], rowCount: 1 };
    vi.spyOn(replica!, "query").mockRejectedValue(error);
    const query = vi
      .spyOn(primary, "query")
      .mockImplementation(async () => result);
    const { logger } = await import("./obs/logger.js");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(
      queryReplica("SELECT $1::int", [9], { op: "analytics" }),
    ).resolves.toBe(result);
    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT $1::int", [9]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "db_replica_query_failed_fallback_primary",
        op: "analytics",
      }),
    );
  });

  it.each([false, true])(
    "uses the supplied primary override (replica enabled: %s)",
    async (enabled) => {
      const { queryReplica } = await loadReplica(enabled);
      if (replica)
        vi.spyOn(replica, "query").mockRejectedValue(new Error("offline"));
      const defaultQuery = vi.spyOn(primary, "query");
      const result = { rows: [{ count: 5 }] };
      const query = vi.fn().mockImplementation(async () => result);

      await expect(
        queryReplica("SELECT $1::int", [5], { primary: { query } }),
      ).resolves.toBe(result);
      expect(query).toHaveBeenCalledExactlyOnceWith("SELECT $1::int", [5]);
      expect(defaultQuery).not.toHaveBeenCalled();
    },
  );

  it("propagates primary failure without retrying either pool", async () => {
    const { queryReplica } = await loadReplica();
    const replicaQuery = vi
      .spyOn(replica!, "query")
      .mockRejectedValue(new Error("replica down"));
    const error = new Error("primary down");
    const primaryQuery = vi.spyOn(primary, "query").mockRejectedValue(error);

    await expect(queryReplica("SELECT 1")).rejects.toBe(error);
    expect(replicaQuery).toHaveBeenCalledTimes(1);
    expect(primaryQuery).toHaveBeenCalledTimes(1);
  });

  it("logs idle replica pool errors without throwing", async () => {
    await loadReplica();
    const { logger } = await import("./obs/logger.js");
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});

    expect(() =>
      replica!.emit("error", new Error("connection lost")),
    ).not.toThrow();
    expect(error).toHaveBeenCalledExactlyOnceWith({
      msg: "db_replica_pool_error",
      err: { message: "connection lost" },
    });
  });
});

describe("withReplicaClient resource lifecycle", () => {
  it("releases the replica client after a successful callback", async () => {
    const { withReplicaClient } = await loadReplica();
    const { client, release } = clientFixture();
    vi.spyOn(replica!, "connect").mockImplementation(async () => client);
    const primaryConnect = vi.spyOn(primary, "connect");
    const fn = vi.fn().mockResolvedValue({ count: 8 });

    await expect(withReplicaClient(fn)).resolves.toEqual({ count: 8 });
    expect(fn).toHaveBeenCalledExactlyOnceWith(client);
    expect(release).toHaveBeenCalledExactlyOnceWith();
    expect(primaryConnect).not.toHaveBeenCalled();
  });

  it("falls back to primary when acquiring a replica client fails", async () => {
    const { withReplicaClient } = await loadReplica();
    vi.spyOn(replica!, "connect").mockRejectedValue(
      new Error("connection refused"),
    );
    const { client, release } = clientFixture();
    vi.spyOn(primary, "connect").mockImplementation(async () => client);
    const fn = vi.fn().mockResolvedValue(11);

    await expect(withReplicaClient(fn, { op: "report" })).resolves.toBe(11);
    expect(fn).toHaveBeenCalledExactlyOnceWith(client);
    expect(release).toHaveBeenCalledExactlyOnceWith();
  });

  it("releases a failed replica callback before trying primary", async () => {
    const { withReplicaClient } = await loadReplica();
    const replicaClient = clientFixture();
    const primaryClient = clientFixture();
    vi.spyOn(replica!, "connect").mockImplementation(
      async () => replicaClient.client,
    );
    const connect = vi
      .spyOn(primary, "connect")
      .mockImplementation(async () => {
        expect(replicaClient.release).toHaveBeenCalledExactlyOnceWith();
        return primaryClient.client;
      });
    const fn = vi.fn(async (client: PoolClient) => {
      if (client === replicaClient.client)
        throw new Error("replica read failed");
      return "primary result";
    });

    await expect(withReplicaClient(fn)).resolves.toBe("primary result");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls.map(([client]) => client)).toEqual([
      replicaClient.client,
      primaryClient.client,
    ]);
    expect(primaryClient.release).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([false, true])(
    "releases primary even when its callback rejects (replica enabled: %s)",
    async (enabled) => {
      const { withReplicaClient } = await loadReplica(enabled);
      if (replica)
        vi.spyOn(replica, "connect").mockRejectedValue(new Error("offline"));
      const { client, release } = clientFixture();
      vi.spyOn(primary, "connect").mockImplementation(async () => client);
      const error = new Error("primary query failed");
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withReplicaClient(fn)).rejects.toBe(error);
      expect(fn).toHaveBeenCalledExactlyOnceWith(client);
      expect(release).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("propagates a primary connection failure without calling the callback", async () => {
    const { withReplicaClient } = await loadReplica();
    vi.spyOn(replica!, "connect").mockRejectedValue(new Error("replica down"));
    const error = new Error("primary connection failed");
    vi.spyOn(primary, "connect").mockRejectedValue(error);
    const fn = vi.fn();

    await expect(withReplicaClient(fn)).rejects.toBe(error);
    expect(fn).not.toHaveBeenCalled();
  });
});
