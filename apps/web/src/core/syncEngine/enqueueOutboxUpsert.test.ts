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
): { client: SqliteMigrationClient; runMock: Mock; allMock: Mock } {
  // `all` is called twice: pre-check then post-insert.
  // Cast through unknown to satisfy the generic `all<R>` signature while
  // still letting vitest record calls for assertion.
  const allMock = vi
    .fn()
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

    expect(result).toEqual({ id: 7, inserted: true });

    // pre-check SELECT
    expect(allMock).toHaveBeenNthCalledWith(
      1,
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

    expect(result).toEqual({ id: 3, inserted: false });
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
});
