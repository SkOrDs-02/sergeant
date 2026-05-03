import type {
  SyncV2Endpoints,
  SyncV2OpResult,
  SyncV2PullOp,
  SyncV2PullResponse,
  SyncV2PushOp,
  SyncV2PushResponse,
} from "@sergeant/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueOutboxOp,
  findRoutineEntryById,
  getPullSince,
  listActiveRoutineEntries,
  listPendingOutboxOps,
  upsertRoutineEntry,
} from "../repo.js";
import {
  deleteRoutineCompletion,
  pullSince,
  pushPendingOutbox,
  recordRoutineCompletion,
} from "../syncEngine.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

/**
 * Sync engine roundtrip tests for the routine SQLite SPIKE
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * Drives `pushPendingOutbox` and `pullSince` against an in-process
 * SQLite database and a hand-rolled mock that emulates the v2 sync
 * server's accept-everything-LWW behaviour. The mock is intentionally
 * minimal — we already have full server-side coverage in
 * `apps/server/src/modules/sync/__tests__/syncV2.*.test.ts`. These
 * tests focus on the **client side**: outbox draining, cursor
 * persistence, idempotency-key handling, and apply-pulled-op shape.
 */

interface RecordedRequest {
  ops: SyncV2PushOp[];
  originDeviceId?: string;
}

function makeMockServer() {
  let nextOpId = 0;
  const stored: SyncV2PullOp[] = [];
  const pushRequests: RecordedRequest[] = [];

  const pushV2 = vi.fn(
    async (
      ops: SyncV2PushOp[],
      opts?: { originDeviceId?: string },
    ): Promise<SyncV2PushResponse> => {
      pushRequests.push({ ops, originDeviceId: opts?.originDeviceId });
      const results: SyncV2OpResult[] = [];
      let lastOpId = 0;
      for (const op of ops) {
        nextOpId++;
        lastOpId = nextOpId;
        stored.push({
          id: nextOpId,
          table: op.table,
          op: op.op,
          row: op.row,
          client_ts: op.client_ts,
          server_ts: new Date(nextOpId * 1000).toISOString(),
          origin_device_id: opts?.originDeviceId ?? null,
        });
        results.push({
          idempotency_key: op.idempotency_key,
          status: "applied",
        });
      }
      return { accepted: ops.length, last_op_id: lastOpId, results };
    },
  );

  const pullV2 = vi.fn(
    async (
      since = 0,
      opts?: { limit?: number; originDeviceId?: string },
    ): Promise<SyncV2PullResponse> => {
      const limit = opts?.limit ?? 100;
      const filtered = stored.filter(
        (o) =>
          o.id > since &&
          (opts?.originDeviceId == null ||
            o.origin_device_id !== opts.originDeviceId),
      );
      const page = filtered.slice(0, limit);
      const next_cursor: number | null =
        filtered.length > limit ? page[page.length - 1]!.id : null;
      return { ops: page, next_cursor };
    },
  );

  return {
    endpoints: { pushV2, pullV2 } satisfies SyncV2Endpoints,
    pushRequests,
    /** Test helper: server-side seed (e.g. from a different device). */
    seed(op: Omit<SyncV2PullOp, "id" | "server_ts">) {
      nextOpId++;
      stored.push({
        id: nextOpId,
        server_ts: new Date(nextOpId * 1000).toISOString(),
        ...op,
      });
      return nextOpId;
    },
    pushV2,
    pullV2,
  };
}

describe("routine SQLite SPIKE sync engine", () => {
  let h: TestSqliteHandle;

  beforeEach(async () => {
    h = await createTestSqlite();
  });

  afterEach(() => {
    h.close();
  });

  it("pushPendingOutbox drains pending ops and removes applied rows", async () => {
    const server = makeMockServer();

    await recordRoutineCompletion(h.client, {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-A",
      name: "drink water",
      completedAt: "2026-05-02T10:00:00.000+00:00",
      clientTs: "2026-05-02T10:00:00.000+00:00",
    });
    await recordRoutineCompletion(h.client, {
      id: "22222222-2222-4222-8222-222222222222",
      userId: "user-A",
      name: "stretch",
      completedAt: "2026-05-02T10:01:00.000+00:00",
      clientTs: "2026-05-02T10:01:00.000+00:00",
    });

    expect((await listPendingOutboxOps(h.client)).length).toBe(2);

    const result = await pushPendingOutbox(h.client, server.endpoints, {
      originDeviceId: "device-X",
    });

    expect(result.attempted).toBe(2);
    expect(result.applied).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.lastOpId).toBe(2);

    expect(server.pushV2).toHaveBeenCalledTimes(1);
    expect(server.pushRequests[0]!.originDeviceId).toBe("device-X");
    // Sent ops carry the wire-shape row payload from the outbox.
    const sent = server.pushRequests[0]!.ops;
    expect(sent[0]!.table).toBe("routine_entries");
    expect(sent[0]!.op).toBe("insert");
    expect(sent[0]!.row).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-A",
      name: "drink water",
    });

    // Outbox is empty after applied — local row stays.
    expect(await listPendingOutboxOps(h.client)).toEqual([]);
    const local = await listActiveRoutineEntries(h.client, "user-A");
    expect(local.map((r) => r.name).sort()).toEqual(["drink water", "stretch"]);
  });

  it("pushPendingOutbox marks rejected rows but keeps them for triage", async () => {
    let call = 0;
    const reject: SyncV2Endpoints = {
      pushV2: vi.fn(
        async (ops: SyncV2PushOp[]): Promise<SyncV2PushResponse> => {
          call++;
          return {
            accepted: 0,
            last_op_id: 0,
            results: ops.map((op) => ({
              idempotency_key: op.idempotency_key,
              status: "rejected",
              reason: "validation_failed",
            })),
          };
        },
      ),
      pullV2: vi.fn(),
    };

    await enqueueOutboxOp(h.client, {
      tableName: "routine_entries",
      op: "insert",
      row: { id: "x", user_id: "u", name: "n" },
      clientTs: "2026-05-02T10:00:00.000+00:00",
      idempotencyKey: "idem-1",
    });

    const r = await pushPendingOutbox(h.client, reject);
    expect(call).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.applied).toBe(0);

    // Pending list no longer surfaces rejected rows.
    expect(await listPendingOutboxOps(h.client)).toEqual([]);

    // But they remain in the table with the reason populated.
    const all = h.db
      .prepare(
        `SELECT idempotency_key, status, reject_reason FROM sync_op_outbox`,
      )
      .all() as {
      idempotency_key: string;
      status: string;
      reject_reason: string;
    }[];
    expect(all).toEqual([
      {
        idempotency_key: "idem-1",
        status: "rejected",
        reject_reason: "validation_failed",
      },
    ]);
  });

  it("pullSince applies fetched ops and persists the cursor", async () => {
    const server = makeMockServer();

    // Server-side state: a row pushed by another device.
    server.seed({
      table: "routine_entries",
      op: "insert",
      row: {
        id: "remote-1",
        user_id: "user-A",
        name: "from device-Y",
        completed_at: "2026-05-02T09:00:00.000+00:00",
        created_at: "2026-05-02T09:00:00.000+00:00",
        updated_at: "2026-05-02T09:00:00.000+00:00",
        deleted_at: null,
      },
      client_ts: "2026-05-02T09:00:00.000+00:00",
      origin_device_id: "device-Y",
    });
    server.seed({
      table: "routine_entries",
      op: "insert",
      row: {
        id: "remote-2",
        user_id: "user-A",
        name: "second from device-Y",
        completed_at: "2026-05-02T09:05:00.000+00:00",
        created_at: "2026-05-02T09:05:00.000+00:00",
        updated_at: "2026-05-02T09:05:00.000+00:00",
        deleted_at: null,
      },
      client_ts: "2026-05-02T09:05:00.000+00:00",
      origin_device_id: "device-Y",
    });

    expect(await getPullSince(h.client)).toBe(0);

    const result = await pullSince(h.client, server.endpoints, {
      originDeviceId: "device-X",
    });

    expect(result.applied).toBe(2);
    expect(result.conflicts).toBe(0);
    expect(result.cursor).toBe(2);
    expect(await getPullSince(h.client)).toBe(2);

    const local = await listActiveRoutineEntries(h.client, "user-A");
    expect(local.map((r) => r.id).sort()).toEqual(["remote-1", "remote-2"]);
  });

  it("pull skips ops originating from our own device when originDeviceId is set", async () => {
    const server = makeMockServer();

    server.seed({
      table: "routine_entries",
      op: "insert",
      row: {
        id: "echo",
        user_id: "user-A",
        name: "ours",
        completed_at: null,
        created_at: "2026-05-02T09:00:00.000+00:00",
        updated_at: "2026-05-02T09:00:00.000+00:00",
        deleted_at: null,
      },
      client_ts: "2026-05-02T09:00:00.000+00:00",
      origin_device_id: "device-X",
    });

    const result = await pullSince(h.client, server.endpoints, {
      originDeviceId: "device-X",
    });

    expect(result.applied).toBe(0);
    // Cursor stays at 0 because no ops were returned.
    expect(await getPullSince(h.client)).toBe(0);
  });

  it("end-to-end: push then pull leaves both devices converged", async () => {
    const server = makeMockServer();

    // Device-X creates two completions.
    await recordRoutineCompletion(h.client, {
      id: "x-1",
      userId: "user-A",
      name: "first",
      completedAt: "2026-05-02T10:00:00.000+00:00",
      clientTs: "2026-05-02T10:00:00.000+00:00",
    });
    await deleteRoutineCompletion(h.client, {
      id: "x-1",
      userId: "user-A",
      clientTs: "2026-05-02T10:01:00.000+00:00",
    });
    await pushPendingOutbox(h.client, server.endpoints, {
      originDeviceId: "device-X",
    });

    // Simulate a device-Y push by seeding the server directly (would
    // arrive via the same endpoint in production).
    server.seed({
      table: "routine_entries",
      op: "insert",
      row: {
        id: "y-1",
        user_id: "user-A",
        name: "from device-Y",
        completed_at: "2026-05-02T11:00:00.000+00:00",
        created_at: "2026-05-02T11:00:00.000+00:00",
        updated_at: "2026-05-02T11:00:00.000+00:00",
        deleted_at: null,
      },
      client_ts: "2026-05-02T11:00:00.000+00:00",
      origin_device_id: "device-Y",
    });

    // Device-X pulls. Should pick up device-Y's row but skip the
    // x-1 echoes. The `x-1` insert + delete pair is filtered out by
    // the originDeviceId guard since both ops were pushed by us.
    const pullResult = await pullSince(h.client, server.endpoints, {
      originDeviceId: "device-X",
    });
    expect(pullResult.applied).toBe(1);

    const active = await listActiveRoutineEntries(h.client, "user-A");
    expect(active.map((r) => r.id)).toEqual(["y-1"]);

    // Verify x-1 still has its tombstone locally — the optimistic
    // local write survived the pull, the server merely never echoed
    // it back (originDeviceId filter).
    const tombstoned = await findRoutineEntryById(h.client, "x-1");
    expect(tombstoned?.deletedAt).toBe("2026-05-02T10:01:00.000+00:00");
  });

  it("LWW conflict: locally-newer row survives an older pulled op", async () => {
    const server = makeMockServer();

    // Local write at T2.
    await upsertRoutineEntry(h.client, {
      id: "shared",
      userId: "user-A",
      name: "local fresh",
      completedAt: "2026-05-02T11:00:00.000+00:00",
      createdAt: "2026-05-01T10:00:00.000+00:00",
      updatedAt: "2026-05-02T11:00:00.000+00:00",
    });

    // Server has an older version (T1).
    server.seed({
      table: "routine_entries",
      op: "update",
      row: {
        id: "shared",
        user_id: "user-A",
        name: "server stale",
        completed_at: null,
        created_at: "2026-05-01T10:00:00.000+00:00",
        updated_at: "2026-05-01T11:00:00.000+00:00",
        deleted_at: null,
      },
      client_ts: "2026-05-01T11:00:00.000+00:00",
      origin_device_id: "device-Y",
    });

    const result = await pullSince(h.client, server.endpoints);
    expect(result.applied).toBe(0);
    expect(result.conflicts).toBe(1);

    const row = await findRoutineEntryById(h.client, "shared");
    expect(row?.name).toBe("local fresh");
    expect(row?.updatedAt).toBe("2026-05-02T11:00:00.000+00:00");
  });
});
