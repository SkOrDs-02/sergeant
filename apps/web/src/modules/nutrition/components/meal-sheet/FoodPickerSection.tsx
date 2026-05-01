import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/cn";
import type { FoodSearchProduct } from "@shared/api";
import { FoodHitRow } from "./FoodHitRow";
import { MacroChip } from "./MacroChip";
import { macrosForGrams, type FoodProduct } from "../../lib/foodDb/foodDb";
import type { MealFormState } from "./mealFormUtils";

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
  form: MealFormState;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  foodQuery: string;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  foodHits: FoodProduct[];
  offHits: FoodSearchProduct[];
  foodBusy: boolean;
  offBusy: boolean;
  foodErr: string;
  pickedFood: PickedFood | null;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  pickedGrams: string;
  setPickedGrams: Dispatch<SetStateAction<string>>;
}

export function FoodPickerSection({
  form,
  setForm,
  foodQuery,
  setFoodQuery,
  foodHits,
  offHits,
  foodBusy,
  offBusy,
  foodErr,
  pickedFood,
  setPickedFood,
  pickedGrams,
  setPickedGrams,
}: FoodPickerSectionProps) {
  const applyPickedFood = useCallback(
    (p: PickedFood | null, gramsRaw: string | number) => {
      const g = Number(
        String(gramsRaw || "")
          .trim()
          .replace(",", "."),
      );
      const grams = Number.isFinite(g) && g > 0 ? g : p?.defaultGrams || 100;
      const mac = macrosForGrams(p?.per100, grams);
      setForm((s) => ({
        ...s,
        name: [p?.name, p?.brand].filter(Boolean).join(" ").trim() || s.name,
        kcal: String(Math.round(Number(mac.kcal) || 0)),
        protein_g: String(Math.round(Number(mac.protein_g) || 0)),
        fat_g: String(Math.round(Number(mac.fat_g) || 0)),
        carbs_g: String(Math.round(Number(mac.carbs_g) || 0)),
        err: "",
      }));
    },
    [setForm],
  );

  // Live-recalculation при зміні кількості грамів
  useEffect(() => {
    if (!pickedFood) return;
    applyPickedFood(pickedFood, pickedGrams);
  }, [pickedGrams, pickedFood, applyPickedFood]);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="div" size="xs">
          Продукт
        </SectionHeading>
        {(foodBusy || offBusy) && (
          <span className="text-2xs text-subtle flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border border-nutrition/40 border-t-nutrition rounded-full motion-safe:animate-spin" />
            пошук…
          </span>
        )}
      </div>

      {!pickedFood ? (
        /* Режим пошуку */
        <>
          <Input
            value={foodQuery}
            onChange={(e) => setFoodQuery(e.target.value)}
            placeholder="Курка, Activia, вівсянка, Lays…"
            aria-label="Пошук продукту"
          />
          {foodErr && <div className="text-xs text-muted">{foodErr}</div>}
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
                      // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Group-separator <li> inside a <ul> combobox listbox; SectionHeading would change semantics.
                      <li className="px-3 py-1.5 text-2xs text-subtle bg-panelHi/50 font-semibold uppercase tracking-widest">
                        🌍 Open Food Facts
                      </li>
                    )}
                    {offHits.map((p) => (
                      <FoodHitRow
                        key={p.id}
                        p={p}
                        badge="🌍"
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
        </>
      ) : (
        /* Продукт вибраний — картка з live КБЖВ */
        <div className="rounded-2xl border border-nutrition/30 bg-nutrition/5 overflow-hidden">
          {/* Назва + скинути */}
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-text truncate">
                {[pickedFood.name, pickedFood.brand]
                  .filter(Boolean)
                  .join(" · ")}
                {pickedFood.source === "off" && (
                  <span className="ml-1 text-2xs text-subtle">🌍</span>
                )}
              </div>
              <div className="text-xs text-subtle mt-0.5">
                {Math.round(pickedFood.per100?.kcal || 0)} ккал · Б{" "}
                {Math.round(pickedFood.per100?.protein_g || 0)}г · Ж{" "}
                {Math.round(pickedFood.per100?.fat_g || 0)}г · В{" "}
                {Math.round(pickedFood.per100?.carbs_g || 0)}г{" "}
                <span className="opacity-60">/ 100г</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickedFood(null);
                setPickedGrams("100");
                setFoodQuery("");
              }}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-line/50 text-muted hover:text-text hover:bg-line transition-colors text-sm"
              aria-label="Скинути продукт"
            >
              ✕
            </button>
          </div>

          {/* Порція з кроками */}
          <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-subtle font-semibold shrink-0">
              Порція
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Зменшити"
                onClick={() => {
                  const cur = Number(pickedGrams) || 100;
                  setPickedGrams(
                    String(Math.max(1, cur - (cur > 50 ? 10 : 5))),
                  );
                }}
                className="w-8 h-8 rounded-full bg-panelHi text-text font-bold text-lg hover:bg-line transition-colors flex items-center justify-center"
              >
                −
              </button>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={pickedGrams}
                  min={1}
                  onChange={(e) => setPickedGrams(e.target.value)}
                  aria-label="Грами"
                  className="input-focus-nutrition w-[76px] text-center bg-panel border border-line rounded-xl px-2 py-2 text-sm font-bold text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle pointer-events-none">
                  г
                </span>
              </div>
              <button
                type="button"
                aria-label="Збільшити"
                onClick={() => {
                  const cur = Number(pickedGrams) || 100;
                  setPickedGrams(String(cur + (cur >= 50 ? 10 : 5)));
                }}
                className="w-8 h-8 rounded-full bg-panelHi text-text font-bold text-lg hover:bg-line transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
            {/* Швидкі порції */}
            <div className="flex gap-1 flex-wrap">
              {[50, 100, 150, 200].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPickedGrams(String(g))}
                  className={cn(
                    "px-2 py-0.5 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                    Number(pickedGrams) === g
                      ? "bg-nutrition-strong text-white border-nutrition"
                      : "bg-panelHi text-subtle border-line hover:border-nutrition/40",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Live КБЖВ плашки */}
          <div className="grid grid-cols-4 border-t border-line/20 divide-x divide-line/20">
            <MacroChip
              label="Ккал"
              value={form.kcal !== "" ? Number(form.kcal) : null}
              unit="ккал"
              color="bg-nutrition/8 text-nutrition-strong dark:text-nutrition"
            />
            <MacroChip
              label="Білки"
              value={form.protein_g !== "" ? Number(form.protein_g) : null}
              color="bg-panel text-text"
            />
            <MacroChip
              label="Жири"
              value={form.fat_g !== "" ? Number(form.fat_g) : null}
              color="bg-panel text-text"
            />
            <MacroChip
              label="Вуглев."
              value={form.carbs_g !== "" ? Number(form.carbs_g) : null}
              color="bg-panel text-text"
            />
          </div>
        </div>
      )}
    </div>
  );
}
