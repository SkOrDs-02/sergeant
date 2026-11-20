/**
 * Прапорець «виконано» і тип підходу в сховищі (спека
 * `fizruk-set-done-flag-and-set-type.md`, міграції 176 / клієнтська 012):
 * стан хука → SQLite → outbox → читач і назад, plus старий рядок без полів.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  registerFizrukDualWriteContext,
  dualWriteFizrukState,
  __clearFizrukDualWriteContextForTests,
  type FizrukDualWriteState,
} from "../index.js";
import {
  rowToWorkoutSet,
  WORKOUT_SETS_SELECT_SQL,
  type WorkoutSetRow,
} from "../../sqliteReader.sets.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

let handle: TestSqliteHandle;
const UID = "user-1";
const TS = "2026-11-19T10:00:00.000Z";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  injuries: [],
};

beforeEach(async () => {
  handle = await createTestSqlite();
  (enqueueOutboxUpsert as ReturnType<typeof vi.fn>).mockClear();
});
afterEach(() => {
  __clearFizrukDualWriteContextForTests();
  handle.close();
});

function stateWithSets(sets: Record<string, unknown>[]): FizrukDualWriteState {
  return {
    ...EMPTY,
    workouts: [
      {
        id: "w1",
        startedAt: "2026-11-19T09:00:00Z",
        endedAt: null,
        items: [
          {
            id: "i1",
            exerciseId: "bench-press",
            nameUk: "Жим лежачи",
            primaryGroup: "chest",
            musclesPrimary: ["chest"],
            musclesSecondary: [],
            type: "strength",
            sets: sets as never,
          },
        ],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    ],
  };
}

async function readSets() {
  const rows = await handle.client.all<WorkoutSetRow>(WORKOUT_SETS_SELECT_SQL, [
    UID,
  ]);
  return rows.map(rowToWorkoutSet);
}

describe("сховище: done і set_type", () => {
  it("пише прапорець і тип у SQLite і outbox, читач повертає їх", async () => {
    const teardown = registerFizrukDualWriteContext({
      getUserId: () => UID,
      getMigrationClient: async () => handle.client,
      getNow: () => TS,
      logger: () => {},
    });
    await dualWriteFizrukState(
      EMPTY,
      stateWithSets([
        { weightKg: 20, reps: 10, done: true, setType: "warmup" },
        { weightKg: 80, reps: 8, done: false },
        { weightKg: 80, reps: 8, setType: "bogus" },
      ]),
    );
    await Promise.resolve();

    const raw = await handle.client.all<Record<string, unknown>>(
      "SELECT done, set_type FROM fizruk_workout_sets ORDER BY sort_order",
    );
    expect(raw).toEqual([
      { done: 1, set_type: "warmup" },
      { done: 0, set_type: null },
      { done: null, set_type: null },
    ]);

    expect(await readSets()).toEqual([
      { weightKg: 20, reps: 10, done: true, setType: "warmup" },
      { weightKg: 80, reps: 8, done: false },
      { weightKg: 80, reps: 8 },
    ]);

    const rows = (enqueueOutboxUpsert as ReturnType<typeof vi.fn>).mock.calls
      .map(([, input]) => input)
      .filter((i) => i.table === "fizruk_workout_sets")
      .map((i) => i.row);
    // Ключі присутні завжди (прапорець присутності на сервері): старий
    // клієнт їх не шле й не затирає, новий шле навіть null.
    expect(rows.map((r) => [r.done, r.set_type])).toEqual([
      [true, "warmup"],
      [false, null],
      [null, null],
    ]);
    teardown();
  });

  it("старий рядок (колонки NULL) читається як до фічі", () => {
    expect(
      rowToWorkoutSet({
        id: "s",
        workout_item_id: "i",
        weight_kg: 60,
        reps: 8,
        rpe: null,
        sort_order: 0,
        done: null,
        set_type: null,
      }),
    ).toEqual({ weightKg: 60, reps: 8 });
  });

  it("pull із сервера може принести boolean чи 0/1 — обидва читаються", () => {
    const base = {
      id: "s",
      workout_item_id: "i",
      weight_kg: 60,
      reps: 8,
      rpe: null,
      sort_order: 0,
    };
    expect(rowToWorkoutSet({ ...base, done: true }).done).toBe(true);
    expect(rowToWorkoutSet({ ...base, done: 0 }).done).toBe(false);
    expect(rowToWorkoutSet({ ...base, set_type: "drop" }).setType).toBe("drop");
    expect(rowToWorkoutSet({ ...base, set_type: "zzz" })).not.toHaveProperty(
      "setType",
    );
  });
});
