/**
 * Mobile-side smoke for the routine SQLite SPIKE library
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * The repo / sync engine / migration runner are byte-identical to the
 * web copy in `apps/web/src/modules/routine/lib/sqliteSpike/` and are
 * already covered by 15 vitest cases there. This file exists so the
 * mobile bundle's test run also exercises the library against an
 * in-process SQLite engine (`better-sqlite3`) and, separately,
 * confirms the `createExpoSqliteRawClient` adapter forwards calls to
 * the underlying expo-sqlite handle correctly.
 */

import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateRoutineSpike } from "../clientMigrate";
import {
  createExpoSqliteRawClient,
  type ExpoSqliteAsyncHandle,
} from "../expoSqliteAdapter";
import {
  applyPulledRoutineEntry,
  enqueueOutboxOp,
  findRoutineEntryById,
  getPullSince,
  listActiveRoutineEntries,
  listPendingOutboxOps,
  removeOutboxOp,
  setPullSince,
  softDeleteRoutineEntry,
  upsertRoutineEntry,
} from "../repo";
import { pushPendingOutbox, recordRoutineCompletion } from "../syncEngine";

function syncClient(db: ReturnType<typeof Database>): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

describe("mobile routine SPIKE — repo round-trip on better-sqlite3", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateRoutineSpike(client);
  });

  afterEach(() => {
    db.close();
  });

  it("upsert + soft-delete + list flow", async () => {
    await upsertRoutineEntry(client, {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-A",
      name: "drink water",
      completedAt: "2026-05-02T10:00:00.000+00:00",
      createdAt: "2026-05-02T10:00:00.000+00:00",
      updatedAt: "2026-05-02T10:00:00.000+00:00",
    });
    expect(
      (await listActiveRoutineEntries(client, "user-A")).map((r) => r.name),
    ).toEqual(["drink water"]);

    await softDeleteRoutineEntry(client, {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-A",
      clientTs: "2026-05-02T10:01:00.000+00:00",
    });
    expect(await listActiveRoutineEntries(client, "user-A")).toEqual([]);

    const tomb = await findRoutineEntryById(
      client,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(tomb?.deletedAt).toBe("2026-05-02T10:01:00.000+00:00");
  });

  it("outbox enqueue / pop / pull cursor", async () => {
    await enqueueOutboxOp(client, {
      tableName: "routine_entries",
      op: "insert",
      row: { id: "x", user_id: "u", name: "n" },
      clientTs: "2026-05-02T10:00:00.000+00:00",
      idempotencyKey: "idem-1",
    });
    expect((await listPendingOutboxOps(client)).length).toBe(1);

    await removeOutboxOp(client, "idem-1");
    expect(await listPendingOutboxOps(client)).toEqual([]);

    expect(await getPullSince(client)).toBe(0);
    await setPullSince(client, 5, "2026-05-02T10:00:00.000+00:00");
    expect(await getPullSince(client)).toBe(5);
  });

  it("LWW guard ignores stale pulled ops", async () => {
    await upsertRoutineEntry(client, {
      id: "x",
      userId: "u",
      name: "fresh local",
      completedAt: null,
      createdAt: "2026-05-01T10:00:00.000+00:00",
      updatedAt: "2026-05-02T11:00:00.000+00:00",
    });

    const outcome = await applyPulledRoutineEntry(client, {
      op: "update",
      row: {
        id: "x",
        user_id: "u",
        name: "stale",
        created_at: "2026-05-01T10:00:00.000+00:00",
        updated_at: "2026-05-01T11:00:00.000+00:00",
        deleted_at: null,
      },
      clientTs: "2026-05-01T11:00:00.000+00:00",
    });
    expect(outcome).toBe("lww_conflict");
    const row = await findRoutineEntryById(client, "x");
    expect(row?.name).toBe("fresh local");
  });

  it("pushPendingOutbox marks rejected rows for triage", async () => {
    await recordRoutineCompletion(client, {
      id: "x",
      userId: "u",
      name: "n",
      completedAt: "2026-05-02T10:00:00.000+00:00",
      clientTs: "2026-05-02T10:00:00.000+00:00",
    });
    const reject = {
      pushV2: jest.fn(async (ops: { idempotency_key: string }[]) => ({
        accepted: 0,
        last_op_id: 0,
        results: ops.map((o) => ({
          idempotency_key: o.idempotency_key,
          status: "rejected" as const,
          reason: "validation_failed",
        })),
      })),
    };
    const r = await pushPendingOutbox(
      client,
      reject as unknown as Parameters<typeof pushPendingOutbox>[1],
    );
    expect(r.applied).toBe(0);
    expect(r.rejected).toBe(1);
    expect(reject.pushV2).toHaveBeenCalledTimes(1);
  });
});

describe("mobile routine SPIKE — createExpoSqliteRawClient", () => {
  it("forwards exec / run / all to the expo-sqlite handle and returns rows", async () => {
    const calls: { kind: string; sql: string; params?: readonly unknown[] }[] =
      [];
    const fakeHandle: ExpoSqliteAsyncHandle = {
      async execAsync(sql) {
        calls.push({ kind: "exec", sql });
      },
      async runAsync(sql, params) {
        calls.push({ kind: "run", sql, params });
      },
      async getAllAsync<R>(
        sql: string,
        params: readonly unknown[],
      ): Promise<R[]> {
        calls.push({ kind: "all", sql, params });
        return [{ id: "row-1" } as unknown as R];
      },
    };

    const client = createExpoSqliteRawClient(fakeHandle);
    await client.exec("CREATE TABLE x (id TEXT)");
    await client.run("INSERT INTO x (id) VALUES (?)", ["row-1"]);
    const rows = await client.all("SELECT * FROM x WHERE id = ?", ["row-1"]);

    expect(rows).toEqual([{ id: "row-1" }]);
    expect(calls).toEqual([
      { kind: "exec", sql: "CREATE TABLE x (id TEXT)" },
      { kind: "run", sql: "INSERT INTO x (id) VALUES (?)", params: ["row-1"] },
      {
        kind: "all",
        sql: "SELECT * FROM x WHERE id = ?",
        params: ["row-1"],
      },
    ]);
  });

  it("falls back to an empty params list when caller omits one", async () => {
    const calls: { kind: string; params?: readonly unknown[] }[] = [];
    const fakeHandle: ExpoSqliteAsyncHandle = {
      async execAsync() {
        // unused
      },
      async runAsync(_sql, params) {
        calls.push({ kind: "run", params });
      },
      async getAllAsync<R>(
        _sql: string,
        params: readonly unknown[],
      ): Promise<R[]> {
        calls.push({ kind: "all", params });
        return [];
      },
    };

    const client = createExpoSqliteRawClient(fakeHandle);
    // The `SqliteMigrationClient` contract requires both args; pass an
    // explicit empty params list so we exercise the adapter's
    // "fall back to []" branch on the wire side, not the call site.
    await client.run("INSERT INTO x DEFAULT VALUES", []);
    await client.all("SELECT * FROM x");

    expect(calls).toEqual([
      { kind: "run", params: [] },
      { kind: "all", params: [] },
    ]);
  });
});
