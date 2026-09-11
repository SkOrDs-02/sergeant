import { describe, expect, it } from "vitest";
import type { WorkoutItem, WorkoutGroup } from "@sergeant/fizruk-domain";
import {
  countDoneSets,
  groupByItemId,
  groupMemberPosition,
  isItemDone,
  itemStates,
  exercisesGenitiveWord,
  neighbourItems,
  sessionProgress,
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

  it("picks the genitive form of «вправа» by total", () => {
    // «0 з 1 вправи», не «0 з 1 вправ».
    expect(exercisesGenitiveWord(1)).toBe("вправи");
    expect(exercisesGenitiveWord(0)).toBe("вправ");
    expect(exercisesGenitiveWord(3)).toBe("вправ");
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
