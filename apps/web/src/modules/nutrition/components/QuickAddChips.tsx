/**
 * Phase 6.6 — pantry-aware quick-add chips for the add-meal source step.
 *
 * Pure presentational component. Receives chip data from
 * `useNutritionQuickChips` and surfaces them as a wrapping row of full names
 * (v3.1, inventory A4: a clipped «Йогурт грец…» hid what gets logged). One
 * tap = log a meal with the chip's
 * pre-derived macros via `onTap`; the parent owns the storage write so this
 * stays free of side-effects.
 *
 * @last-validated 2026-05-21
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
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
  group: "Нещодавні прийоми їжі",
  chip: (label: string, grams: number) => `Додати ${label} ${grams} грамів`,
};

export function QuickAddChips({ chips, onTap }: QuickAddChipsProps) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  return (
    <div
      // AI-DANGER: `contain:inline-size` лишається і після переходу з
      // горизонтального скролу на перенос (v3.1, А4). Хост - grid-item
      // (`Card` у `grid gap-3` у `NutritionDashboard`) з `min-width:auto`:
      // коли рядок був `overflow-x-auto` із `nowrap`-чіпами, його min-content
      // (сума чіпів) ставав базою треку й розпирав колонку до 996px на 390px.
      // Перенос це прибирає, але одна довга назва без пробілів усе ще дала б
      // той самий ефект; containment робить ширину рядка незалежною від вмісту.
      className="flex flex-wrap gap-2 min-w-0 [contain:inline-size]"
      role="group"
      aria-label={LABELS.group}
    >
      {chips.map((chip) => (
        // Той самий `Button`, що й решта контролів модуля: outline з hairline
        // Їжі. Це дія, не фільтр, тож обраного стану немає; 44px на coarse
        // pointer дає сам Button.
        <Button
          key={chip.id}
          size="xs"
          variant="outline"
          onClick={() => onTap(chip)}
          aria-label={LABELS.chip(chip.label, chip.grams)}
          className="h-auto min-h-8 max-w-full py-1.5 text-left"
        >
          <span className="min-w-0">{chip.label}</span>
          <span className="text-style-caption text-muted whitespace-nowrap">
            · {chip.macros.kcal} {messages.nutrition.kcalUnit}
          </span>
        </Button>
      ))}
    </div>
  );
}
