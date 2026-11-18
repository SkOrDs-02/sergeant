import { describe, expect, it } from "vitest";
import type { WorkoutItem, WorkoutGroup } from "@sergeant/fizruk-domain";
import {
  computeWorkoutSetCount,
  computeWorkoutTonnageKg,
} from "@sergeant/fizruk-domain/domain";
import {
  countDoneSets,
  groupByItemId,
  groupMemberPosition,
  isItemDone,
  itemStates,
  exercisesGenitiveWord,
  neighbourItems,
  sessionProgress,
  setsProgressLabel,
} from "./sessionLib";

function strength(id: string, sets: Array<[number, number]>): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameUk: id,
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })),
  } as WorkoutItem;
}

describe("sessionLib", () => {
  it("counts done sets by the reps>0 criterion (bodyweight counts)", () => {
    expect(
      countDoneSets(
        strength("a", [
          [80, 8],
          [0, 10],
          [80, 0],
        ]),
      ),
    ).toBe(2);
    expect(countDoneSets({ ...strength("a", []), type: "time" })).toBe(0);
  });

  it("утримання: лічильник «1 з 3» за секундами, вправа закрита після трьох (тип виміру)", () => {
    const hold = (secs: number[]): WorkoutItem =>
      ({
        ...strength("plank", []),
        type: "time",
        measure: "time",
        sets: secs.map((durationSec) => ({
          weightKg: 0,
          reps: 0,
          durationSec,
        })),
      }) as WorkoutItem;
    const one = hold([30, 0, 0]);
    expect(countDoneSets(one)).toBe(1);
    expect(setsProgressLabel(countDoneSets(one), 3)).toMatch(/^1 з 3 /);
    expect(isItemDone(one)).toBe(false);
    const all = hold([30, 30, 30]);
    expect(isItemDone(all)).toBe(true);
    expect(sessionProgress({ items: [all] } as never).setsDone).toBe(3);
  });

  it("дистанція: підхід зараховано за метрами", () => {
    const run = {
      ...strength("run", []),
      type: "distance",
      measure: "distance_time",
      sets: [
        { weightKg: 0, reps: 0, distanceM: 400, durationSec: 0 },
        { weightKg: 0, reps: 0, durationSec: 90 },
      ],
    } as WorkoutItem;
    expect(countDoneSets(run)).toBe(1);
  });

  it("an empty row added by «+ Підхід» keeps the header at «2 з 3» and stays out of set count and volume (logic-18)", () => {
    const item = strength("a", [
      [60, 8],
      [65, 6],
      [0, 0],
    ]);
    expect(
      setsProgressLabel(countDoneSets(item), item.sets?.length ?? 0),
    ).toMatch(/^2 з 3 /);
    const workout = { items: [item] };
    expect(computeWorkoutSetCount(workout)).toBe(2);
    expect(computeWorkoutTonnageKg(workout)).toBe(60 * 8 + 65 * 6);
  });

  it("an item is done when it has sets and all are done; empty strength is not done", () => {
    expect(
      isItemDone(
        strength("a", [
          [80, 8],
          [80, 8],
        ]),
      ),
    ).toBe(true);
    expect(
      isItemDone(
        strength("a", [
          [80, 8],
          [0, 0],
        ]),
      ),
    ).toBe(false);
    expect(isItemDone(strength("a", []))).toBe(false);
    expect(
      isItemDone({ ...strength("t", []), type: "time", durationSec: 30 }),
    ).toBe(true);
    expect(
      isItemDone({ ...strength("d", []), type: "distance", distanceM: 0 }),
    ).toBe(false);
  });

  it("marks the first undone item as current and the rest as todo", () => {
    const items = [
      strength("a", [[80, 8]]),
      strength("b", [[0, 0]]),
      strength("c", []),
    ];
    expect(itemStates(items)).toEqual(["done", "current", "todo"]);
  });

  it("sums session progress", () => {
    const w = {
      id: "w",
      startedAt: "",
      endedAt: null,
      note: "",
      groups: [],
      warmup: null,
      cooldown: null,
      items: [
        strength("a", [
          [80, 8],
          [80, 8],
        ]),
        strength("b", [[0, 0]]),
      ],
    };
    expect(sessionProgress(w)).toEqual({
      exercisesDone: 1,
      exercisesTotal: 2,
      setsDone: 2,
    });
  });

  it("maps items to groups and positions", () => {
    const g: WorkoutGroup = {
      id: "g",
      type: "superset",
      itemIds: ["a", "b"],
      restSec: 60,
    };
    const m = groupByItemId([g]);
    expect(m.get("a")).toBe(g);
    expect(groupMemberPosition(strength("b", []), g)).toBe(2);
    expect(groupMemberPosition(strength("c", []), g)).toBeNull();
    expect(groupMemberPosition(strength("c", []), null)).toBeNull();
  });

  it("picks the genitive form of «вправа» by total, incl. 21 and 11", () => {
    // «0 з 1 вправи», не «0 з 1 вправ». Так само 21 і 31 — однина родового,
    // а 11 — ні: це виняток, який ловить `% 100 !== 11`.
    expect(exercisesGenitiveWord(1)).toBe("вправи");
    expect(exercisesGenitiveWord(21)).toBe("вправи");
    expect(exercisesGenitiveWord(31)).toBe("вправи");
    expect(exercisesGenitiveWord(11)).toBe("вправ");
    expect(exercisesGenitiveWord(0)).toBe("вправ");
    expect(exercisesGenitiveWord(3)).toBe("вправ");
  });

  it("applies the same rule to the sets progress label", () => {
    expect(setsProgressLabel(0, 1)).toBe("0 з 1 підходу");
    expect(setsProgressLabel(3, 21)).toBe("3 з 21 підходу");
    expect(setsProgressLabel(3, 11)).toBe("3 з 11 підходів");
    expect(setsProgressLabel(3, 3)).toBe("3 з 3 підходів");
  });

  it("finds neighbours for prev/next navigation", () => {
    const items = [strength("a", []), strength("b", []), strength("c", [])];
    expect(neighbourItems(items, "b").prev?.id).toBe("a");
    expect(neighbourItems(items, "b").next?.id).toBe("c");
    expect(neighbourItems(items, "a").prev).toBeNull();
    expect(neighbourItems(items, "c").next).toBeNull();
    expect(neighbourItems(items, "zzz")).toEqual({ prev: null, next: null });
  });
});
