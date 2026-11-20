/**
 * Лічильник і автовідмітка звички (міграція 170 / клієнтська 012):
 * стан → dual-write → SQLite → читач, плюс форма outbox-рядків для синку.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("@sergeant/db-schema/sqlite", () => ({
  enqueueOutboxIncrement: vi
    .fn()
    .mockResolvedValue({ ok: true, id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { RoutineState } from "@sergeant/routine-domain";

import { refreshSqliteRoutineState } from "../../sqliteReader.js";
import {
  __clearRoutineDualWriteContextForTests,
  dualWriteRoutineState,
  registerRoutineDualWriteContext,
} from "../index.js";
import { diffRoutineDualWriteOps } from "../diff.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";
const T1 = "2026-11-18T10:00:00.000+00:00";

function state(over: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    habitOrder: [],
    completionNotes: {},
    ...over,
  };
}

const water = {
  id: "w",
  name: "Вода",
  recurrence: "daily",
  startDate: "2026-11-01",
  countTarget: 3,
  countUnit: "склянки",
  autoMarkSource: "nutrition_water_goal" as const,
};

describe("лічильник: dual-write і читач", () => {
  let handle: Awaited<ReturnType<typeof createTestSqlite>>;

  beforeEach(async () => {
    handle = await createTestSqlite();
    registerRoutineDualWriteContext({
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => T1,
      logger: vi.fn(),
    });
    vi.mocked(enqueueOutboxUpsert).mockClear();
  });

  afterEach(() => {
    __clearRoutineDualWriteContextForTests();
    handle.close();
  });

  it("поля звички і кроки дня переживають перечитування з SQLite", async () => {
    const empty = state();
    const withHabit = state({ habits: [water], habitOrder: ["w"] });
    await dualWriteRoutineState(empty, withHabit);
    const counted = { ...withHabit, counts: { w: { "2026-11-18": 2 } } };
    await dualWriteRoutineState(withHabit, counted);

    const cache = await refreshSqliteRoutineState(handle.client, USER_ID);
    expect(cache.habits[0]).toMatchObject({
      countTarget: 3,
      countUnit: "склянки",
      autoMarkSource: "nutrition_water_goal",
    });
    expect(cache.counts).toEqual({ w: { "2026-11-18": 2 } });

    const rows = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.map(
        (c) => c[1] as { table: string; row: Record<string, unknown> },
      );
    const habitRow = rows.find((r) => r.table === "routine_habits");
    expect(habitRow?.row).toMatchObject({
      count_target: 3,
      count_unit: "склянки",
      auto_mark_source: "nutrition_water_goal",
    });
    const countRow = rows.find((r) => r.table === "routine_habit_counts");
    expect(countRow?.row).toEqual({
      id: "w__2026-11-18",
      user_id: USER_ID,
      habit_id: "w",
      date_key: "2026-11-18",
      count: 2,
    });
  });

  it("звичка «так/ні» шле ключі як null; нуль кроків — soft-delete рядка", async () => {
    const plain = { id: "p", name: "Біг", recurrence: "daily" };
    const ops = diffRoutineDualWriteOps(
      state({ counts: { w: { "2026-11-18": 1 } } }),
      state({ habits: [plain], counts: {} }),
    );
    expect(ops).toContainEqual({
      kind: "habit-count-delete",
      habitId: "w",
      dateKey: "2026-11-18",
    });

    await dualWriteRoutineState(state(), state({ habits: [plain] }));
    const habitRow = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.map(
        (c) => c[1] as { table: string; row: Record<string, unknown> },
      )
      .find((r) => r.table === "routine_habits");
    expect(habitRow?.row).toMatchObject({
      count_target: null,
      count_unit: null,
      auto_mark_source: null,
    });
  });

  it("зміна лише цілі лічильника дає habit-upsert", () => {
    const before = state({ habits: [water] });
    const after = state({ habits: [{ ...water, countTarget: 5 }] });
    expect(diffRoutineDualWriteOps(before, after).map((o) => o.kind)).toEqual([
      "habit-upsert",
    ]);
  });
});
