import { describe, expect, it } from "vitest";
import {
  recoveryConflictsForExercise,
  recoveryConflictsForWorkoutItem,
} from "./recoveryConflict";

describe("recoveryConflictsForExercise", () => {
  it("returns no warning when muscles empty", () => {
    const ex = { muscles: { primary: [], secondary: [] } };
    const cf = recoveryConflictsForExercise(ex, {});
    expect(cf.hasWarning).toBe(false);
  });

  it("flags red when primary muscle is red", () => {
    const ex = { muscles: { primary: ["chest"], secondary: [] } };
    const by = { chest: { label: "Груди", status: "red" as const } };
    const cf = recoveryConflictsForExercise(ex, by);
    expect(cf.hasWarning).toBe(true);
    expect(cf.red.length).toBe(1);
  });

  it("flags yellow for secondary", () => {
    const ex = { muscles: { primary: [], secondary: ["back"] } };
    const by = { back: { label: "Спина", status: "yellow" as const } };
    const cf = recoveryConflictsForExercise(ex, by);
    expect(cf.yellow.length).toBe(1);
  });

  it("does not flag when muscle is green", () => {
    const ex = { muscles: { primary: ["chest"], secondary: [] } };
    const by = { chest: { label: "Груди", status: "green" as const } };
    const cf = recoveryConflictsForExercise(ex, by);
    expect(cf.hasWarning).toBe(false);
    expect(cf.hasHardBlock).toBe(false);
  });

  it("ignores muscle ids missing from the recovery map", () => {
    const ex = { muscles: { primary: ["unknown_muscle"], secondary: [] } };
    const cf = recoveryConflictsForExercise(ex, {});
    expect(cf.hasWarning).toBe(false);
    expect(cf.red).toEqual([]);
  });

  it("falls back to the muscle id when the recovery entry has no label", () => {
    const ex = { muscles: { primary: ["chest"], secondary: [] } };
    const by = { chest: { status: "red" as const } };
    const cf = recoveryConflictsForExercise(ex, by);
    expect(cf.red[0]?.label).toBe("chest");
  });

  it("defaults muscles and the recovery map when omitted", () => {
    expect(recoveryConflictsForExercise(null)).toEqual({
      red: [],
      yellow: [],
      hasWarning: false,
      hasHardBlock: false,
    });
    expect(recoveryConflictsForExercise(undefined, {})).toEqual({
      red: [],
      yellow: [],
      hasWarning: false,
      hasHardBlock: false,
    });
  });

  it("hasHardBlock is true only when there is at least one red muscle", () => {
    const ex = { muscles: { primary: [], secondary: ["back"] } };
    const by = { back: { label: "Спина", status: "yellow" as const } };
    const cf = recoveryConflictsForExercise(ex, by);
    expect(cf.hasWarning).toBe(true);
    expect(cf.hasHardBlock).toBe(false);
  });
});

describe("recoveryConflictsForWorkoutItem", () => {
  it("maps item muscles to exercise shape", () => {
    const it = { musclesPrimary: ["legs"], musclesSecondary: [] };
    const by = { legs: { label: "Ноги", status: "red" as const } };
    const cf = recoveryConflictsForWorkoutItem(it, by);
    expect(cf.hasWarning).toBe(true);
  });

  it("defaults to empty muscle lists when the item is null/undefined", () => {
    expect(recoveryConflictsForWorkoutItem(null).hasWarning).toBe(false);
    expect(recoveryConflictsForWorkoutItem(undefined, {}).hasWarning).toBe(
      false,
    );
  });
});
