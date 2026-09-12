/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Додавання позиції у список фото-аналізу через каталог продуктів.
 *
 * AI-CONTEXT: це не новий екран, а перевикористання `FoodPickerSection` —
 * того самого пошуку, яким людина додає продукт руками в цій же шторці
 * (ініціатива 0023, рішення №6). Власний пошук тут означав би дві різні
 * бази під одну дію.
 *
 * Позиція звідси навмисно приходить із `confidence: 1` — її не вгадувала
 * модель, людина обрала її сама. Саме це робить `estimatedKcalShare` чесним
 * без окремої роботи, коли PR-3 понесе рядки в журнал під
 * `macroSource: "productDb"`.
 */
import { useState } from "react";
import type { NutritionPhotoItem } from "@shared/api";
import { Input } from "@shared/components/ui/Input";
import { useLocale } from "@shared/i18n/useLocale";
import { cn } from "@shared/lib/ui/cn";
import { macrosForGrams } from "../../lib/foodDb/foodDb";
import { FoodPickerSection, type PickedFood } from "./FoodPickerSection";
import { useFoodSearch } from "./useFoodSearch";
import { MAX_PORTION_GRAMS } from "./mealFormUtils";

const DEFAULT_GRAMS = 100;

interface PhotoAddItemPickerProps {
  onAdd: (item: NutritionPhotoItem) => void;
  onCancel: () => void;
  busy?: boolean | undefined;
}

export function PhotoAddItemPicker({
  onAdd,
  onCancel,
  busy,
}: PhotoAddItemPickerProps) {
  const { messages } = useLocale();
  const copy = messages.nutrition.photoAddItem;
  const itemsCopy = messages.nutrition.photoItems;
  const [foodQuery, setFoodQuery] = useState("");
  const [pickedFood, setPickedFood] = useState<PickedFood | null>(null);
  const [pickedGrams, setPickedGrams] = useState("");
  const { foodHits, offHits, foodBusy, offBusy, foodErr } =
    useFoodSearch(foodQuery);

  const grams = Math.min(
    Number(pickedGrams) > 0 ? Number(pickedGrams) : DEFAULT_GRAMS,
    MAX_PORTION_GRAMS,
  );

  const add = () => {
    if (!pickedFood) return;
    const name = (pickedFood.name || "").trim();
    if (!name) return;
    const macros = macrosForGrams(pickedFood.per100, grams);
    onAdd({
      name,
      macros,
      gramsApprox: grams,
      // Каталог — не здогадка моделі, тож позиція приходить упевненою і не
      // тягне за собою застереження «ШІ невпевнений».
      confidence: 1,
      // Позначка для PR-3: рядок журналу з цієї позиції отримує
      // `macroSource: "productDb"` і звʼязок із продуктом замість
      // `"photoAI"` без нього.
      foodId: pickedFood.id != null ? String(pickedFood.id) : null,
    });
  };

  return (
    <div className="rounded-xl border border-line bg-panelHi p-3">
      {pickedFood ? (
        <div className="grid gap-2">
          <div className="text-style-label text-text truncate">
            {pickedFood.name}
          </div>
          <Input
            value={pickedGrams}
            onChange={(e) => setPickedGrams(e.target.value)}
            inputMode="numeric"
            placeholder={String(DEFAULT_GRAMS)}
            aria-label={copy.gramsLabel}
          />
          <div className="text-style-caption text-muted">
            {`${Math.round(macrosForGrams(pickedFood.per100, grams).kcal)} ` +
              `${itemsCopy.kcalUnit} ${copy.forWord} ${grams} ${itemsCopy.gramsUnit}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={busy}
              className={cn(
                "touch-target text-style-label flex-1 rounded-xl px-4",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              )}
            >
              {copy.addCta}
            </button>
            <button
              type="button"
              onClick={() => {
                setPickedFood(null);
                setPickedGrams("");
              }}
              className="touch-target text-style-caption rounded-xl px-4 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              {copy.otherProductCta}
            </button>
          </div>
        </div>
      ) : (
        <>
          <FoodPickerSection
            foodQuery={foodQuery}
            setFoodQuery={setFoodQuery}
            foodHits={foodHits}
            offHits={offHits}
            foodBusy={foodBusy}
            offBusy={offBusy}
            foodErr={foodErr}
            setPickedFood={setPickedFood}
            setPickedGrams={setPickedGrams}
          />
          <button
            type="button"
            onClick={onCancel}
            className="touch-target text-style-caption rounded-xl px-3 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
          >
            {copy.cancelCta}
          </button>
        </>
      )}
    </div>
  );
}
