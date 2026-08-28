/**
 * FoodPickerSection — пошук продукту на кроці «source».
 *
 * AI-CONTEXT: секція лише шукає й віддає обраний продукт наверх. Картка
 * звʼязаного продукту (вага порції + живий перерахунок КБЖВ) переїхала
 * у `PickedFoodCard` на крок «fill»: `AddMealSheet` авто-переходить на
 * «fill» у тому ж рендері, у якому зʼявляється `pickedFood`, тож на
 * цьому кроці така картка недосяжна за побудовою.
 *
 * Last validated: 2026-08-22
 * Status: Active
 */
import { Fragment, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import type { FoodSearchProduct } from "@shared/api";
import { FoodHitRow } from "./FoodHitRow";
import type { FoodProduct } from "../../lib/foodDb/foodDb";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

/**
 * Підписи зовнішніх джерел пошуку (`FoodSearchProduct.source`, енум
 * `off | usda | silpo` у `packages/shared/src/schemas/nutrition.ts`).
 * Раніше всі зовнішні хіти підписувались «Open Food Facts» — silpo/usda
 * хіт не має маскуватись під OFF. Невідоме джерело падає в OFF-підпис
 * (історичний дефолт для зовнішніх хітів).
 */
const EXTERNAL_SOURCE_LABELS: Record<string, string> = {
  off: "Open Food Facts",
  usda: "USDA",
  silpo: "Сільпо",
};

function externalSourceLabel(source: string | undefined): string {
  return (
    (source ? EXTERNAL_SOURCE_LABELS[source] : undefined) ?? "Open Food Facts"
  );
}

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
  // Зовнішні хіти згруповані за джерелом (сервер віддає їх упереміш):
  // кожна група несе власний заголовок-роздільник і підпис для іконки рядка.
  const offHitGroups = useMemo(() => {
    const groups: { label: string; hits: FoodSearchProduct[] }[] = [];
    for (const p of offHits) {
      const label = externalSourceLabel(p.source);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.hits.push(p);
      else groups.push({ label, hits: [p] });
    }
    return groups;
  }, [offHits]);

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
            {offHitGroups.map((group, groupIndex) => (
              <Fragment key={`${group.label}-${groupIndex}`}>
                {/* Роздільник потрібен, коли є з чим розділяти: локальні
                    хіти вище або більше ніж одне зовнішнє джерело. */}
                {(foodHits.length > 0 || offHitGroups.length > 1) && (
                  <li className="px-3 py-1.5 text-style-caption text-subtle bg-panelHi/50 font-semibold">
                    {group.label}
                  </li>
                )}
                {group.hits.map((p) => (
                  <FoodHitRow
                    key={p.id}
                    p={p}
                    externalSourceLabel={group.label}
                    onPick={() => {
                      setPickedFood(p as PickedFood);
                      const grams = Number(p.defaultGrams) || 100;
                      setPickedGrams(String(Math.round(grams)));
                      setFoodQuery("");
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
