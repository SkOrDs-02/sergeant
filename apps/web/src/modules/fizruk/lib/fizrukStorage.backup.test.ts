// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFizrukBackupPayload,
  buildFizrukBackupPayload,
  buildFizrukFullBackupPayload,
  parseWorkoutsFromStorage,
  parseCustomExercisesFromStorage,
  WORKOUTS_STORAGE_KEY,
  CUSTOM_EXERCISES_KEY,
} from "./fizrukStorage";
import { FIZRUK_BACKUP_KIND } from "./fizrukBackupShape";

describe("fizrukStorage – backup builders", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("buildFizrukBackupPayload", () => {
    it("reads workouts/customExercises from storage into a typed payload", () => {
      localStorage.setItem(
        WORKOUTS_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, workouts: [{ id: "w1" }] }),
      );
      localStorage.setItem(
        CUSTOM_EXERCISES_KEY,
        JSON.stringify({ schemaVersion: 1, exercises: [{ id: "e1" }] }),
      );
      const payload = buildFizrukBackupPayload();
      expect(payload.kind).toBe(FIZRUK_BACKUP_KIND);
      expect(payload.schemaVersion).toBe(1);
      expect(payload.workouts).toEqual([{ id: "w1" }]);
      expect(payload.customExercises).toEqual([{ id: "e1" }]);
      expect(typeof payload.exportedAt).toBe("string");
    });

    it("returns empty arrays when storage is empty", () => {
      const payload = buildFizrukBackupPayload();
      expect(payload.workouts).toEqual([]);
      expect(payload.customExercises).toEqual([]);
    });
  });

  describe("applyFizrukBackupPayload", () => {
    it("replaces storage when { replace: true }", () => {
      localStorage.setItem(
        WORKOUTS_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, workouts: [{ id: "old" }] }),
      );
      const result = applyFizrukBackupPayload(
        {
          kind: FIZRUK_BACKUP_KIND,
          workouts: [{ id: "new" }],
          customExercises: [{ id: "c" }],
        },
        { replace: true },
      );
      expect(result).toEqual({ workouts: 1, customExercises: 1 });
      expect(
        parseWorkoutsFromStorage(localStorage.getItem(WORKOUTS_STORAGE_KEY)),
      ).toEqual([{ id: "new" }]);
    });

    it("merges by id when replace is omitted", () => {
      localStorage.setItem(
        WORKOUTS_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, workouts: [{ id: "w1" }] }),
      );
      const result = applyFizrukBackupPayload({
        kind: FIZRUK_BACKUP_KIND,
        workouts: [{ id: "w2" }],
        customExercises: [],
      });
      expect(result.workouts).toBe(2);
      const merged = parseWorkoutsFromStorage(
        localStorage.getItem(WORKOUTS_STORAGE_KEY),
      );
      expect(merged.map((w) => (w as { id: string }).id).sort()).toEqual([
        "w1",
        "w2",
      ]);
    });

    it("throws on an invalid backup shape", () => {
      expect(() => applyFizrukBackupPayload({ kind: "nope" })).toThrow();
    });
  });

  describe("buildFizrukFullBackupPayload", () => {
    it("snapshots every full-backup key (null when absent)", () => {
      localStorage.setItem(
        WORKOUTS_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, workouts: [] }),
      );
      const payload = buildFizrukFullBackupPayload();
      expect(payload.kind).toBe("fizruk-full-backup");
      expect(payload.data[WORKOUTS_STORAGE_KEY]).not.toBeNull();
      // a key with no stored value snapshots as null
      expect(payload.data[CUSTOM_EXERCISES_KEY]).toBeNull();
    });
  });

  it("round-trips parseCustomExercisesFromStorage after a replace import", () => {
    applyFizrukBackupPayload(
      {
        kind: FIZRUK_BACKUP_KIND,
        workouts: [],
        customExercises: [{ id: "x1" }],
      },
      { replace: true },
    );
    expect(
      parseCustomExercisesFromStorage(
        localStorage.getItem(CUSTOM_EXERCISES_KEY),
      ),
    ).toEqual([{ id: "x1" }]);
  });
});
