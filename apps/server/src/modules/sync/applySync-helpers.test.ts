import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import {
  assertRowUserId,
  guardUserPkLww,
  guardUuidPkApply,
  queryOne,
  readBoolField,
  readJsonbField,
  softDeleteById,
  type ExistingUuidRow,
} from "./applySync-helpers.js";

const USER_ID = "user-helpers";
const CLIENT_TS = new Date("2026-07-10T12:00:00.000Z");

function makeClient(rows: Array<Record<string, unknown>>): PoolClient & {
  query: Mock;
} {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query } as unknown as PoolClient & { query: Mock };
}

function op(kind: "insert" | "update" | "delete" = "insert"): SyncV2Op {
  return {
    table: "routine_habits",
    op: kind,
    row: { id: "row-1", user_id: USER_ID },
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "k-1",
  } as unknown as SyncV2Op;
}

describe("assertRowUserId", () => {
  it("rejects when user_id is missing", () => {
    expect(assertRowUserId({}, USER_ID)).toEqual({
      status: "rejected",
      reason: "missing_user_id",
    });
  });

  it("rejects when user_id is null", () => {
    expect(assertRowUserId({ user_id: null }, USER_ID)).toEqual({
      status: "rejected",
      reason: "missing_user_id",
    });
  });

  it("rejects on mismatch", () => {
    expect(assertRowUserId({ user_id: "someone-else" }, USER_ID)).toEqual({
      status: "rejected",
      reason: "user_id_mismatch",
    });
  });

  it("passes when the row's user_id matches", () => {
    expect(assertRowUserId({ user_id: USER_ID }, USER_ID)).toBeNull();
  });
});

describe("guardUuidPkApply", () => {
  it("allows through when there is no existing row", () => {
    expect(guardUuidPkApply(undefined, USER_ID, CLIENT_TS, op())).toBeNull();
  });

  it("rejects on fk_violation when the existing row belongs to another user", () => {
    const existing: ExistingUuidRow = {
      user_id: "other-user",
      updated_at: new Date("2026-07-10T11:00:00.000Z"),
      deleted_at: null,
    };
    expect(guardUuidPkApply(existing, USER_ID, CLIENT_TS, op())).toEqual({
      status: "rejected",
      reason: "fk_violation",
    });
  });

  it("rejects on lww_conflict when the existing row is newer or equal", () => {
    const existing: ExistingUuidRow = {
      user_id: USER_ID,
      updated_at: new Date("2026-07-10T13:00:00.000Z"),
      deleted_at: null,
    };
    expect(guardUuidPkApply(existing, USER_ID, CLIENT_TS, op())).toEqual({
      status: "rejected",
      reason: "lww_conflict",
    });
  });

  it("rejects on tombstoned when the row is soft-deleted and op is not delete", () => {
    const existing: ExistingUuidRow = {
      user_id: USER_ID,
      updated_at: new Date("2026-07-10T11:00:00.000Z"),
      deleted_at: new Date("2026-07-09T00:00:00.000Z"),
    };
    expect(
      guardUuidPkApply(existing, USER_ID, CLIENT_TS, op("update")),
    ).toEqual({
      status: "rejected",
      reason: "tombstoned",
    });
  });

  it("allows a delete op through even when the row is already tombstoned", () => {
    const existing: ExistingUuidRow = {
      user_id: USER_ID,
      updated_at: new Date("2026-07-10T11:00:00.000Z"),
      deleted_at: new Date("2026-07-09T00:00:00.000Z"),
    };
    expect(
      guardUuidPkApply(existing, USER_ID, CLIENT_TS, op("delete")),
    ).toBeNull();
  });

  it("allows a fresh update through when the row is not tombstoned", () => {
    const existing: ExistingUuidRow = {
      user_id: USER_ID,
      updated_at: new Date("2026-07-10T11:00:00.000Z"),
      deleted_at: null,
    };
    expect(
      guardUuidPkApply(existing, USER_ID, CLIENT_TS, op("update")),
    ).toBeNull();
  });
});

describe("queryOne", () => {
  it("returns the first row from the query result", async () => {
    const client = makeClient([{ id: "a" }, { id: "b" }]);
    const result = await queryOne(client, "SELECT 1", []);
    expect(result).toEqual({ id: "a" });
    expect(client.query).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("returns undefined when there are no rows", async () => {
    const client = makeClient([]);
    const result = await queryOne(client, "SELECT 1", []);
    expect(result).toBeUndefined();
  });
});

describe("softDeleteById", () => {
  it("rejects with not_found when there is no existing row", async () => {
    const client = makeClient([]);
    const result = await softDeleteById(
      client,
      "routine_habits",
      "row-1",
      USER_ID,
      CLIENT_TS,
      undefined,
    );
    expect(result).toEqual({ status: "rejected", reason: "not_found" });
    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    "routine_habits",
    "routine_tags",
    "routine_categories",
    "fizruk_daily_log",
    "fizruk_workout_templates",
  ] as const)("soft-deletes an existing %s row", async (table) => {
    const client = makeClient([]);
    const existing: ExistingUuidRow = {
      user_id: USER_ID,
      updated_at: new Date("2026-07-01T00:00:00.000Z"),
      deleted_at: null,
    };
    const result = await softDeleteById(
      client,
      table,
      "row-1",
      USER_ID,
      CLIENT_TS,
      existing,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining(`UPDATE ${table}`),
      [CLIENT_TS, "row-1", USER_ID],
    );
  });
});

describe("guardUserPkLww", () => {
  it("allows through when there is no existing row", () => {
    expect(guardUserPkLww(undefined, CLIENT_TS)).toBeNull();
  });

  it("allows through when the existing row is older", () => {
    expect(
      guardUserPkLww(
        { updated_at: new Date("2026-07-10T11:00:00.000Z") },
        CLIENT_TS,
      ),
    ).toBeNull();
  });

  it("rejects on lww_conflict when the existing row is newer or equal", () => {
    expect(guardUserPkLww({ updated_at: CLIENT_TS }, CLIENT_TS)).toEqual({
      status: "rejected",
      reason: "lww_conflict",
    });
    expect(
      guardUserPkLww(
        { updated_at: new Date("2026-07-10T13:00:00.000Z") },
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });
});

describe("readJsonbField", () => {
  it("prefers the pg key when present", () => {
    expect(readJsonbField({ data: { a: 1 } }, "data")).toBe(
      JSON.stringify({ a: 1 }),
    );
  });

  it("falls back to the sqlite alias key", () => {
    expect(readJsonbField({ data_json: { a: 1 } }, "data", "data_json")).toBe(
      JSON.stringify({ a: 1 }),
    );
  });

  it("falls back to the implicit *_json alias for 'data' and 'order'", () => {
    expect(readJsonbField({ data_json: { b: 2 } }, "data")).toBe(
      JSON.stringify({ b: 2 }),
    );
    expect(readJsonbField({ order_json: [1, 2] }, "order")).toBe(
      JSON.stringify([1, 2]),
    );
  });

  it("returns the fallback when nothing is set", () => {
    expect(readJsonbField({}, "data")).toBe("null");
    expect(readJsonbField({}, "weekdays", "weekdays_json", "[0]")).toBe("[0]");
  });

  it("returns the fallback when the value cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(readJsonbField({ data: circular }, "data", undefined, "[]")).toBe(
      "[]",
    );
  });
});

describe("readBoolField", () => {
  it("reads true from boolean or 1", () => {
    expect(readBoolField({ archived: true }, "archived")).toBe(true);
    expect(readBoolField({ archived: 1 }, "archived")).toBe(true);
  });

  it("reads false from boolean or 0", () => {
    expect(readBoolField({ archived: false }, "archived")).toBe(false);
    expect(readBoolField({ archived: 0 }, "archived")).toBe(false);
  });

  it("defaults to false for anything else", () => {
    expect(readBoolField({}, "archived")).toBe(false);
    expect(readBoolField({ archived: "yes" }, "archived")).toBe(false);
    expect(readBoolField({ archived: null }, "archived")).toBe(false);
  });
});
