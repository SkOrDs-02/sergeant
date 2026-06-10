import { describe, expect, it } from "vitest";
import {
  FIZRUK_BACKUP_KIND,
  FIZRUK_FULL_BACKUP_KIND,
  assertFizrukBackupShape,
  isFizrukBackupShape,
  isFizrukFullBackupShape,
} from "./fizrukBackupShape";

describe("fizrukBackupShape", () => {
  describe("isFizrukBackupShape", () => {
    it("accepts a well-formed payload", () => {
      expect(
        isFizrukBackupShape({
          kind: FIZRUK_BACKUP_KIND,
          workouts: [],
          customExercises: [],
        }),
      ).toBe(true);
    });

    it("rejects null / non-object inputs", () => {
      expect(isFizrukBackupShape(null)).toBe(false);
      expect(isFizrukBackupShape(undefined)).toBe(false);
      expect(isFizrukBackupShape(42)).toBe(false);
      expect(isFizrukBackupShape("string")).toBe(false);
    });

    it("rejects wrong kind discriminator", () => {
      expect(
        isFizrukBackupShape({
          kind: "fizruk-full-backup",
          workouts: [],
          customExercises: [],
        }),
      ).toBe(false);
    });

    it("rejects when workouts / customExercises are not arrays", () => {
      expect(
        isFizrukBackupShape({
          kind: FIZRUK_BACKUP_KIND,
          workouts: {},
          customExercises: [],
        }),
      ).toBe(false);
      expect(
        isFizrukBackupShape({
          kind: FIZRUK_BACKUP_KIND,
          workouts: [],
          customExercises: "oops",
        }),
      ).toBe(false);
    });
  });

  describe("assertFizrukBackupShape", () => {
    it("returns the payload when valid", () => {
      const payload = {
        kind: FIZRUK_BACKUP_KIND,
        workouts: [{ id: "w1" }],
        customExercises: [],
      };
      expect(assertFizrukBackupShape(payload)).toBe(payload);
    });

    it("throws on invalid input", () => {
      expect(() => assertFizrukBackupShape(null)).toThrow();
      expect(() =>
        assertFizrukBackupShape({
          kind: "other",
          workouts: [],
          customExercises: [],
        }),
      ).toThrow();
    });
  });

  describe("isFizrukFullBackupShape", () => {
    it("accepts a payload with kind + string/null data record", () => {
      expect(
        isFizrukFullBackupShape({
          kind: FIZRUK_FULL_BACKUP_KIND,
          data: { foo: "x", bar: null },
        }),
      ).toBe(true);
    });

    it("rejects payloads without the kind discriminator", () => {
      expect(isFizrukFullBackupShape({ data: { foo: "x" } })).toBe(false);
    });

    it("rejects when data is missing or not a record", () => {
      expect(isFizrukFullBackupShape({ kind: FIZRUK_FULL_BACKUP_KIND })).toBe(
        false,
      );
      expect(
        isFizrukFullBackupShape({ kind: FIZRUK_FULL_BACKUP_KIND, data: null }),
      ).toBe(false);
      expect(
        isFizrukFullBackupShape({
          kind: FIZRUK_FULL_BACKUP_KIND,
          data: [1, 2, 3],
        }),
      ).toBe(false);
    });

    it("rejects when data holds non-string / non-null values", () => {
      expect(
        isFizrukFullBackupShape({
          kind: FIZRUK_FULL_BACKUP_KIND,
          data: { foo: 42 },
        }),
      ).toBe(false);
    });
  });
});
