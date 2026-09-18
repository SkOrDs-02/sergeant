// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyFizrukFullBackupPayload,
  buildFizrukFullBackupPayload,
  parseWorkoutsFromStorage,
  parseCustomExercisesFromStorage,
  WORKOUTS_STORAGE_KEY,
  CUSTOM_EXERCISES_KEY,
} from "./fizrukStorage";

describe("fizrukStorage – defensive parsing/import", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("parseWorkoutsFromStorage", () => {
    it("returns [] for null / empty / undefined", () => {
      expect(parseWorkoutsFromStorage(null)).toEqual([]);
      expect(parseWorkoutsFromStorage("")).toEqual([]);
      expect(parseWorkoutsFromStorage(undefined)).toEqual([]);
    });
    it("returns [] for malformed JSON", () => {
      expect(parseWorkoutsFromStorage("{not json")).toEqual([]);
      expect(parseWorkoutsFromStorage("not even close")).toEqual([]);
    });
    it("accepts legacy plain-array shape", () => {
      expect(parseWorkoutsFromStorage('[{"id":"a"}]')).toEqual([{ id: "a" }]);
    });
    it("accepts new {schemaVersion, workouts} shape", () => {
      const raw = JSON.stringify({ schemaVersion: 1, workouts: [{ id: "b" }] });
      expect(parseWorkoutsFromStorage(raw)).toEqual([{ id: "b" }]);
    });
    it("returns [] when inner shape is unexpected (e.g. {workouts:'oops'})", () => {
      expect(
        parseWorkoutsFromStorage(JSON.stringify({ workouts: "oops" })),
      ).toEqual([]);
    });
  });

  describe("parseCustomExercisesFromStorage", () => {
    it("returns [] for null / malformed JSON", () => {
      expect(parseCustomExercisesFromStorage(null)).toEqual([]);
      expect(parseCustomExercisesFromStorage("broken")).toEqual([]);
    });
    it("accepts legacy and new shapes", () => {
      expect(parseCustomExercisesFromStorage('[{"id":"x"}]')).toEqual([
        { id: "x" },
      ]);
      const newShape = JSON.stringify({
        schemaVersion: 1,
        exercises: [{ id: "y" }],
      });
      expect(parseCustomExercisesFromStorage(newShape)).toEqual([{ id: "y" }]);
    });
  });

  describe("applyFizrukFullBackupPayload", () => {
    it("throws on null / undefined / non-object", () => {
      expect(() => applyFizrukFullBackupPayload(null)).toThrow();
      expect(() => applyFizrukFullBackupPayload(undefined)).toThrow();
      expect(() => applyFizrukFullBackupPayload(123)).toThrow();
      expect(() => applyFizrukFullBackupPayload("string")).toThrow();
    });

    it("throws when `data` is missing or not an object", () => {
      expect(() => applyFizrukFullBackupPayload({})).toThrow();
      expect(() => applyFizrukFullBackupPayload({ data: null })).toThrow();
      expect(() => applyFizrukFullBackupPayload({ data: 42 })).toThrow();
    });

    it("silently ignores non-string values inside data and only writes strings", () => {
      applyFizrukFullBackupPayload({
        data: {
          [WORKOUTS_STORAGE_KEY]: 123, // ignored
          [CUSTOM_EXERCISES_KEY]: JSON.stringify({
            schemaVersion: 1,
            exercises: [{ id: "e1" }],
          }),
        },
      });
      expect(localStorage.getItem(WORKOUTS_STORAGE_KEY)).toBeNull();
      const c = parseCustomExercisesFromStorage(
        localStorage.getItem(CUSTOM_EXERCISES_KEY),
      );
      expect(c).toEqual([{ id: "e1" }]);
    });

    it("round-trips buildFizrukFullBackupPayload -> applyFizrukFullBackupPayload", () => {
      localStorage.setItem(
        WORKOUTS_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          workouts: [{ id: "w1", startedAt: "2024-01-01T00:00:00Z" }],
        }),
      );
      const payload = buildFizrukFullBackupPayload();
      // reset and re-apply
      localStorage.clear();
      applyFizrukFullBackupPayload(payload);
      const workouts = parseWorkoutsFromStorage(
        localStorage.getItem(WORKOUTS_STORAGE_KEY),
      );
      expect(workouts).toEqual([
        { id: "w1", startedAt: "2024-01-01T00:00:00Z" },
      ]);
    });
  });
});
