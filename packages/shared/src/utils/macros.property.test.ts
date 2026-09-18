import { describe, expect, it } from "vitest";
import {
  macrosHasAnyValue,
  macrosToTotals,
  normalizeMacrosNullable,
} from "./macros";

/**
 * Property-based tests for the macros utilities.
 *
 * NOTE: the planned card (T-8) calls for `fast-check`, but that dependency is
 * not installed in this repo and the task scope forbids adding it. To still
 * cover the invariants the card targets, these suites drive a small seeded
 * PRNG over many generated inputs instead of `fc.assert`. The structure mirrors
 * a fast-check property (generator + invariant assertion) so each block can be
 * lifted to `fc.assert(fc.property(...))` verbatim once the dep lands.
 */

// Deterministic PRNG (mulberry32) seeded to 42 so a "random" failure is
// reproducible across runs and CI — mirrors the card's `seed: 42` requirement.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 1000);
const rng = makeRng(42);

/** A grab-bag generator of values the macros parser must tolerate. */
function arbitraryFieldValue(): unknown {
  const r = rng();
  if (r < 0.45) return rng() * 2000 - 200; // numbers incl. negatives
  if (r < 0.6) return String(Math.round(rng() * 5000)); // numeric strings
  if (r < 0.7) return ""; // empty string
  if (r < 0.78) return "not-a-number";
  if (r < 0.85) return null;
  if (r < 0.9) return undefined;
  if (r < 0.95) return Number.POSITIVE_INFINITY;
  return Number.NaN;
}

function arbitraryMacros(): Record<string, unknown> {
  return {
    kcal: arbitraryFieldValue(),
    protein_g: arbitraryFieldValue(),
    fat_g: arbitraryFieldValue(),
    carbs_g: arbitraryFieldValue(),
  };
}

const FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"] as const;

describe("shared/utils/macros – property", () => {
  it("normalizeMacrosNullable: every field is either null or a finite non-negative number", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const input = arbitraryMacros();
      const out = normalizeMacrosNullable(input);
      for (const f of FIELDS) {
        const v = out[f];
        if (v !== null) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("normalizeMacrosNullable: idempotent (re-normalizing the result is a no-op)", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const out1 = normalizeMacrosNullable(arbitraryMacros());
      const out2 = normalizeMacrosNullable(out1);
      expect(out2).toEqual(out1);
    }
  });

  it("macrosToTotals: never produces null, NaN, or negative totals", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const totals = macrosToTotals(arbitraryMacros());
      for (const f of FIELDS) {
        const v = totals[f];
        expect(typeof v).toBe("number");
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("macrosToTotals: agrees with normalizeMacrosNullable (null coerced to 0, else identical)", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const input = arbitraryMacros();
      const nullable = normalizeMacrosNullable(input);
      const totals = macrosToTotals(input);
      for (const f of FIELDS) {
        expect(totals[f]).toBe(nullable[f] ?? 0);
      }
    }
  });

  it("macrosHasAnyValue: true iff normalizeMacrosNullable has at least one non-null field", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const input = arbitraryMacros();
      const nullable = normalizeMacrosNullable(input);
      const anyNonNull = FIELDS.some((f) => nullable[f] !== null);
      expect(macrosHasAnyValue(input)).toBe(anyNonNull);
    }
  });

  it("normalizeMacrosNullable: a valid non-negative number round-trips unchanged", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const kcal = Math.round(rng() * 9999);
      const out = normalizeMacrosNullable({
        kcal,
        protein_g: 0,
        fat_g: 0,
        carbs_g: 0,
      });
      // identity / no-op: adding zero-valued fields does not perturb kcal
      expect(out.kcal).toBe(kcal);
      expect(out.protein_g).toBe(0);
    }
  });

  it("macrosToTotals: monotonicity — adding a positive finite value to a field never decreases its total", () => {
    // Property: for any base macros object, if we add a strictly
    // positive finite amount to one field, the resulting total for
    // that field must be ≥ the original total (it either stays the
    // same when the base was invalid/negative, or increases).
    for (let i = 0; i < NUM_RUNS; i++) {
      const base = arbitraryMacros();
      const delta = rng() * 500 + 0.001; // always > 0
      const baseTotal = macrosToTotals(base);

      // Add delta to kcal only; all other fields are unchanged.
      const augmented = { ...base, kcal: (Number(base["kcal"]) || 0) + delta };
      const augTotal = macrosToTotals(augmented);

      expect(augTotal.kcal).toBeGreaterThanOrEqual(baseTotal.kcal);
    }
  });

  it("macrosToTotals: integer inputs produce integer outputs (no floating-point drift)", () => {
    // When all macro fields are non-negative integers the totals must
    // also be integers — guards against fractional coercion bugs (e.g.
    // a future parseFloat path that introduces .0000001 drift on
    // whole-number kcal values stored as strings).
    for (let i = 0; i < NUM_RUNS; i++) {
      const kcal = Math.floor(rng() * 5000);
      const protein = Math.floor(rng() * 300);
      const fat = Math.floor(rng() * 200);
      const carbs = Math.floor(rng() * 400);
      const totals = macrosToTotals({
        kcal,
        protein_g: protein,
        fat_g: fat,
        carbs_g: carbs,
      });
      expect(totals.kcal).toBe(kcal);
      expect(totals.protein_g).toBe(protein);
      expect(totals.fat_g).toBe(fat);
      expect(totals.carbs_g).toBe(carbs);
    }
  });
});
