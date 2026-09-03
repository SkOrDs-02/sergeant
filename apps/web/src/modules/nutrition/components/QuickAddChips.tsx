/**
 * Phase 6.6 — pantry-aware quick-add chips for the add-meal source step.
 *
 * Pure presentational component. Receives chip data from
 * `useNutritionQuickChips` and surfaces them as a horizontal scroll row. One
 * tap = log a meal with the chip's
 * pre-derived macros via `onTap`; the parent owns the storage write so this
 * stays free of side-effects.
 *
 * @last-validated 2026-05-21
 */
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
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
      // No negative-margin "bleed" — `-mx-1` used to pull this row 4px past
      // the parent card's own padding on each side (a wider edge-to-edge
      // scroll look), but the card itself doesn't clip overflow, so the row
      // genuinely widened past the card's rounded border at narrow
      // viewports (page-audit nutrition-overview-01). Plain padding keeps
      // the row inside the card's existing horizontal padding.
      //
      // AI-DANGER: `contain:inline-size` тут — не косметика, знімати не можна.
      // `overflow-x-auto` робить рядок прокручуваним, але НЕ обнуляє його
      // внесок у min-content ancestor-ів: min-content цього flex-рядка =
      // сума чіпів (усі `shrink-0` + `whitespace-nowrap`). Хост — grid-item
      // (`Card` у `grid gap-3` всередині `NutritionDashboard`) з дефолтним
      // `min-width:auto`, тож той min-content ставав базою grid-треку і
      // розпирав УСІ картки колонки далеко за viewport (заміряно в
      // Chromium 390px: 996px замість 358px — і hero-карту, і графік тижня
      // обрізало `overflow-x-hidden` сторінки). `min-w-0` на самому рядку
      // цього не лікує — вона діє на нього як на item, а не на його внесок.
      // Inline-size containment робить ширину рядка незалежною від вмісту,
      // тож хост більше не бачить сумарну ширину чіпів. Дублюючий захист —
      // `min-w-0` на hero-`Card` (працює і там, де немає `contain`).
      className="flex gap-2 overflow-x-auto pb-1 min-w-0 [contain:inline-size]"
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
          tone="neutral"
          onClick={() => onTap(chip)}
          aria-label={LABELS.chip(chip.label, chip.grams)}
          className="shrink-0 border-nutrition/40"
        >
          <Icon name="plus" size={12} aria-hidden />
          <span className="whitespace-nowrap">{chip.label}</span>
          <span className="text-style-caption text-muted whitespace-nowrap">
            · {chip.macros.kcal} {messages.nutrition.kcalUnit}
          </span>
        </Button>
      ))}
    </div>
  );
}
