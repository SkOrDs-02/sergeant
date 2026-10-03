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
import { mealTypeByNow, type MealTypeId } from "@sergeant/nutrition-domain";
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
  return mealTypeByNow();
}

/**
 * Множник порцій із текстового поля збереженого рецепта. Порожнє,
 * некоректне чи ≤ 0 → 1; кома як десятковий роздільник приймається.
 * Один парсер на показ («≈ N ккал» у картці) і на запис у журнал, щоб
 * число на екрані й число в журналі не могли розійтись.
 */
export function parsePortionFactor(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 1;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
