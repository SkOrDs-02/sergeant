/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { Pantry } from "@sergeant/nutrition-domain";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";

type PantryController = ReturnType<typeof useNutritionPantries>;

interface NutritionPantrySelectorProps {
  pantry: PantryController;
  busy?: boolean;
}

export function NutritionPantrySelector({
  pantry,
  busy,
}: NutritionPantrySelectorProps) {
  const pantries: Pantry[] = Array.isArray(pantry.pantries)
    ? pantry.pantries
    : [];
  return (
    <div className="rounded-2xl bg-nutrition/10 border border-nutrition/20 px-4 py-3 mb-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <SectionHeading
          as="div"
          size="xs"
          variant="nutrition"
          className="mb-0.5"
        >
          Активний склад
        </SectionHeading>
        <div className="text-base font-extrabold text-text leading-tight">
          {pantry.activePantry?.name || "Склад"}
        </div>
        <div className="text-xs text-subtle mt-0.5">
          {pantry.pantryItems.length > 0
            ? `${pantry.pantryItems.length} продуктів збережено`
            : "Склад порожній"}
        </div>
      </div>
      {pantries.length > 1 && (
        <select
          value={pantry.activePantry?.id || pantry.activePantryId || ""}
          onChange={(e) => pantry.setActivePantryId(e.target.value)}
          disabled={busy}
          className="input-focus-nutrition min-h-[44px] rounded-xl bg-panel/60 border border-nutrition/30 px-3 text-sm text-text max-w-[36vw]"
          aria-label="Обрати склад"
        >
          {pantries.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Склад"}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => pantry.setPantryManagerOpen(true)}
        disabled={busy}
        className="shrink-0 w-9 h-9 touch-target flex items-center justify-center rounded-xl text-nutrition-strong/90 dark:text-nutrition/70 hover:text-nutrition-strong dark:hover:text-nutrition hover:bg-nutrition/10 transition-colors border border-nutrition/20"
        aria-label="Керування складами"
        title="Склади"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
    </div>
  );
}
