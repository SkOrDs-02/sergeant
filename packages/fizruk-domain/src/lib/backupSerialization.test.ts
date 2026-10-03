import { describe, it, expect } from "vitest";
import {
  mergeCustomById,
  mergeWorkoutsById,
  parseCustomExercisesFromStorage,
  parseWorkoutsFromStorage,
  serializeCustomExercisesToStorage,
  serializeWorkoutsToStorage,
} from "./backupSerialization";

describe("parseWorkoutsFromStorage", () => {
  it("returns [] for null / empty / undefined", () => {
    expect(parseWorkoutsFromStorage(null)).toEqual([]);
    expect(parseWorkoutsFromStorage("")).toEqual([]);
    expect(parseWorkoutsFromStorage(undefined)).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseWorkoutsFromStorage("{not json")).toEqual([]);
    expect(parseWorkoutsFromStorage("garbage")).toEqual([]);
  });

  it("accepts legacy plain-array shape", () => {
    expect(parseWorkoutsFromStorage('[{"id":"a"}]')).toEqual([{ id: "a" }]);
  });

  it("accepts new { schemaVersion, workouts } shape", () => {
    const raw = JSON.stringify({ schemaVersion: 1, workouts: [{ id: "b" }] });
    expect(parseWorkoutsFromStorage(raw)).toEqual([{ id: "b" }]);
  });

  it("returns [] when inner shape is unexpected", () => {
    expect(
      parseWorkoutsFromStorage(JSON.stringify({ workouts: "oops" })),
    ).toEqual([]);
  });
});

describe("serializeWorkoutsToStorage", () => {
  it("wraps payload with schemaVersion", () => {
    const out = JSON.parse(serializeWorkoutsToStorage([{ id: "a" }]));
    expect(out).toEqual({ schemaVersion: 1, workouts: [{ id: "a" }] });
  });
  it("coerces non-array into empty list", () => {
    const out = JSON.parse(serializeWorkoutsToStorage(null as never));
    expect(out.workouts).toEqual([]);
  });
});

describe("parseCustomExercisesFromStorage", () => {
  it("returns [] for null / malformed JSON", () => {
    expect(parseCustomExercisesFromStorage(null)).toEqual([]);
    expect(parseCustomExercisesFromStorage("broken")).toEqual([]);
  });
  it("accepts legacy + new shapes", () => {
    expect(parseCustomExercisesFromStorage('[{"id":"x"}]')).toEqual([
      { id: "x" },
    ]);
    const raw = JSON.stringify({ schemaVersion: 1, exercises: [{ id: "y" }] });
    expect(parseCustomExercisesFromStorage(raw)).toEqual([{ id: "y" }]);
  });
});

describe("serializeCustomExercisesToStorage", () => {
  it("wraps payload with schemaVersion", () => {
    const out = JSON.parse(
      serializeCustomExercisesToStorage([{ id: "x", name: { uk: "A" } }]),
    );
    expect(out).toEqual({
      schemaVersion: 1,
      exercises: [{ id: "x", name: { uk: "A" } }],
    });
  });
});

describe("mergeWorkoutsById", () => {
  it("deduplicates by id and sorts by startedAt desc", () => {
    const a = [
      { id: "1", startedAt: "2025-01-01T10:00:00Z" },
      { id: "2", startedAt: "2025-01-02T10:00:00Z" },
    ];
    const b = [
      { id: "2", startedAt: "2025-01-02T12:00:00Z" },
      { id: "3", startedAt: "2025-01-03T10:00:00Z" },
    ];
    const merged = mergeWorkoutsById(a, b);
    expect(merged.map((x) => x.id)).toEqual(["3", "2", "1"]);
    // later version from `b` should win for `id=2`
    expect(merged.find((x) => x.id === "2")?.startedAt).toBe(
      "2025-01-02T12:00:00Z",
    );
  });
  it("ignores items without id", () => {
    expect(mergeWorkoutsById([{}, { id: "a" }], null)).toEqual([{ id: "a" }]);
  });

  it("ignores non-object entries and treats missing a/b as empty", () => {
    expect(
      mergeWorkoutsById(["not-an-object", null, { id: "a" }], undefined),
    ).toEqual([{ id: "a" }]);
    expect(mergeWorkoutsById(undefined, undefined)).toEqual([]);
  });

  it("sorts entries missing startedAt to the end (empty-string fallback)", () => {
    const merged = mergeWorkoutsById(
      [
        { id: "1", startedAt: "2025-01-01T10:00:00Z" },
        { id: "2" }, // no startedAt
      ],
      null,
    );
    expect(merged.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("mergeCustomById", () => {
  it("deduplicates by id, last-write-wins", () => {
    const merged = mergeCustomById(
      [{ id: "a", name: { uk: "old" } }],
      [{ id: "a", name: { uk: "new" } }, { id: "b" }],
    );
    expect(merged.find((x) => x.id === "a")).toEqual({
      id: "a",
      name: { uk: "new" },
    });
    expect(merged.find((x) => x.id === "b")).toBeTruthy();
  });

  it("ignores non-object entries and treats missing a/b as empty", () => {
    expect(mergeCustomById(["nope", 42, { id: "a" }], undefined)).toEqual([
      { id: "a" },
    ]);
    expect(mergeCustomById(undefined, undefined)).toEqual([]);
  });
});
