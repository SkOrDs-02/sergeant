/**
 * Sergeant Design System — KeyboardAccessory (Web)
 *
 * A compact chip bar that renders inline below/above an input field
 * for quick-fill actions. On web this is not a floating keyboard bar
 * (no software keyboard on desktop), but a contextual chip row that
 * appears alongside the input to speed up data entry.
 *
 * Parity with the mobile `KeyboardAccessory` — same `QuickFillChip`
 * type and preset chip arrays so feature code can share chip sets.
 *
 * @see apps/mobile/src/components/ui/KeyboardAccessory.tsx
 * @see docs/planning/ux-enhancement-plan.md — Section 4.3 (Keyboard & Input)
 */

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface QuickFillChip {
  /** Label displayed in the chip */
  label: string;
  /** Value to insert/apply when the chip is tapped */
  value: string | number;
}

export interface KeyboardAccessoryProps {
  /** Quick-fill chips to display */
  chips: QuickFillChip[];
  /** Called when a chip is clicked */
  onChipPress: (chip: QuickFillChip) => void;
  /** Optional leading content (e.g. unit label) */
  leading?: ReactNode;
  /** Module color variant */
  variant?: "default" | "finyk" | "fizruk" | "routine" | "nutrition";
  /** Additional className for the container */
  className?: string;
}

const variantStyles: Record<string, { chip: string; chipHover: string }> = {
  default: {
    chip: "bg-brand/10 text-brand-strong",
    chipHover: "hover:bg-brand/20",
  },
  finyk: {
    chip: "bg-finyk/10 text-finyk-strong",
    chipHover: "hover:bg-finyk/20",
  },
  fizruk: {
    chip: "bg-fizruk/10 text-fizruk-strong",
    chipHover: "hover:bg-fizruk/20",
  },
  routine: {
    chip: "bg-routine/10 text-routine-strong",
    chipHover: "hover:bg-routine/20",
  },
  nutrition: {
    chip: "bg-nutrition/10 text-nutrition-strong",
    chipHover: "hover:bg-nutrition/20",
  },
};

/**
 * Inline quick-fill chip bar for web inputs.
 *
 * Usage:
 * ```tsx
 * <Input value={amount} onChange={...} />
 * <KeyboardAccessory
 *   chips={AMOUNT_CHIPS_UAH}
 *   onChipPress={(chip) => setAmount(String(chip.value))}
 *   variant="finyk"
 * />
 * ```
 */
export function KeyboardAccessory({
  chips,
  onChipPress,
  leading,
  variant = "default",
  className,
}: KeyboardAccessoryProps) {
  const style = variantStyles[variant] ?? variantStyles.default;

  return (
    <div
      className={cn("flex items-center gap-1.5 flex-wrap", className)}
      role="toolbar"
      aria-label="Швидке заповнення"
    >
      {leading && <div className="mr-1">{leading}</div>}
      {chips.map((chip) => (
        <button
          key={`${chip.label}-${chip.value}`}
          type="button"
          onClick={() => onChipPress(chip)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
            style.chip,
            style.chipHover,
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESET CHIP SETS — same as mobile for cross-platform feature code
   ═══════════════════════════════════════════════════════════════════════════ */

export const AMOUNT_CHIPS_UAH: QuickFillChip[] = [
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "2000", value: 2000 },
];

export const PORTION_CHIPS_GRAM: QuickFillChip[] = [
  { label: "50g", value: 50 },
  { label: "100g", value: 100 },
  { label: "150g", value: 150 },
  { label: "200g", value: 200 },
  { label: "250g", value: 250 },
  { label: "300g", value: 300 },
];

export const WEIGHT_CHIPS_KG: QuickFillChip[] = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
  { label: "25", value: 25 },
  { label: "30", value: 30 },
  { label: "40", value: 40 },
  { label: "50", value: 50 },
];

export const REP_CHIPS: QuickFillChip[] = [
  { label: "5", value: 5 },
  { label: "8", value: 8 },
  { label: "10", value: 10 },
  { label: "12", value: 12 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
];

export const WATER_CHIPS_ML: QuickFillChip[] = [
  { label: "+150ml", value: 150 },
  { label: "+250ml", value: 250 },
  { label: "+330ml", value: 330 },
  { label: "+500ml", value: 500 },
];
