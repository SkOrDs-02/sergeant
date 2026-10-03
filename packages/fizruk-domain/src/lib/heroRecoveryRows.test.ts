import { describe, it, expect } from "vitest";
import { selectHeroRecoveryRows } from "./heroRecoveryRows";
import type { MuscleState } from "../domain/types";

/** Minimal `MuscleState` builder — every test only overrides what it needs. */
function muscle(id: string, over: Partial<MuscleState> = {}): MuscleState {
  return {
    id,
    label: id,
    lastAt: Date.now(),
    daysSince: 1,
    load7d: 1,
    load14d: 1,
    fatigue: 1,
    status: "green",
    ...over,
  };
}

describe("selectHeroRecoveryRows", () => {
  it("returns an empty array for a fresh user with no training and no injuries", () => {
    expect(selectHeroRecoveryRows({}, new Set())).toEqual([]);
    expect(selectHeroRecoveryRows(null, null)).toEqual([]);
  });

  it("sorts red -> yellow -> green, then by fatigue descending within a status", () => {
    const by: Record<string, MuscleState> = {
      pectoralis_major: muscle("pectoralis_major", {
        status: "green",
        fatigue: 0.1,
      }),
      triceps: muscle("triceps", { status: "red", fatigue: 2 }),
      biceps: muscle("biceps", { status: "red", fatigue: 4 }),
      trapezius: muscle("trapezius", { status: "yellow", fatigue: 1 }),
    };
    const rows = selectHeroRecoveryRows(by, new Set());
    expect(rows.map((r) => r.atlasId)).toEqual([
      "biceps", // red, fatigue 4
      "triceps", // red, fatigue 2
      "trapezius", // yellow
      "chest", // green (pectoralis_major -> chest)
    ]);
  });

  it("caps at `limit` (default 6), keeping the highest-priority rows", () => {
    const by: Record<string, MuscleState> = {};
    // 7 distinct atlas targets — chest already fatigue 0.5 seeds the pool.
    for (const [id, atlas] of [
      ["pectoralis_major", "chest"],
      ["trapezius", "trapezius"],
      ["biceps", "biceps"],
      ["triceps", "triceps"],
      ["rectus_abdominis", "abs"],
      ["obliques", "obliques"],
      ["quadriceps", "quadriceps"],
    ] as const) {
      by[id] = muscle(id, { fatigue: 1, status: "green" });
      void atlas;
    }
    const rows = selectHeroRecoveryRows(by, new Set(), 6);
    expect(rows.length).toBe(6);
  });

  it("excludes untrained-in-14-days groups, but never excludes an injured zone", () => {
    const by: Record<string, MuscleState> = {
      pectoralis_major: muscle("pectoralis_major", { load14d: 0 }),
    };
    const rows = selectHeroRecoveryRows(by, new Set(["knee"]));
    expect(rows).toEqual([
      {
        atlasId: "knee",
        label: "Коліно",
        kind: "injury",
        status: "red",
        fatigue: 0,
        domainMuscleId: null,
      },
    ]);
  });

  it("injury on a zone with no domain state at all (knee)", () => {
    const rows = selectHeroRecoveryRows({}, new Set(["knee"]));
    expect(rows).toEqual([
      {
        atlasId: "knee",
        label: "Коліно",
        kind: "injury",
        status: "red",
        fatigue: 0,
        domainMuscleId: null,
      },
    ]);
  });

  it("injury on an atlas muscle with no matching domain state (chest, untrained)", () => {
    const rows = selectHeroRecoveryRows({}, new Set(["chest"]));
    expect(rows).toEqual([
      {
        atlasId: "chest",
        label: "Груди",
        kind: "injury",
        status: "red",
        fatigue: 0,
        domainMuscleId: null,
      },
    ]);
  });

  it("dedups an injured atlas muscle against its trained domain state — one row, the injury", () => {
    const by: Record<string, MuscleState> = {
      pectoralis_major: muscle("pectoralis_major", {
        status: "red",
        fatigue: 5,
        load14d: 3,
      }),
    };
    const rows = selectHeroRecoveryRows(by, new Set(["chest"]));
    expect(rows).toEqual([
      {
        atlasId: "chest",
        label: "Груди",
        kind: "injury",
        status: "red",
        fatigue: 0,
        domainMuscleId: null,
      },
    ]);
  });

  it("injury rows always lead, regardless of muscle-row fatigue", () => {
    const by: Record<string, MuscleState> = {
      biceps: muscle("biceps", { status: "red", fatigue: 10 }),
    };
    const rows = selectHeroRecoveryRows(by, new Set(["knee"]));
    expect(rows.map((r) => r.atlasId)).toEqual(["knee", "biceps"]);
  });

  it("folds several domain muscles onto one atlas group, keeping the max-fatigue source id", () => {
    const by: Record<string, MuscleState> = {
      pectoralis_major: muscle("pectoralis_major", {
        status: "yellow",
        fatigue: 1,
        load14d: 1,
      }),
      pectoralis_minor: muscle("pectoralis_minor", {
        status: "red",
        fatigue: 3,
        load14d: 1,
      }),
    };
    const rows = selectHeroRecoveryRows(by, new Set());
    expect(rows).toEqual([
      {
        atlasId: "chest",
        label: "Груди",
        kind: "muscle",
        status: "red", // worst of yellow/red
        fatigue: 3, // max
        domainMuscleId: "pectoralis_minor", // the max-fatigue contributor
      },
    ]);
  });
});
