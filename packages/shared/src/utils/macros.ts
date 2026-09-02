import { z } from "zod";

/**
 * Macros object where each field may be null (unknown / not entered).
 *
 * unification-modules.md #2.27: canon shape for the three byte-identical
 * declarations (here, `@sergeant/api-client`'s `NutritionMacros`, and the
 * request-side `Macros` zod schema in `schemas/api.ts`, which stays a
 * separate `.optional()` variant — a request payload may omit a field
 * entirely, this domain type never does).
 */
export const NullableMacrosSchema = z.object({
  kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
});
export type NullableMacros = z.infer<typeof NullableMacrosSchema>;

/** Macros object with numeric totals (null coerced to 0). */
export interface Macros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

/**
 * Coerce to a finite number, `null` for anything that isn't one.
 *
 * Explicit contract on the empty string: `""` is treated as "not entered"
 * (`null`), not as `0`. `Number("")` is `0`, which would silently count an
 * empty form field as a real measurement. Canon for five byte-identical
 * copies across `fizruk-domain` (`docs/90-work/audits/unification-modules.md`
 * §2.14); `packages/dualwrite-core/src/convert.ts` keeps its own `""` → `0`
 * coercion on purpose (sync payloads never carry `""` for a numeric field,
 * and that package has no dependency on `shared`).
 */
export function finiteOrNull(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function nonNegOrNull(n: number | null): number | null {
  if (n == null) return null;
  return n >= 0 ? n : null;
}

/**
 * Coerce to a non-negative finite number, `0` for anything else (`null`,
 * `NaN`, negative). Use for fields that must never be negative but should
 * not be `null`-able (e.g. counts, minutes) — for macros use
 * `normalizeMacrosNullable`, which preserves `null` for "not entered".
 */
export function clampNonNegative(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Normalize a macros value to a `NullableMacros` object.
 * Accepts any shape; invalid / negative / non-finite values become null.
 */
export function normalizeMacrosNullable(mac: unknown): NullableMacros {
  const obj =
    mac && typeof mac === "object" && !Array.isArray(mac)
      ? (mac as Partial<Record<keyof NullableMacros, unknown>>)
      : null;
  return {
    kcal: nonNegOrNull(finiteOrNull(obj?.kcal)),
    protein_g: nonNegOrNull(finiteOrNull(obj?.protein_g)),
    fat_g: nonNegOrNull(finiteOrNull(obj?.fat_g)),
    carbs_g: nonNegOrNull(finiteOrNull(obj?.carbs_g)),
  };
}

/**
 * Convert a nullable macros value to totals with 0 as the fallback for
 * null fields. Use this for arithmetic (summing meals, computing
 * averages, etc.).
 */
export function macrosToTotals(mac: unknown): Macros {
  const m = normalizeMacrosNullable(mac);
  return {
    kcal: m.kcal ?? 0,
    protein_g: m.protein_g ?? 0,
    fat_g: m.fat_g ?? 0,
    carbs_g: m.carbs_g ?? 0,
  };
}

/**
 * Return `true` if at least one macro field has a non-null numeric value.
 * Use to distinguish "user entered some data" from "completely empty".
 */
export function macrosHasAnyValue(mac: unknown): boolean {
  const m = normalizeMacrosNullable(mac);
  return (
    m.kcal != null ||
    m.protein_g != null ||
    m.fat_g != null ||
    m.carbs_g != null
  );
}

/**
 * Sum a list of nullable macros field-by-field.
 *
 * Null rule: only non-null values are added; a field where every entry is
 * `null` stays `null`. Zero is never a stand-in for unknown — a `0` in the
 * food log means "dish without calories", not "not counted", and collapsing
 * the two is exactly the bug `unknownMacrosAsNull` exists to prevent on the
 * server side.
 *
 * Canon for the photo-analysis item list: the server recomputes the top-level
 * total from `items[]` with this function, and the web card recomputes it
 * locally after a row is removed. One implementation, so the two cannot
 * disagree about a total the person reads off the screen.
 */
export function sumMacrosNullable(list: readonly unknown[]): NullableMacros {
  const keys = ["kcal", "protein_g", "fat_g", "carbs_g"] as const;
  const normalized = list.map((m) => normalizeMacrosNullable(m));
  const out = {} as NullableMacros;
  for (const key of keys) {
    const present = normalized
      .map((m) => m[key])
      .filter((v): v is number => v != null);
    out[key] = present.length ? present.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}
