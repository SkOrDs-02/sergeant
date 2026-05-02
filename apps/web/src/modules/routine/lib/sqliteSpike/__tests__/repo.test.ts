import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPulledRoutineEntry,
  enqueueOutboxOp,
  findRoutineEntryById,
  getPullSince,
  listActiveRoutineEntries,
  listPendingOutboxOps,
  rejectOutboxOp,
  removeOutboxOp,
  setPullSince,
  softDeleteRoutineEntry,
  upsertRoutineEntry,
} from "../repo.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

/**
 * Repo unit tests for the routine SQLite SPIKE
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * Drives the raw-SQL repo helpers against an in-process
 * `better-sqlite3` instance with the bundled SPIKE migrations
 * already applied (see `testSqlite.ts`). No mocking, no jsdom — the
 * actual SQL runs on real SQLite.
 */

describe("routine SQLite SPIKE repo", () => {
  let h: TestSqliteHandle;

  beforeEach(async () => {
    h = await createTestSqlite();
  });

  afterEach(() => {
    h.close();
  });

  it("upsertRoutineEntry inserts then updates the same row by id", async () => {
    await upsertRoutineEntry(h.client, {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-A",
      name: "drink water",
      completedAt: "2026-05-02T10:00:00.000+00:00",
      createdAt: "2026-05-02T10:00:00.000+00:00",
      updatedAt: "2026-05-02T10:00:00.000+00:00",
    });
    const first = await findRoutineEntryById(
      h.client,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(first?.name).toBe("drink water");
    expect(first?.deletedAt).toBeNull();

    // Same id — name change. Upsert overwrites and bumps updated_at.
    await upsertRoutineEntry(h.client, {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-A",
      name: "drink water (renamed)",
      completedAt: "2026-05-02T11:00:00.000+00:00",
      createdAt: "2026-05-02T10:00:00.000+00:00",
      updatedAt: "2026-05-02T11:00:00.000+00:00",
    });
    const second = await findRoutineEntryById(
      h.client,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(second?.name).toBe("drink water (renamed)");
    expect(second?.completedAt).toBe("2026-05-02T11:00:00.000+00:00");
    expect(second?.updatedAt).toBe("2026-05-02T11:00:00.000+00:00");
  });

  it("listActiveRoutineEntries returns only non-tombstoned rows newest-first", async () => {
    await upsertRoutineEntry(h.client, {
      id: "a",
      userId: "user-A",
      name: "old",
      completedAt: null,
      createdAt: "2026-04-01T10:00:00.000+00:00",
      updatedAt: "2026-04-01T10:00:00.000+00:00",
    });
    await upsertRoutineEntry(h.client, {
      id: "b",
      userId: "user-A",
      name: "newer",
      completedAt: null,
      createdAt: "2026-05-01T10:00:00.000+00:00",
      updatedAt: "2026-05-01T10:00:00.000+00:00",
    });
    await upsertRoutineEntry(h.client, {
      id: "c",
      userId: "user-B",
      name: "different user",
      completedAt: null,
      createdAt: "2026-05-01T10:00:00.000+00:00",
      updatedAt: "2026-05-01T10:00:00.000+00:00",
    });

    let rows = await listActiveRoutineEntries(h.client, "user-A");
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);

    await softDeleteRoutineEntry(h.client, {
      id: "b",
      userId: "user-A",
      clientTs: "2026-05-02T10:00:00.000+00:00",
    });
    rows = await listActiveRoutineEntries(h.client, "user-A");
    expect(rows.map((r) => r.id)).toEqual(["a"]);

    // Tombstoned row still findable via findRoutineEntryById.
    const b = await findRoutineEntryById(h.client, "b");
    expect(b?.deletedAt).toBe("2026-05-02T10:00:00.000+00:00");
  });

  it("outbox enqueue / list / remove / reject lifecycle", async () => {
    await enqueueOutboxOp(h.client, {
      tableName: "routine_entries",
      op: "insert",
      row: { id: "x", user_id: "u", name: "n" },
      clientTs: "2026-05-02T10:00:00.000+00:00",
      idempotencyKey: "idem-1",
    });
    await enqueueOutboxOp(h.client, {
      tableName: "routine_entries",
      op: "delete",
      row: { id: "x", user_id: "u" },
      clientTs: "2026-05-02T10:00:01.000+00:00",
      idempotencyKey: "idem-2",
    });
    const pending = await listPendingOutboxOps(h.client);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.idempotencyKey).toBe("idem-1");
    expect(pending[1]!.idempotencyKey).toBe("idem-2");

    await removeOutboxOp(h.client, "idem-1");
    expect(
      (await listPendingOutboxOps(h.client)).map((r) => r.idempotencyKey),
    ).toEqual(["idem-2"]);

    await rejectOutboxOp(h.client, "idem-2", "schema_mismatch");
    expect(await listPendingOutboxOps(h.client)).toHaveLength(0);

    // Direct DB peek to confirm reject row is preserved with reason.
    const rejected = h.db
      .prepare(
        `SELECT idempotency_key, status, reject_reason FROM sync_op_outbox`,
      )
      .all() as {
      idempotency_key: string;
      status: string;
      reject_reason: string;
    }[];
    expect(rejected).toEqual([
      {
        idempotency_key: "idem-2",
        status: "rejected",
        reject_reason: "schema_mismatch",
      },
    ]);
  });

  it("outbox UNIQUE(idempotency_key) prevents accidental duplicate enqueue", async () => {
    await enqueueOutboxOp(h.client, {
      tableName: "routine_entries",
      op: "insert",
      row: { id: "x" },
      clientTs: "2026-05-02T10:00:00.000+00:00",
      idempotencyKey: "idem-1",
    });
    await expect(
      enqueueOutboxOp(h.client, {
        tableName: "routine_entries",
        op: "insert",
        row: { id: "y" },
        clientTs: "2026-05-02T10:00:00.000+00:00",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow();
  });

  it("pull cursor: getPullSince returns 0 by default and persists set values", async () => {
    expect(await getPullSince(h.client)).toBe(0);
    await setPullSince(h.client, 42, "2026-05-02T10:00:00.000+00:00");
    expect(await getPullSince(h.client)).toBe(42);
    await setPullSince(h.client, 99, "2026-05-02T11:00:00.000+00:00");
    expect(await getPullSince(h.client)).toBe(99);
  });

  describe("applyPulledRoutineEntry — LWW guard", () => {
    it("applies an op when local row is older or absent", async () => {
      // Local row, older than incoming.
      await upsertRoutineEntry(h.client, {
        id: "x",
        userId: "u",
        name: "old",
        completedAt: null,
        createdAt: "2026-05-01T10:00:00.000+00:00",
        updatedAt: "2026-05-01T10:00:00.000+00:00",
      });
      const outcome = await applyPulledRoutineEntry(h.client, {
        op: "update",
        row: {
          id: "x",
          user_id: "u",
          name: "new from server",
          completed_at: "2026-05-02T11:00:00.000+00:00",
          created_at: "2026-05-01T10:00:00.000+00:00",
          updated_at: "2026-05-02T11:00:00.000+00:00",
          deleted_at: null,
        },
        clientTs: "2026-05-02T11:00:00.000+00:00",
      });
      expect(outcome).toBe("applied");
      const row = await findRoutineEntryById(h.client, "x");
      expect(row?.name).toBe("new from server");
      expect(row?.completedAt).toBe("2026-05-02T11:00:00.000+00:00");
      expect(row?.updatedAt).toBe("2026-05-02T11:00:00.000+00:00");
    });

    it("ignores an op when local row is newer (LWW conflict)", async () => {
      await upsertRoutineEntry(h.client, {
        id: "x",
        userId: "u",
        name: "fresh local",
        completedAt: "2026-05-02T11:00:00.000+00:00",
        createdAt: "2026-05-01T10:00:00.000+00:00",
        updatedAt: "2026-05-02T11:00:00.000+00:00",
      });
      const outcome = await applyPulledRoutineEntry(h.client, {
        op: "update",
        row: {
          id: "x",
          user_id: "u",
          name: "stale from server",
          completed_at: null,
          created_at: "2026-05-01T10:00:00.000+00:00",
          updated_at: "2026-05-01T11:00:00.000+00:00",
          deleted_at: null,
        },
        clientTs: "2026-05-01T11:00:00.000+00:00",
      });
      expect(outcome).toBe("lww_conflict");
      const row = await findRoutineEntryById(h.client, "x");
      expect(row?.name).toBe("fresh local");
      expect(row?.updatedAt).toBe("2026-05-02T11:00:00.000+00:00");
    });

    it("delete op writes a tombstone with the incoming clientTs", async () => {
      await upsertRoutineEntry(h.client, {
        id: "x",
        userId: "u",
        name: "n",
        completedAt: null,
        createdAt: "2026-05-01T10:00:00.000+00:00",
        updatedAt: "2026-05-01T10:00:00.000+00:00",
      });
      const outcome = await applyPulledRoutineEntry(h.client, {
        op: "delete",
        row: { id: "x" },
        clientTs: "2026-05-02T10:00:00.000+00:00",
      });
      expect(outcome).toBe("applied");
      const row = await findRoutineEntryById(h.client, "x");
      expect(row?.deletedAt).toBe("2026-05-02T10:00:00.000+00:00");
    });

    it("rejects malformed payloads", async () => {
      const outcome = await applyPulledRoutineEntry(h.client, {
        op: "insert",
        row: {},
        clientTs: "2026-05-02T10:00:00.000+00:00",
      });
      expect(outcome).toBe("missing_id");
    });
  });
});
