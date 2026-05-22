/**
 * Phase 6.6 — pantry-aware quick-add chips for Nutrition hero.
 *
 * Pure presentational component. Receives chip data from
 * `useNutritionQuickChips` and surfaces them as a horizontal scroll row above
 * the existing «+ Додати» trigger. One tap = log a meal with the chip's
 * pre-derived macros via `onTap`; the parent owns the storage write so this
 * stays free of side-effects.
 *
 * @last-validated 2026-05-21
 */
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import type { QuickChip } from "../hooks/useNutritionQuickChips";

interface QuickAddChipsProps {
  chips: readonly QuickChip[];
  onTap: (chip: QuickChip) => void;
}

export function QuickAddChips({ chips, onTap }: QuickAddChipsProps) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      role="group"
      aria-label="Швидке додавання улюблених страв"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onTap(chip)}
          aria-label={`Додати ${chip.label} — ${chip.grams} грамів`}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "min-h-touch-target text-style-label",
            "bg-nutrition/[.08] text-nutrition-strong dark:text-nutrition",
            "hover:bg-nutrition/[.15] active:scale-[0.97] transition-[background-color,transform]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/40",
          )}
        >
          <Icon name="plus" size={12} aria-hidden />
          <span className="whitespace-nowrap">{chip.label}</span>
          <span className="text-style-caption text-subtle whitespace-nowrap">
            · {chip.macros.kcal} ккал
          </span>
        </button>
      ))}
    </div>
  );
}
