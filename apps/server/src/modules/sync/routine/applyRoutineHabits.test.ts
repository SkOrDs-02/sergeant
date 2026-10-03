import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyRoutineHabits } from "./applySyncFullState.js";

/**
 * Регресія rel-01 (аудит 2026-10-01): `recurrence` / `start_date` /
 * `end_date` писались із sync-пушу як довільні рядки, а щохвилинний sweep
 * нагадувань падав на `parseDateKey("2000")` для ВСІХ користувачів.
 */

const USER_ID = "user-rel01";
const CLIENT_TS = new Date("2026-10-01T12:00:00.000Z");

function makeClient(existing: Record<string, unknown>[] = []) {
  const query = vi.fn();
  query.mockResolvedValueOnce({ rows: existing });
  query.mockResolvedValue({ rows: [], rowCount: 1 });
  return { query } as unknown as PoolClient & { query: typeof query };
}

function habitOp(
  over: Record<string, unknown> = {},
  kind: SyncV2Op["op"] = "insert",
): SyncV2Op {
  return {
    table: "routine_habits",
    op: kind,
    row: {
      id: "habit-1",
      user_id: USER_ID,
      name: "Run",
      recurrence: "monthly",
      start_date: "2026-10-01",
      ...over,
    },
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "k-habit",
  } as unknown as SyncV2Op;
}

const EXISTING_OLDER = [
  {
    user_id: USER_ID,
    updated_at: new Date("2026-09-01T00:00:00.000Z"),
    deleted_at: null,
  },
];

/** Параметри DML-запиту (INSERT або UPDATE) — другий виклик `query`. */
function dmlParams(client: { query: ReturnType<typeof vi.fn> }): unknown[] {
  expect(client.query).toHaveBeenCalledTimes(2);
  return client.query.mock.calls[1]![1] as unknown[];
}

describe("applyRoutineHabits: валідація розкладу (rel-01)", () => {
  it.each([
    [
      "start_date: рік без місяця і дня",
      { start_date: "2000" },
      "invalid_start_date",
    ],
    [
      "start_date: неіснуюча дата",
      { start_date: "2026-02-31" },
      "invalid_start_date",
    ],
    [
      "start_date: ISO-таймстемп замість day-ключа",
      { start_date: "2026-10-01T00:00:00Z" },
      "invalid_start_date",
    ],
    ["start_date: не рядок", { start_date: 20261001 }, "invalid_start_date"],
    ["end_date: сміття", { end_date: "never" }, "invalid_end_date"],
    ["end_date: місяць 13", { end_date: "2026-13-01" }, "invalid_end_date"],
    ["recurrence: поза enum", { recurrence: "hourly" }, "invalid_recurrence"],
    ["recurrence: не рядок", { recurrence: 5 }, "invalid_recurrence"],
  ])("відхиляє INSERT: %s", async (_label, over, reason) => {
    const client = makeClient();

    const result = await applyRoutineHabits(
      client,
      habitOp(over),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "rejected", reason });
    // Лише SELECT існуючого рядка — жодного INSERT/UPDATE.
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("відхиляє UPDATE існуючої звички з невалідним start_date", async () => {
    const client = makeClient(EXISTING_OLDER);

    const result = await applyRoutineHabits(
      client,
      habitOp({ start_date: "2000" }, "update"),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_start_date",
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("невалідний оп не блокує наступний оп того ж батчу", async () => {
    const bad = await applyRoutineHabits(
      makeClient(),
      habitOp({ start_date: "2000" }),
      USER_ID,
      CLIENT_TS,
    );
    const good = await applyRoutineHabits(
      makeClient(),
      habitOp({ id: "habit-2" }),
      USER_ID,
      CLIENT_TS,
    );

    expect(bad.status).toBe("rejected");
    expect(good).toEqual({ status: "applied" });
  });

  it("приймає валідний розклад і пише значення як є", async () => {
    const client = makeClient();

    const result = await applyRoutineHabits(
      client,
      habitOp({
        recurrence: "flexible",
        start_date: "2026-02-28",
        end_date: "2026-12-31",
      }),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    const params = dmlParams(client);
    expect(params.slice(8, 11)).toEqual([
      "flexible",
      "2026-02-28",
      "2026-12-31",
    ]);
  });

  it("UPDATE із валідним розкладом проходить", async () => {
    const client = makeClient(EXISTING_OLDER);

    const result = await applyRoutineHabits(
      client,
      habitOp({ recurrence: "weekly", end_date: "2027-01-01" }, "update"),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    // UPDATE: recurrence, start_date, end_date — індекси 6..8.
    expect(dmlParams(client).slice(6, 9)).toEqual([
      "weekly",
      "2026-10-01",
      "2027-01-01",
    ]);
  });

  it.each([
    ["поля відсутні", { recurrence: undefined, start_date: undefined }],
    ["поля null", { recurrence: null, start_date: null, end_date: null }],
    [
      "порожні рядки (легасі-клієнт)",
      { recurrence: "", start_date: "", end_date: "" },
    ],
  ])("%s: recurrence = daily, дати = NULL", async (_label, over) => {
    const client = makeClient();

    const result = await applyRoutineHabits(
      client,
      habitOp(over),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    expect(dmlParams(client).slice(8, 11)).toEqual(["daily", null, null]);
  });

  it("delete-оп не валідує розклад (tombstone не пише ці поля)", async () => {
    const client = makeClient(EXISTING_OLDER);

    const result = await applyRoutineHabits(
      client,
      habitOp({ start_date: "2000" }, "delete"),
      USER_ID,
      CLIENT_TS,
    );

    expect(result.status).toBe("applied");
  });
});
