import { describe, expect, it } from "vitest";

import type { Workout } from "../types.js";
import {
  buildWorkoutJournalSections,
  compareWorkoutsByStartedAtDesc,
  computeWorkoutDurationSec,
  computeWorkoutSetCount,
  computeWorkoutSummary,
  computeWorkoutTonnageKg,
  formatWorkoutDateLabel,
  groupWorkoutsByDate,
  sortWorkoutsByStartedAtDesc,
  workoutDateKey,
} from "./journal.js";

function w(overrides: Partial<Workout> = {}): Workout {
  return {
    id: overrides.id ?? "w_1",
    startedAt: overrides.startedAt ?? "2026-04-20T09:00:00Z",
    endedAt: overrides.endedAt ?? null,
    items: overrides.items ?? [],
    groups: overrides.groups ?? [],
    warmup: overrides.warmup ?? null,
    cooldown: overrides.cooldown ?? null,
    note: overrides.note ?? "",
    ...overrides,
  };
}

describe("workoutDateKey", () => {
  it("extracts the local YYYY-MM-DD prefix", () => {
    expect(workoutDateKey({ startedAt: "2026-04-20T09:00:00Z" })).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("returns null for missing / malformed timestamps", () => {
    expect(workoutDateKey({ startedAt: "" })).toBeNull();
    expect(workoutDateKey({ startedAt: "not-a-date" })).toBeNull();
  });
});

describe("sortWorkoutsByStartedAtDesc", () => {
  it("sorts newest-first and pushes malformed entries to the bottom", () => {
    const a = w({ id: "a", startedAt: "2026-04-18T09:00:00Z" });
    const b = w({ id: "b", startedAt: "2026-04-20T09:00:00Z" });
    const c = w({ id: "c", startedAt: "not-a-date" });
    const sorted = sortWorkoutsByStartedAtDesc([a, c, b]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input", () => {
    const arr = [
      w({ id: "a", startedAt: "2026-04-18T09:00:00Z" }),
      w({ id: "b", startedAt: "2026-04-20T09:00:00Z" }),
    ];
    const copy = arr.slice();
    sortWorkoutsByStartedAtDesc(arr);
    expect(arr).toEqual(copy);
  });
});

describe("compareWorkoutsByStartedAtDesc", () => {
  it("treats two malformed entries as equal", () => {
    const a = w({ id: "a", startedAt: "not-a-date" });
    const b = w({ id: "b", startedAt: "also-bad" });
    expect(compareWorkoutsByStartedAtDesc(a, b)).toBe(0);
  });
});

describe("groupWorkoutsByDate", () => {
  it("buckets by local date key", () => {
    const a = w({ id: "a", startedAt: "2026-04-20T09:00:00Z" });
    const b = w({ id: "b", startedAt: "2026-04-20T20:00:00Z" });
    const c = w({ id: "c", startedAt: "2026-04-21T09:00:00Z" });
    const grouped = groupWorkoutsByDate([a, b, c]);
    const dayA = workoutDateKey(a)!;
    const dayC = workoutDateKey(c)!;
    expect(grouped[dayA]).toHaveLength(2);
    expect(grouped[dayC]).toHaveLength(1);
  });

  it("routes malformed entries into an empty-key bucket", () => {
    const bad = w({ id: "bad", startedAt: "nope" });
    const grouped = groupWorkoutsByDate([bad]);
    expect(grouped[""]).toEqual([bad]);
  });
});

describe("buildWorkoutJournalSections", () => {
  it("returns newest-first sections with the empty bucket last", () => {
    const a = w({ id: "a", startedAt: "2026-04-18T09:00:00Z" });
    const b = w({ id: "b", startedAt: "2026-04-20T09:00:00Z" });
    const bad = w({ id: "bad", startedAt: "nope" });
    const sections = buildWorkoutJournalSections([a, bad, b]);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.workouts[0]!.id).toBe("b");
    expect(sections[1]!.workouts[0]!.id).toBe("a");
    expect(sections[2]!.dateKey).toBe("");
    expect(sections[2]!.workouts[0]!.id).toBe("bad");
  });

  it("returns an empty array for an empty list", () => {
    expect(buildWorkoutJournalSections([])).toEqual([]);
  });
});

describe("computeWorkoutTonnageKg / computeWorkoutSetCount", () => {
  const workout = w({
    items: [
      {
        id: "it_1",
        exerciseId: "ex_1",
        nameUk: "Жим",
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength",
        sets: [
          { weightKg: 60, reps: 10 },
          { weightKg: 60, reps: 8 },
          { weightKg: 0, reps: 0 },
        ],
      },
      {
        id: "it_2",
        exerciseId: "ex_2",
        nameUk: "Біг",
        primaryGroup: "cardio",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "distance",
        distanceM: 5000,
        durationSec: 1500,
      },
    ],
  });

  it("sums strength tonnage and ignores distance/time items", () => {
    expect(computeWorkoutTonnageKg(workout)).toBe(60 * 10 + 60 * 8);
  });

  it("counts non-empty strength sets", () => {
    expect(computeWorkoutSetCount(workout)).toBe(2);
  });

  it("handles null / missing inputs", () => {
    expect(computeWorkoutTonnageKg(null)).toBe(0);
    expect(computeWorkoutSetCount(undefined)).toBe(0);
  });
});

describe("computeWorkoutDurationSec", () => {
  it("is null for unfinished workouts", () => {
    expect(
      computeWorkoutDurationSec(
        w({ startedAt: "2026-04-20T09:00:00Z", endedAt: null }),
      ),
    ).toBeNull();
  });

  it("returns the floor difference in seconds", () => {
    expect(
      computeWorkoutDurationSec(
        w({
          startedAt: "2026-04-20T09:00:00Z",
          endedAt: "2026-04-20T10:30:45Z",
        }),
      ),
    ).toBe(90 * 60 + 45);
  });

  it("returns null for malformed inputs", () => {
    expect(
      computeWorkoutDurationSec(w({ startedAt: "nope", endedAt: "nope" })),
    ).toBeNull();
    expect(computeWorkoutDurationSec(null)).toBeNull();
  });
});

describe("computeWorkoutSummary", () => {
  it("aggregates itemCount / setCount / tonnage / duration / finished", () => {
    const summary = computeWorkoutSummary(
      w({
        startedAt: "2026-04-20T09:00:00Z",
        endedAt: "2026-04-20T10:00:00Z",
        items: [
          {
            id: "it_1",
            exerciseId: "ex_1",
            nameUk: "Жим",
            primaryGroup: "chest",
            musclesPrimary: [],
            musclesSecondary: [],
            type: "strength",
            sets: [{ weightKg: 80, reps: 5 }],
          },
        ],
      }),
    );
    expect(summary).toEqual({
      itemCount: 1,
      setCount: 1,
      tonnageKg: 400,
      durationSec: 3600,
      isFinished: true,
    });
  });
});

describe("formatWorkoutDateLabel", () => {
  it("returns 'Без дати' for the empty bucket", () => {
    expect(formatWorkoutDateLabel("")).toBe("Без дати");
  });

  it("formats a valid key via toLocaleDateString", () => {
    const label = formatWorkoutDateLabel("2026-04-20", "uk-UA");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
    // '2026' in the year slot.
    expect(label).toContain("2026");
  });

  it("falls back to the raw key for unparseable input", () => {
    expect(formatWorkoutDateLabel("nope")).toBe("nope");
  });
});
