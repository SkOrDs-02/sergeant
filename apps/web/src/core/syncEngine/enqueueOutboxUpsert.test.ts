/**
 * Unit tests for enqueueOutboxUpsert.
 *
 * Tests use a minimal SqliteMigrationClient mock — no real SQLite is
 * required; the mock verifies the INSERT shape and idempotency logic.
 */
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  enqueueOutboxUpsert,
  type OutboxUpsertInput,
} from "./enqueueOutboxUpsert.js";

const IDEM_KEY = "00000000-0000-0000-0000-000000000001";
const USER_ID = "user-abc";
const CLIENT_TS = "2026-06-12T10:00:00.000Z";

function makeInput(
  overrides: Partial<OutboxUpsertInput> = {},
): OutboxUpsertInput {
  return {
    userId: USER_ID,
    table: "routine_entries",
    op: "insert",
    row: {
      id: "h1:2026-06-12",
      user_id: USER_ID,
      name: "Drink",
      completed_at: CLIENT_TS,
      created_at: CLIENT_TS,
      deleted_at: null,
    },
    clientTs: CLIENT_TS,
    idempotencyKey: IDEM_KEY,
    ...overrides,
  };
}

function makeMockClient(
  existingRows: { id: number }[],
  afterRows: { id: number }[],
  dedupRows: { id: number; row: string; client_ts: string }[] = [],
): { client: SqliteMigrationClient; runMock: Mock; allMock: Mock } {
  // `all` is called up to three times: content-dedup lookup, idempotency
  // pre-check, then post-insert. Cast through unknown to satisfy the
  // generic `all<R>` signature while still letting vitest record calls
  // for assertion.
  const allMock = vi
    .fn()
    .mockResolvedValueOnce(dedupRows)
    .mockResolvedValueOnce(existingRows)
    .mockResolvedValueOnce(afterRows);
  const runMock = vi.fn().mockResolvedValue(undefined);
  const client: SqliteMigrationClient = {
    exec: vi.fn(),
    run: runMock as unknown as SqliteMigrationClient["run"],
    all: allMock as unknown as SqliteMigrationClient["all"],
  };
  return { client, runMock, allMock };
}

describe("enqueueOutboxUpsert", () => {
  it("inserts a new row when idempotency key is fresh", async () => {
    const { client, runMock, allMock } = makeMockClient([], [{ id: 7 }]);

    const result = await enqueueOutboxUpsert(client, makeInput());

    expect(result).toEqual({ id: 7, inserted: true, skipped: null });

    // content-dedup lookup, then idempotency-key pre-check SELECT
    expect(allMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = 'pending'"),
      [USER_ID, "routine_entries", "insert"],
    );
    expect(allMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SELECT id FROM sync_op_outbox"),
      [IDEM_KEY],
    );

    // INSERT with correct columns
    expect(runMock).toHaveBeenCalledOnce();
    const [sql, params] = runMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT OR IGNORE INTO sync_op_outbox/);
    expect(params).toEqual([
      USER_ID,
      "routine_entries",
      "insert",
      JSON.stringify(makeInput().row),
      CLIENT_TS,
      IDEM_KEY,
    ]);
  });

  it("returns existing row without INSERT when idempotency key already exists", async () => {
    const { client, runMock } = makeMockClient([{ id: 3 }], []);

    const result = await enqueueOutboxUpsert(client, makeInput());

    expect(result).toEqual({ id: 3, inserted: false, skipped: null });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("serialises delete op correctly (id + user_id in row)", async () => {
    const { client, runMock } = makeMockClient([], [{ id: 9 }]);

    const deleteRow = { id: "h1:2026-06-12", user_id: USER_ID };
    await enqueueOutboxUpsert(
      client,
      makeInput({ op: "delete", row: deleteRow }),
    );

    const [, params] = runMock.mock.calls[0]!;
    expect(params![2]).toBe("delete");
    expect(JSON.parse(params![3] as string)).toEqual(deleteRow);
  });

  it("throws when userId is empty", async () => {
    const { client } = makeMockClient([], []);
    await expect(
      enqueueOutboxUpsert(client, makeInput({ userId: "" })),
    ).rejects.toThrow("userId is required");
  });

  it("throws when post-INSERT SELECT finds 0 rows (constraint mystery)", async () => {
    // Simulate INSERT OR IGNORE silently dropped and post-check returns []
    const allMock = vi
      .fn()
      .mockResolvedValueOnce([]) // content-dedup: no pending match
      .mockResolvedValueOnce([]) // pre-check: fresh key
      .mockResolvedValueOnce([]); // post-INSERT: nothing found
    const client: SqliteMigrationClient = {
      exec: vi.fn(),
      run: vi
        .fn()
        .mockResolvedValue(
          undefined,
        ) as unknown as SqliteMigrationClient["run"],
      all: allMock as unknown as SqliteMigrationClient["all"],
    };
    await expect(enqueueOutboxUpsert(client, makeInput())).rejects.toThrow(
      "expected exactly one row",
    );
  });

  describe("content-level dedup (double-submit protection)", () => {
    it("returns the pending row's id without a second INSERT when the same op is re-fired with a fresh idempotencyKey (double-click)", async () => {
      const pendingRow = makeInput().row; // same content as the new call
      const { client, runMock } = makeMockClient(
        [],
        [],
        [{ id: 42, row: JSON.stringify(pendingRow), client_ts: CLIENT_TS }],
      );

      // Simulates a double-click: same logical op, fresh random UUID.
      const result = await enqueueOutboxUpsert(
        client,
        makeInput({ idempotencyKey: crypto.randomUUID() }),
      );

      expect(result).toEqual({ id: 42, inserted: false, skipped: null });
      expect(runMock).not.toHaveBeenCalled();
    });

    it("ignores fields that merely echo this call's own clientTs", async () => {
      // Pending row was written a few ms earlier with its own clientTs,
      // but is otherwise identical business content once timestamps are
      // stripped.
      const priorClientTs = "2026-06-12T10:00:00.001Z";
      const priorRow = {
        id: "h1:2026-06-12",
        user_id: USER_ID,
        name: "Drink",
        completed_at: priorClientTs,
        created_at: priorClientTs,
        deleted_at: null,
      };
      const { client, runMock } = makeMockClient(
        [],
        [],
        [{ id: 42, row: JSON.stringify(priorRow), client_ts: priorClientTs }],
      );

      const result = await enqueueOutboxUpsert(client, makeInput());

      expect(result).toEqual({ id: 42, inserted: false, skipped: null });
      expect(runMock).not.toHaveBeenCalled();
    });

    it("does NOT dedup when the pending row's content actually differs", async () => {
      const { client, runMock, allMock } = makeMockClient(
        [],
        [{ id: 8 }],
        [
          {
            id: 42,
            row: JSON.stringify({ ...makeInput().row, name: "Water" }),
            client_ts: CLIENT_TS,
          },
        ],
      );

      const result = await enqueueOutboxUpsert(client, makeInput());

      expect(result).toEqual({ id: 8, inserted: true, skipped: null });
      expect(runMock).toHaveBeenCalledOnce();
      // still scoped the dedup lookup to this exact (user, table, op)
      expect(allMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("status = 'pending'"),
        [USER_ID, "routine_entries", "insert"],
      );
    });

    it("does NOT dedup across different op kinds even with identical row content", async () => {
      const sharedRow = { id: "h1:2026-06-12", user_id: USER_ID };
      const { client, runMock } = makeMockClient(
        [],
        [{ id: 8 }],
        // dedup lookup is scoped by `op` in the SQL WHERE clause itself —
        // simulate it correctly returning nothing for a different op.
        [],
      );

      const result = await enqueueOutboxUpsert(
        client,
        makeInput({ op: "delete", row: sharedRow }),
      );

      expect(result).toEqual({ id: 8, inserted: true, skipped: null });
      expect(runMock).toHaveBeenCalledOnce();
    });

    it("skips the dedup lookup entirely for non-syncable (anon/demo) user ids", async () => {
      const { client, runMock, allMock } = makeMockClient([], []);

      const result = await enqueueOutboxUpsert(
        client,
        makeInput({ userId: "local-anon" }),
      );

      expect(result).toEqual({
        id: null,
        inserted: false,
        skipped: "non-syncable-user",
      });
      expect(allMock).not.toHaveBeenCalled();
      expect(runMock).not.toHaveBeenCalled();
    });
  });
});
