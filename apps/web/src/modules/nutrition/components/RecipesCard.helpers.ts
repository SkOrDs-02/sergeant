/**
 * Last validated: 2026-06-02
 * Status: Active
 *
 * Shared types, pure helpers, and the ChevronIcon atom used by the
 * RecipesCard family of components.
 *
 * Extracted in page-audit-08 F7 split (see
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 */
import type { MealTypeId } from "@sergeant/nutrition-domain";
import type { NullableMacros } from "@sergeant/shared";

// ── Shared types ─────────────────────────────────────────────────────

export interface RecipeLike {
  id?: string;
  title?: string;
  timeMinutes?: number | null;
  servings?: number | null;
  ingredients?: string[];
  steps?: string[];
  tips?: string[];
  macros?: NullableMacros | null;
  [key: string]: unknown;
}

// ── Pure helpers ─────────────────────────────────────────────────────

export function guessMealTypeIdNow(): MealTypeId {
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- intentional: guesses meal-type from local wall-clock, not Kyiv day-boundary; cosmetic, not day-boundary logic
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 22) return "dinner";
  return "snack";
}
