/**
 * Last validated: 2026-06-15
 * Status: Active
 * Phase 6.6 — pantry-aware quick-add chips for Nutrition hero.
 *
 * Returns up to 5 chips representing meals the user habitually logs. Each chip
 * carries a full macro snapshot so the parent can call the existing meal
 * persistence path without going through `AddMealSheet`.
 *
 * Source classification:
 *   - `pantry`      → meal name normalizes to a pantry-item name (currently
 *                     stocked). These surface first because the user explicitly
 *                     stocked the item.
 *   - `recent-meal` → meal logged ≥1 time in the last 30 days with usable
 *                     macros. Frequency-derived; ranked by recency.
 *
 * Macros come from the most recent log entry for that name (no foodDb async
 * lookup — keeps the hook purely synchronous and avoids a render-time IDB
 * round-trip on the dashboard).
 *
 * Returns `[]` when no candidates exist; the parent renders nothing.
 *
 * @last-validated 2026-05-21
 */
import { useMemo } from "react";
import { type NullableMacros } from "@sergeant/shared";
import {
  normalizeFoodName,
  type NutritionLog,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import { addDaysISODate } from "../lib/nutritionStorage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

export interface QuickChipMacros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface QuickChip {
  id: string;
  label: string;
  grams: number;
  macros: QuickChipMacros;
  source: "pantry" | "recent-meal";
  lastUsedAt: string;
}

interface Aggregate {
  norm: string;
  label: string;
  count: number;
  lastUsedAt: string;
  lastMacros: NullableMacros;
  lastGrams: number;
}

function macrosUsable(m: NullableMacros | undefined): m is NullableMacros {
  if (!m) return false;
  return (
    Number.isFinite(m.kcal as number) &&
    (m.kcal as number) > 0 &&
    Number.isFinite(m.protein_g as number) &&
    Number.isFinite(m.fat_g as number) &&
    Number.isFinite(m.carbs_g as number)
  );
}

function nullableToChipMacros(m: NullableMacros): QuickChipMacros {
  return {
    kcal: Math.round(Number(m.kcal) || 0),
    protein_g: Math.round(Number(m.protein_g) || 0),
    fat_g: Math.round(Number(m.fat_g) || 0),
    carbs_g: Math.round(Number(m.carbs_g) || 0),
  };
}

function truncateLabel(name: string, maxChars = 12): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars - 1).trimEnd() + "…";
}

/**
 * Aggregate meals over the recent window keyed by normalized name.
 * Last entry wins for macros/grams; total occurrences inform ranking.
 */
function aggregateRecentMeals(
  log: NutritionLog,
  windowDays: number,
): Map<string, Aggregate> {
  const today = getKyivDayKey();
  const cutoff = addDaysISODate(today, -windowDays);
  const out = new Map<string, Aggregate>();

  for (const [date, day] of Object.entries(log || {})) {
    if (!date || date < cutoff || date > today) continue;
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const meal of meals) {
      if (!meal) continue;
      const name = String(meal.name || "").trim();
      const norm = normalizeFoodName(name);
      if (!name || !norm) continue;
      if (!macrosUsable(meal.macros)) continue;

      const existing = out.get(norm);
      const grams = Number(meal.amount_g);
      const usableGrams = Number.isFinite(grams) && grams > 0 ? grams : 100;

      if (!existing || date >= existing.lastUsedAt) {
        out.set(norm, {
          norm,
          label: existing?.label || name,
          count: (existing?.count ?? 0) + 1,
          lastUsedAt: date,
          lastMacros: meal.macros,
          lastGrams: usableGrams,
        });
      } else {
        existing.count += 1;
      }
    }
  }

  return out;
}

export function useNutritionQuickChips(
  log: NutritionLog,
  pantryItems: readonly PantryItem[] = [],
): QuickChip[] {
  return useMemo(() => {
    const agg = aggregateRecentMeals(log, 30);
    if (agg.size === 0) return [];

    const pantryNorms = new Set(
      (Array.isArray(pantryItems) ? pantryItems : [])
        .map((it) => normalizeFoodName(it?.name))
        .filter(Boolean),
    );

    const chips: QuickChip[] = [];
    for (const entry of agg.values()) {
      const isPantry = pantryNorms.has(entry.norm);
      chips.push({
        id: `quickchip:${entry.norm}`,
        label: truncateLabel(entry.label),
        grams: entry.lastGrams,
        macros: nullableToChipMacros(entry.lastMacros),
        source: isPantry ? "pantry" : "recent-meal",
        lastUsedAt: entry.lastUsedAt,
      });
    }

    // Rank: pantry-matched first (the user explicitly stocked it), then by
    // most-recent usage. Frequency breaks ties at the recency level.
    chips.sort((a, b) => {
      if (a.source !== b.source) return a.source === "pantry" ? -1 : 1;
      if (a.lastUsedAt !== b.lastUsedAt)
        return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
      const ac = agg.get(a.id.replace(/^quickchip:/, ""))?.count ?? 0;
      const bc = agg.get(b.id.replace(/^quickchip:/, ""))?.count ?? 0;
      return bc - ac;
    });

    return chips.slice(0, 5);
  }, [log, pantryItems]);
}
