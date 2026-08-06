/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useCallback, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { WheelPicker } from "@shared/components/ui/WheelPicker";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";
import { cn } from "@shared/lib/ui/cn";
import type { FoodSearchProduct } from "@shared/api";
import { FoodHitRow } from "./FoodHitRow";
import { MacroChip } from "./MacroChip";
import { macrosForGrams, type FoodProduct } from "../../lib/foodDb/foodDb";
import type { MealFormState } from "./mealFormUtils";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

/** 10 кг однієї порції — межа проти зайвого нуля, не дієтологія. */
const MAX_PORTION_GRAMS = 10_000;

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
  // R2-UI-18 · On touch devices the numeric grams field pops the OS numpad
  // over half the sheet; a scroll-snap wheel keeps the value inline. Desktop
  // keeps the precise +/− stepper + numeric field (arbitrary grams).
  const coarsePointer = useCoarsePointer();
  const gramValues = useMemo(() => {
    const base: number[] = [];
    for (let g = 5; g <= 1000; g += 5) base.push(g);
    // Keep an adopted free-form value (e.g. 33 g from a barcode) exactly
    // representable so the wheel highlights it without silently snapping.
    const cur = Math.round(Number(pickedGrams));
    if (cur > 0 && !base.includes(cur)) {
      base.push(cur);
      base.sort((a, b) => a - b);
    }
    return base;
  }, [pickedGrams]);

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

      {!pickedFood ? (
        /* Режим пошуку */
        <>
          <Input
            value={foodQuery}
            onChange={(e) => setFoodQuery(e.target.value)}
            placeholder="Курка, Activia, вівсянка, Lays…"
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
            aria-label="Пошук продукту"
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
        </>
      ) : (
        /* Продукт вибраний — картка з live КБЖВ */
        <div className="rounded-2xl border border-nutrition/30 bg-nutrition/5 overflow-hidden">
          {/* Назва + скинути */}
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="min-w-0">
              <div className="text-style-label text-text truncate">
                {[pickedFood.name, pickedFood.brand]
                  .filter(Boolean)
                  .join(" · ")}
                {pickedFood.source === "off" && (
                  <Icon
                    name="link"
                    size="xs"
                    className="ml-1 inline-block align-baseline text-subtle"
                    title="Open Food Facts"
                  />
                )}
              </div>
              <div className="text-style-caption text-subtle mt-0.5">
                <Measure
                  value={Math.round(pickedFood.per100?.kcal || 0)}
                  unit="ккал"
                />{" "}
                · Б{" "}
                <Measure
                  value={Math.round(pickedFood.per100?.protein_g || 0)}
                  unit="г"
                />{" "}
                · Ж{" "}
                <Measure
                  value={Math.round(pickedFood.per100?.fat_g || 0)}
                  unit="г"
                />{" "}
                · В{" "}
                <Measure
                  value={Math.round(pickedFood.per100?.carbs_g || 0)}
                  unit="г"
                />{" "}
                <span className="opacity-60">/ 100 г</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickedFood(null);
                setPickedGrams("100");
                setFoodQuery("");
              }}
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-line/50 text-muted hover:text-text hover:bg-line transition-colors"
              aria-label="Скинути продукт"
            >
              <Icon name="close" size={16} aria-hidden />
            </button>
          </div>

          {/* Порція з кроками */}
          <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
            <div className="text-style-caption text-subtle font-semibold shrink-0">
              Порція
            </div>
            {coarsePointer ? (
              <WheelPicker
                values={gramValues}
                value={Math.round(Number(pickedGrams)) || 100}
                onChange={(g) => setPickedGrams(String(g))}
                aria-label="Грами"
                formatValue={(g) => `${g} г`}
                className="w-[92px]"
              />
            ) : (
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
                  className="text-style-title w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-full bg-panelHi text-text hover:bg-line transition-colors flex items-center justify-center"
                >
                  −
                </button>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={pickedGrams}
                    min={1}
                    max={MAX_PORTION_GRAMS}
                    onChange={(e) =>
                      setPickedGrams(
                        e.target.value === ""
                          ? ""
                          : String(
                              clampNumericInput(
                                e.target.value,
                                MAX_PORTION_GRAMS,
                              ),
                            ),
                      )
                    }
                    aria-label="Грами"
                    className="input-focus-nutrition w-[76px] text-center bg-panel border border-line rounded-xl px-2 py-2 text-style-label text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  {/* AI-NOTE: «г» лишається сирим `text-xs`, і це не
                      недогляд проходу типографіки. Це одиниця, приліплена
                      до числа, а не текст: її кегль має відноситись до
                      кегля числа в полі, а не до текстової ролі. Рівно так
                      само влаштований символ валюти в `Money` — 0.72em від
                      суми, а не окрема роль. */}
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
                  className="text-style-title w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-full bg-panelHi text-text hover:bg-line transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            )}
            {/* Швидкі порції */}
            <div className="flex gap-1 flex-wrap">
              {[50, 100, 150, 200].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPickedGrams(String(g))}
                  className={cn(
                    "px-2 py-0.5 rounded-xl text-style-caption border transition-[background-color,border-color,color,opacity]",
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
