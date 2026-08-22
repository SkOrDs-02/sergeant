/**
 * FoodPickerSection — пошук продукту на кроці «source».
 *
 * AI-CONTEXT: секція лише шукає й віддає обраний продукт наверх. Картка
 * зв'язаного продукту (вага порції + живий перерахунок КБЖВ) переїхала
 * у `PickedFoodCard` на крок «fill»: `AddMealSheet` авто-переходить на
 * «fill» у тому ж рендері, у якому з'являється `pickedFood`, тож на
 * цьому кроці така картка недосяжна за побудовою.
 *
 * Last validated: 2026-08-22
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import type { FoodSearchProduct } from "@shared/api";
import { FoodHitRow } from "./FoodHitRow";
import type { FoodProduct } from "../../lib/foodDb/foodDb";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

export interface PickedFood {
  id?: string | number;
  name?: string;
  brand?: string;
  defaultGrams?: number;
  per100?: {
    kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  };
  source?: string;
}

interface FoodPickerSectionProps {
  foodQuery: string;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  foodHits: FoodProduct[];
  offHits: FoodSearchProduct[];
  foodBusy: boolean;
  offBusy: boolean;
  foodErr: string;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  setPickedGrams: Dispatch<SetStateAction<string>>;
}

export function FoodPickerSection({
  foodQuery,
  setFoodQuery,
  foodHits,
  offHits,
  foodBusy,
  offBusy,
  foodErr,
  setPickedFood,
  setPickedGrams,
}: FoodPickerSectionProps) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="div" size="xs" variant="nutrition">
          Продукт
        </SectionHeading>
        {(foodBusy || offBusy) && (
          <span className="text-style-caption text-subtle flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border border-nutrition/40 border-t-nutrition rounded-full motion-safe:animate-spin" />
            пошук…
          </span>
        )}
      </div>

      <Input
        value={foodQuery}
        onChange={(e) => setFoodQuery(e.target.value)}
        placeholder="Курка, Activia, вівсянка, Lays…"
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        aria-label="Пошук продукту"
        // Не `type="search"` (поле має власний UX без нативного
        // хрестика), тож guard з `Input` не спрацьовує — спред потрібен
        // явно. Причина — у `searchFieldProps.ts`.
        {...searchFieldProps("food-search")}
      />
      {foodErr && (
        <div className="text-style-caption text-muted">{foodErr}</div>
      )}
      {(foodHits.length > 0 || offHits.length > 0) && (
        <div className="max-h-56 overflow-y-auto rounded-2xl border border-line bg-bg shadow-sm">
          <ul className="divide-y divide-line/20">
            {foodHits.map((p) => (
              <FoodHitRow
                key={p.id}
                p={p}
                onPick={() => {
                  setPickedFood(p);
                  setPickedGrams(String(Math.round(p.defaultGrams || 100)));
                  setFoodQuery("");
                }}
              />
            ))}
            {offHits.length > 0 && (
              <>
                {foodHits.length > 0 && (
                  <li className="px-3 py-1.5 text-style-caption text-subtle bg-panelHi/50 font-semibold">
                    Open Food Facts
                  </li>
                )}
                {offHits.map((p) => (
                  <FoodHitRow
                    key={p.id}
                    p={p}
                    externalSource
                    onPick={() => {
                      setPickedFood(p as PickedFood);
                      const grams = Number(p.defaultGrams) || 100;
                      setPickedGrams(String(Math.round(grams)));
                      setFoodQuery("");
                    }}
                  />
                ))}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
