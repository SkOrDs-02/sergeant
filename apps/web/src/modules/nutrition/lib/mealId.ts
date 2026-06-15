/**
 * Last validated: 2026-06-15
 * Status: Active
 * Centralized meal-id generator. Replaces inline
 * `meal_${Date.now()}_${Math.random().toString(36).slice(2, N)}` sites
 * which drifted between 5- and 6-char random tails (audit F8 —
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 *
 * Format: `meal_<unix-ms>_<8-hex>`. 8 hex chars from `crypto.randomUUID()`
 * give 16^8 = 4.3B random tails — ~70x lower collision rate than the old
 * 5-char base36 tail (36^5 = 60M), uniform across all call sites.
 */
import { generatePrefixedId } from "@sergeant/shared";

export function newMealId(): string {
  return generatePrefixedId("meal");
}
