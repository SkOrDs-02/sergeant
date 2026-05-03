import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { PantryItem } from "@sergeant/nutrition-domain";
import type { MealFormState } from "./mealFormUtils";

interface FromPantryRowProps {
  pantryItems: PantryItem[];
  fromPantryItem: string | null;
  setFromPantryItem: Dispatch<SetStateAction<string | null>>;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setFoodQuery: Dispatch<SetStateAction<string>>;
}

export function FromPantryRow({
  pantryItems,
  fromPantryItem,
  setFromPantryItem,
  setForm,
  setFoodQuery,
}: FromPantryRowProps) {
  if (!pantryItems || pantryItems.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-panel/40 px-3 py-3">
      <SectionHeading as="div" size="xs" className="mb-2">
        Зі складу
        {fromPantryItem && (
          <span className="ml-2 text-nutrition-strong dark:text-nutrition font-semibold normal-case tracking-normal">
            · {fromPantryItem}
          </span>
        )}
      </SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {pantryItems.slice(0, 20).map((item) => {
          const isActive = fromPantryItem === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                if (isActive) {
                  setFromPantryItem(null);
                  setForm((s) => ({
                    ...s,
                    name: s.name === item.name ? "" : s.name,
                  }));
                } else {
                  setFromPantryItem(item.name);
                  setForm((s) => ({ ...s, name: item.name, err: "" }));
                  setFoodQuery(item.name);
                }
              }}
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                isActive
                  ? "bg-nutrition-strong text-white border-nutrition"
                  : "bg-panelHi text-text border-line hover:border-nutrition/50",
              )}
            >
              {item.name}
              {item.qty != null && (
                <span className="ml-1 text-2xs opacity-70">
                  {item.qty}
                  {item.unit || "г"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
