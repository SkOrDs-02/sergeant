import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import type { Pool } from "pg";

let container: StartedTestContainer | undefined;
let primary: Pool | undefined;
let routing: typeof import("./dbReplica.js") | undefined;

beforeAll(async () => {
  // Two real pools on one disposable Postgres exercise pg's wire protocol,
  // client release and fallback. This does not simulate replication or lag.
  container = await new GenericContainer("pgvector/pgvector:pg17")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "routing_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();
  const uri = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/routing_test`;
  vi.stubEnv("DATABASE_URL", `${uri}?application_name=routing_primary`);
  vi.stubEnv("DATABASE_URL_REPLICA", `${uri}?application_name=routing_replica`);
  routing = await import("./dbReplica.js");
  primary = (await import("./db.js")).default;
});

afterAll(async () => {
  try {
    // The final test ends replica early to exercise failure recovery.
    if (
      routing?.__replicaPoolForTests &&
      !routing.__replicaPoolForTests.ended
    ) {
      await routing.__replicaPoolForTests.end();
    }
    await primary?.end();
  } finally {
    await container?.stop();
    vi.unstubAllEnvs();
  }
});

const SELECT_ROUTE =
  "SELECT current_setting('application_name') AS route, $1::int AS value";

describe("read routing — real Postgres pools", () => {
  it("executes parameterized reads on the replica connection", async () => {
    const result = await routing!.queryReplica(SELECT_ROUTE, [42]);
    expect(result.rows).toEqual([{ route: "routing_replica", value: 42 }]);
    expect(primary!.totalCount).toBe(0);
  });

  it("runs a read-only transaction and returns the client to replica", async () => {
    const result = await routing!.withReplicaClient(async (client) => {
      await client.query("BEGIN READ ONLY");
      const response = await client.query(SELECT_ROUTE, [7]);
      await client.query("COMMIT");
      return response;
    });
    expect(result.rows).toEqual([{ route: "routing_replica", value: 7 }]);
    const stats = routing!.getReplicaPoolStats();
    expect(stats.enabled).toBe(true);
    if (!stats.enabled) throw new Error("expected configured replica");
    expect(stats.totalCount).toBeGreaterThan(0);
    expect(stats.idleCount).toBe(stats.totalCount);
    expect(stats.waitingCount).toBe(0);
    expect(primary!.totalCount).toBe(0);
  });

  it("recovers from a real replica SQL error using primary", async () => {
    // The primary and replica have distinct application_name values: this
    // expression raises division-by-zero only on the replica connection.
    const response = await routing!.queryReplica(
      "SELECT 1 / CASE WHEN current_setting('application_name') = 'routing_replica' THEN 0 ELSE 1 END AS value, current_setting('application_name') AS route",
    );
    expect(response.rows).toEqual([{ value: 1, route: "routing_primary" }]);
    // A failed statement must not poison subsequent replica reads.
    expect((await routing!.queryReplica(SELECT_ROUTE, [8])).rows).toEqual([
      { route: "routing_replica", value: 8 },
    ]);
  });

  it("falls back for both query and client acquisition after replica shuts down", async () => {
    await routing!.__replicaPoolForTests!.end();
    expect((await routing!.queryReplica(SELECT_ROUTE, [9])).rows).toEqual([
      { route: "routing_primary", value: 9 },
    ]);
    const result = await routing!.withReplicaClient((client) =>
      client.query(SELECT_ROUTE, [10]),
    );
    expect(result.rows).toEqual([{ route: "routing_primary", value: 10 }]);
    expect(primary!.idleCount).toBe(primary!.totalCount);
    expect(primary!.waitingCount).toBe(0);
  });
});
