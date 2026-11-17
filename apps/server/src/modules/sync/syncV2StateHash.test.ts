import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { computeStateHash } from "@sergeant/shared";

const { clientQuery, release } = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../db.js", () => ({
  default: { connect: vi.fn(async () => ({ query: clientQuery, release })) },
}));

import {
  isSyncStateHashEnabled,
  requireSyncStateHashEnabled,
  syncV2StateHash,
} from "./syncV2StateHash.js";

function call(table: unknown): Promise<unknown> {
  let body: unknown;
  const res = {
    json(p: unknown) {
      body = p;
      return this;
    },
  } as unknown as Response;
  return syncV2StateHash(
    { query: { table }, user: { id: "u1" } } as unknown as Request,
    res,
  ).then(() => body);
}

beforeEach(() => {
  clientQuery.mockReset();
  release.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("syncV2StateHash (мок пулу)", () => {
  it("одна транзакція REPEATABLE READ; bigint-рядки → number (Hard Rule #1)", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("sync_op_log")) return { rows: [{ as_of_op_id: "42" }] };
      if (sql.includes("FROM")) {
        return {
          rows: [
            {
              pk_parts: ["w-1"],
              updated_at_ms: "1700000000123",
              deleted_at_ms: null,
            },
            {
              pk_parts: ["w-2"],
              updated_at_ms: "1700000000000",
              deleted_at_ms: "1700000005000",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const body = (await call("fizruk_workouts")) as Record<string, unknown>;

    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(sqls.filter((s) => s.includes("WHERE user_id = $1"))).toHaveLength(
      2,
    );
    expect(release).toHaveBeenCalledTimes(1);

    const expected = computeStateHash([
      { pk: "w-1", updated_at_ms: 1700000000123, deleted_at_ms: null },
      { pk: "w-2", updated_at_ms: 1700000000000, deleted_at_ms: 1700000005000 },
    ]);
    expect(body).toEqual({
      table: "fizruk_workouts",
      as_of_op_id: 42,
      total: expected.total,
      buckets: expected.buckets,
    });
  });

  it("порожній op-log → as_of_op_id 0; одиночка без deleted_at → NULL у SQL", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("sync_op_log")) return { rows: [{ as_of_op_id: null }] };
      return { rows: [] };
    });
    const body = (await call("routine_prefs")) as { as_of_op_id: number };
    expect(body.as_of_op_id).toBe(0);
    const rowsSql = clientQuery.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('FROM "routine_prefs"'));
    expect(rowsSql).toContain("ARRAY[]::text[]");
    expect(rowsSql).toContain("NULL AS deleted_at_ms");
  });

  it("помилка запиту → ROLLBACK і release", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("sync_op_log")) throw new Error("boom");
      return { rows: [] };
    });
    await expect(call("fizruk_workouts")).rejects.toThrow("boom");
    expect(clientQuery.mock.calls.map((c) => c[0])).toContain("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([
    "nutrition_meals",
    "routine_streaks",
    "constructor",
    undefined,
    ["fizruk_workouts"],
  ])(
    "таблиця %s → 400 STATE_HASH_TABLE_NOT_ALLOWED без звернення до БД",
    async (table) => {
      await expect(call(table)).rejects.toMatchObject({
        status: 400,
        code: "STATE_HASH_TABLE_NOT_ALLOWED",
      });
      expect(clientQuery).not.toHaveBeenCalled();
    },
  );
});

describe("прапорець SYNC_STATE_HASH_ENABLED", () => {
  it("дефолт вимкнено → guard віддає 404", () => {
    vi.stubEnv("SYNC_STATE_HASH_ENABLED", "");
    delete process.env["SYNC_STATE_HASH_ENABLED"];
    expect(isSyncStateHashEnabled()).toBe(false);
    const next = vi.fn();
    requireSyncStateHashEnabled()({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("true → guard пропускає", () => {
    vi.stubEnv("SYNC_STATE_HASH_ENABLED", "true");
    const next = vi.fn();
    requireSyncStateHashEnabled()({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
