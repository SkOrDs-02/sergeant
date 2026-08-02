import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "@sergeant/db-schema/migrate/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./sqliteWriter/__tests__/testSqlite";
import { clearFizrukInjury, markFizrukInjuries } from "./injuryRepository";

const USER_ID = "user-injury-test";
const NOTED_AT = "2026-08-01T10:00:00.000Z";
let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  // The production boot sequence creates the shared sync-v2 outbox before
  // feature repositories enqueue mutations. Mirror that prerequisite here.
  await runMigrations({
    adapter: createSqliteAdapter(handle.client),
    files: ROUTINE_CLIENT_MIGRATIONS,
    tableName: "__sync_test_migrations",
  });
});

afterEach(() => handle.close());

describe("injuryRepository", () => {
  it("writes one active row per group and enqueues exact insert payloads", async () => {
    const created = await markFizrukInjuries(
      handle.client,
      USER_ID,
      ["chest", "chest", "lower-back", "unknown"],
      NOTED_AT,
    );

    expect(created.map((row) => row.muscleGroup)).toEqual([
      "chest",
      "lower-back",
    ]);
    const outbox = await handle.client.all<{
      op: string;
      row: string;
    }>(
      `SELECT op, row FROM sync_op_outbox
        WHERE user_id = ? AND table_name = ? ORDER BY id`,
      [USER_ID, "fizruk_injuries"],
    );
    expect(outbox).toHaveLength(2);
    expect(JSON.parse(outbox[0]!.row)).toEqual({
      id: created[0]!.id,
      user_id: USER_ID,
      muscle_group: "chest",
      noted_at: NOTED_AT,
      cleared_at: null,
    });
  });

  it("clears by update and never creates a delete op", async () => {
    const [created] = await markFizrukInjuries(
      handle.client,
      USER_ID,
      ["chest"],
      NOTED_AT,
    );
    const clearedAt = "2026-08-02T10:00:00.000Z";
    const cleared = await clearFizrukInjury(
      handle.client,
      USER_ID,
      created!.id,
      clearedAt,
    );

    expect(cleared?.clearedAt).toBe(clearedAt);
    const ops = await handle.client.all<{ op: string }>(
      `SELECT op FROM sync_op_outbox
        WHERE user_id = ? AND table_name = ? ORDER BY id`,
      [USER_ID, "fizruk_injuries"],
    );
    expect(ops.map((row) => row.op)).toEqual(["insert", "update"]);
  });
});
