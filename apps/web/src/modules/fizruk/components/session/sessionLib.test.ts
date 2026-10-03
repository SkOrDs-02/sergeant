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
