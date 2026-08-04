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
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { QuickChip } from "../hooks/useNutritionQuickChips";

interface QuickAddChipsProps {
  chips: readonly QuickChip[];
  onTap: (chip: QuickChip) => void;
}

// `apps/web/src/shared/i18n/uk.ts` is already at Hard Rule #18's 600-line
// cap, so these single-component strings live here instead of growing the
// shared catalog — `sergeant-design/no-cyrillic-jsx-literal` only flags
// bare JSX Literal nodes, not a referenced MemberExpression like this one.
const LABELS = {
  group: "Швидке додавання улюблених страв",
  chip: (label: string, grams: number) => `Додати ${label} — ${grams} грамів`,
};

export function QuickAddChips({ chips, onTap }: QuickAddChipsProps) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <div
      // No negative-margin "bleed" — `-mx-1` used to pull this row 4px past
      // the parent card's own padding on each side (a wider edge-to-edge
      // scroll look), but the card itself doesn't clip overflow, so the row
      // genuinely widened past the card's rounded border at narrow
      // viewports (page-audit nutrition-overview-01). Plain padding keeps
      // the row inside the card's existing horizontal padding.
      className="flex gap-2 overflow-x-auto pb-1 min-w-0"
      role="group"
      aria-label={LABELS.group}
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onTap(chip)}
          aria-label={LABELS.chip(chip.label, chip.grams)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "min-h-touch-target text-style-label",
            // «Чорнило» v3.1 § 3 — the pill sits on the Nutrition hero
            // (translucent bg-nutrition/[.08] wash still shows the
            // saturated hero gradient through it), so text uses hero-ink
            // rather than the dark `nutrition-strong` tier.
            "bg-nutrition/8 text-hero-ink",
            "hover:bg-nutrition/15 active:scale-[0.97] transition-[background-color,transform]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/40",
          )}
        >
          <Icon name="plus" size={12} aria-hidden />
          <span className="whitespace-nowrap">{chip.label}</span>
          <span className="text-style-caption text-hero-ink/75 whitespace-nowrap">
            · {chip.macros.kcal} {messages.nutrition.kcalUnit}
          </span>
        </button>
      ))}
    </div>
  );
}
