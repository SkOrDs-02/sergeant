import { describe, expect, it } from "vitest";

import {
  clampRpe,
  createEmptySetDraft,
  decrementReps,
  decrementWeight,
  draftToSet,
  incrementReps,
  incrementWeight,
  isSetDraftValid,
  MAX_REPS,
  MAX_WEIGHT_KG,
  RPE_MAX,
  RPE_MIN,
  setReps,
  setRpe,
  setToDraft,
  setWeightKg,
  snapReps,
  snapWeightKg,
  validateSetDraft,
  WEIGHT_STEP_KG,
} from "./activeSet.js";

describe("createEmptySetDraft", () => {
  it("starts at 0/0 with no RPE", () => {
    const draft = createEmptySetDraft();
    expect(draft).toEqual({ weightKg: 0, reps: 0, rpe: null });
  });
});

describe("snapWeightKg", () => {
  it("snaps to 2.5 kg grid and clamps to [0, MAX_WEIGHT_KG]", () => {
    expect(snapWeightKg(-10)).toBe(0);
    expect(snapWeightKg(0)).toBe(0);
    expect(snapWeightKg(1.2)).toBe(0);
    expect(snapWeightKg(1.3)).toBe(2.5);
    expect(snapWeightKg(61)).toBe(60);
    expect(snapWeightKg(61.5)).toBe(62.5);
    expect(snapWeightKg(MAX_WEIGHT_KG + 50)).toBe(MAX_WEIGHT_KG);
  });

  it("respects a custom step", () => {
    expect(snapWeightKg(20, 5)).toBe(20);
    expect(snapWeightKg(23, 5)).toBe(25);
  });

  it("treats non-finite input as 0", () => {
    expect(snapWeightKg(Number.NaN)).toBe(0);
  });
});

describe("snapReps", () => {
  it("rounds to integer and clamps to [0, MAX_REPS]", () => {
    expect(snapReps(5.4)).toBe(5);
    expect(snapReps(5.6)).toBe(6);
    expect(snapReps(-2)).toBe(0);
    expect(snapReps(MAX_REPS + 10)).toBe(MAX_REPS);
  });
});

describe("clampRpe", () => {
  it("returns null for unset / non-finite input", () => {
    expect(clampRpe(null)).toBeNull();
    expect(clampRpe(undefined)).toBeNull();
    expect(clampRpe(Number.NaN)).toBeNull();
  });

  it("clamps to the Borg range and half-step rounds", () => {
    expect(clampRpe(0)).toBe(RPE_MIN);
    expect(clampRpe(100)).toBe(RPE_MAX);
    expect(clampRpe(7.2)).toBe(7);
    expect(clampRpe(7.3)).toBe(7.5);
    expect(clampRpe(RPE_MIN)).toBe(RPE_MIN);
    expect(clampRpe(RPE_MAX)).toBe(RPE_MAX);
  });
});

describe("incrementWeight / decrementWeight", () => {
  it("steps by the default 2.5 kg", () => {
    const d = createEmptySetDraft();
    const a = incrementWeight(d);
    expect(a.weightKg).toBe(WEIGHT_STEP_KG);
    const b = incrementWeight(a);
    expect(b.weightKg).toBe(WEIGHT_STEP_KG * 2);
    const c = decrementWeight(b);
    expect(c.weightKg).toBe(WEIGHT_STEP_KG);
  });

  it("clamps at 0", () => {
    const d = createEmptySetDraft();
    const dec = decrementWeight(d);
    expect(dec.weightKg).toBe(0);
  });

  it("returns a new object (immutability)", () => {
    const d = createEmptySetDraft();
    const next = incrementWeight(d);
    expect(next).not.toBe(d);
    expect(d.weightKg).toBe(0);
  });
});

describe("incrementReps / decrementReps", () => {
  it("moves by 1 and clamps at 0", () => {
    const d = createEmptySetDraft();
    const a = incrementReps(d);
    expect(a.reps).toBe(1);
    const b = incrementReps(a);
    expect(b.reps).toBe(2);
    const c = decrementReps(b);
    expect(c.reps).toBe(1);
    const zero = decrementReps(decrementReps(c));
    expect(zero.reps).toBe(0);
  });
});

describe("setWeightKg / setReps / setRpe", () => {
  it("snap inputs through the shared clampers", () => {
    const d = createEmptySetDraft();
    expect(setWeightKg(d, 81).weightKg).toBe(80);
    expect(setReps(d, 10.4).reps).toBe(10);
    expect(setRpe(d, 8).rpe).toBe(8);
    expect(setRpe(d, 100).rpe).toBe(RPE_MAX);
    expect(setRpe(d, null).rpe).toBeNull();
  });
});

describe("validateSetDraft / isSetDraftValid", () => {
  it("accepts a normal 60 kg × 8 set", () => {
    const errs = validateSetDraft({ weightKg: 60, reps: 8 });
    expect(errs).toEqual({});
    expect(isSetDraftValid(errs)).toBe(true);
  });

  it("rejects an empty 0 kg × 0 set", () => {
    const errs = validateSetDraft(createEmptySetDraft());
    expect(errs.reps).toBeTruthy();
    expect(isSetDraftValid(errs)).toBe(false);
  });

  it("rejects out-of-range weights", () => {
    expect(validateSetDraft({ weightKg: -1, reps: 5 }).weightKg).toBeTruthy();
    expect(
      validateSetDraft({ weightKg: MAX_WEIGHT_KG + 1, reps: 5 }).weightKg,
    ).toBeTruthy();
  });

  it("rejects non-integer reps", () => {
    expect(validateSetDraft({ weightKg: 60, reps: 5.5 }).reps).toBeTruthy();
  });

  it("rejects out-of-range RPE", () => {
    expect(
      validateSetDraft({ weightKg: 60, reps: 5, rpe: 12 }).rpe,
    ).toBeTruthy();
    expect(
      validateSetDraft({ weightKg: 60, reps: 5, rpe: 0 }).rpe,
    ).toBeTruthy();
  });

  it("allows a partially-filled set with only reps (e.g. bodyweight)", () => {
    const errs = validateSetDraft({ weightKg: 0, reps: 12 });
    expect(errs).toEqual({});
    expect(isSetDraftValid(errs)).toBe(true);
  });
});

describe("setToDraft / draftToSet round-trip", () => {
  it("preserves strength set shape", () => {
    const draft = setToDraft({ weightKg: 80, reps: 5 });
    expect(draft).toEqual({ weightKg: 80, reps: 5, rpe: null });
    const set = draftToSet({ weightKg: 80, reps: 5, rpe: null });
    expect(set).toEqual({ weightKg: 80, reps: 5 });
  });

  it("round-trips RPE when present", () => {
    const set = draftToSet({ weightKg: 60, reps: 8, rpe: 7.5 });
    expect(set).toEqual({ weightKg: 60, reps: 8, rpe: 7.5 });
    const draft = setToDraft(set);
    expect(draft).toEqual({ weightKg: 60, reps: 8, rpe: 7.5 });
  });

  it("omits RPE for legacy sets without the field", () => {
    const set = draftToSet({ weightKg: 60, reps: 8 });
    expect((set as { rpe?: number }).rpe).toBeUndefined();
  });
});
