import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyRoutineHabitCounts } from "./applyHabitCounts.js";
import { applyRoutineHabits } from "./applySyncFullState.js";

/**
 * Міграція 170 (Рутина, Р-1 (а) і (в)): три колонки `routine_habits` і
 * таблиця `routine_habit_counts`. Спека
 * `docs/work/specs/routine-counter-automark-percent-and-hub-rows.md`.
 */

const USER_ID = "user-counter";
const CLIENT_TS = new Date("2026-11-18T12:00:00.000Z");
const OLDER = [
  {
    user_id: USER_ID,
    updated_at: new Date("2026-11-01T00:00:00.000Z"),
    deleted_at: null,
  },
];

function makeClient(existing: Record<string, unknown>[] = []) {
  const query = vi.fn();
  query.mockResolvedValueOnce({ rows: existing });
  query.mockResolvedValue({ rows: [], rowCount: 1 });
  return { query } as unknown as PoolClient & { query: typeof query };
}

function op(
  table: string,
  row: Record<string, unknown>,
  kind: SyncV2Op["op"] = "insert",
): SyncV2Op {
  return {
    table,
    op: kind,
    row: { user_id: USER_ID, ...row },
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: `k-${table}`,
  } as unknown as SyncV2Op;
}

/** Той самий диспетч, що й реєстр `syncV2.ts`, для двох таблиць. */
function applyHabitCountsOrHabit(
  client: PoolClient,
  o: SyncV2Op,
  userId: string,
  ts: Date,
) {
  return o.table === "routine_habit_counts"
    ? applyRoutineHabitCounts(client, o, userId, ts)
    : applyRoutineHabits(client, o, userId, ts);
}

const habit = (over: Record<string, unknown> = {}) =>
  op("routine_habits", { id: "h1", name: "Вода", ...over });

function dml(client: { query: ReturnType<typeof vi.fn> }) {
  expect(client.query).toHaveBeenCalledTimes(2);
  const [sql, params] = client.query.mock.calls[1] as [string, unknown[]];
  return { sql, params };
}

describe("routine_habits: лічильник і автовідмітка (міграція 170)", () => {
  it.each([
    ["count_target 0", { count_target: 0 }, "invalid_count_target"],
    ["count_target дробове", { count_target: 1.5 }, "invalid_count_target"],
    ["count_target рядок", { count_target: "3" }, "invalid_count_target"],
    ["count_unit число", { count_unit: 3 }, "invalid_count_unit"],
    ["count_unit задовге", { count_unit: "x".repeat(500) }, "text_too_long"],
    [
      "auto_mark_source поза списком",
      { auto_mark_source: "fizruk_any" },
      "invalid_auto_mark_source",
    ],
  ])("відхиляє до запису: %s", async (_label, over, reason) => {
    const client = makeClient();
    const result = await applyHabitCountsOrHabit(
      client,
      habit(over),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("INSERT пише валідні значення", async () => {
    const client = makeClient();
    const result = await applyHabitCountsOrHabit(
      client,
      habit({
        count_target: 3,
        count_unit: "склянки",
        auto_mark_source: "nutrition_water_goal",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(dml(client).params.slice(19, 22)).toEqual([
      3,
      "склянки",
      "nutrition_water_goal",
    ]);
  });

  it("UPDATE від старого клієнта без ключів не чіпає колонки", async () => {
    const client = makeClient(OLDER);
    const result = await applyHabitCountsOrHabit(
      client,
      habit({ name: "Вода (нова назва)" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    const { sql, params } = dml(client);
    expect(sql).toContain("ELSE count_target END");
    // Прапорці присутності: false — колонка лишається як є.
    expect(params.slice(18, 24)).toEqual([
      false,
      null,
      false,
      null,
      false,
      null,
    ]);
  });

  it("UPDATE з явним null знімає лічильник і автовідмітку", async () => {
    const client = makeClient(OLDER);
    await applyHabitCountsOrHabit(
      client,
      habit({ count_target: null, count_unit: null, auto_mark_source: null }),
      USER_ID,
      CLIENT_TS,
    );
    expect(dml(client).params.slice(18, 24)).toEqual([
      true,
      null,
      true,
      null,
      true,
      null,
    ]);
  });
});

describe("routine_habit_counts", () => {
  const count = (over: Record<string, unknown> = {}, kind?: SyncV2Op["op"]) =>
    op(
      "routine_habit_counts",
      {
        id: "h1__2026-11-18",
        habit_id: "h1",
        date_key: "2026-11-18",
        count: 2,
        ...over,
      },
      kind,
    );

  it("upsert з LWW-умовою і скиданням tombstone", async () => {
    const client = makeClient();
    const result = await applyHabitCountsOrHabit(
      client,
      count(),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    const { sql, params } = dml(client);
    expect(sql).toContain(
      "routine_habit_counts.updated_at < EXCLUDED.updated_at",
    );
    expect(sql).toContain("deleted_at = NULL");
    expect(params).toEqual([
      "h1__2026-11-18",
      USER_ID,
      "h1",
      "2026-11-18",
      2,
      CLIENT_TS,
    ]);
  });

  it.each([
    ["id не збігається з парою", { id: "h1__2026-11-17" }, "invalid_count_key"],
    ["немає habit_id", { habit_id: "" }, "invalid_count_key"],
    [
      "date_key не дата",
      { date_key: "2026-13-01", id: "h1__2026-13-01" },
      "invalid_count_key",
    ],
    ["немає date_key", { date_key: undefined }, "missing_date_key"],
    ["count відʼємний", { count: -1 }, "invalid_count"],
    ["count дробовий", { count: 1.5 }, "invalid_count"],
    ["немає id", { id: undefined }, "missing_id"],
  ])("відхиляє: %s", async (_label, over, reason) => {
    const client = makeClient();
    const result = await applyHabitCountsOrHabit(
      client,
      count(over),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason });
  });

  it("старіший за серверний рядок — lww_conflict без запису", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-11-19T00:00:00Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyHabitCountsOrHabit(
      client,
      count(),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("delete — soft-delete, відсутній рядок — not_found", async () => {
    const client = makeClient(OLDER);
    const result = await applyHabitCountsOrHabit(
      client,
      count({}, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(dml(client).sql).toContain("SET deleted_at = $1");
    const missing = await applyHabitCountsOrHabit(
      makeClient(),
      count({}, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(missing).toEqual({ status: "rejected", reason: "not_found" });
  });
});
