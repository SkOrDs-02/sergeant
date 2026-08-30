/**
 * PickedFoodCard — картка звʼязаного продукту на кроці «fill»: КБЖВ з
 * етикетки на 100 г, вага зʼїденої порції і живий перерахунок макросів
 * під цю вагу.
 *
 * AI-CONTEXT: картка навмисно живе на кроці «fill», а не на «source».
 * Раніше вона рендерилась усередині `FoodPickerSection`, тобто лише на
 * кроці «source» — а `AddMealSheet` перемикає крок на «fill» у тому ж
 * рендері, у якому зʼявляється `pickedFood` (авто-перехід). Через це
 * поле ваги розмонтовувалось рівно тоді, коли мало б зʼявитись: продукт
 * із пошуку завжди зберігався з типовою порцією, і змінити її було
 * неможливо. Юніт-тести цього не бачили, бо передавали `pickedFood`
 * пропом напряму. Не повертай цей блок на крок «source».
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import { useCallback, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { WheelPicker } from "@shared/components/ui/WheelPicker";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { cn } from "@shared/lib/ui/cn";
import { MacroChip } from "./MacroChip";
import { macrosForGrams } from "../../lib/foodDb/foodDb";
import { MAX_PORTION_GRAMS, type MealFormState } from "./mealFormUtils";
import type { PickedFood } from "./FoodPickerSection";

interface PickedFoodCardProps {
  form: MealFormState;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  pickedFood: PickedFood;
  pickedGrams: string;
  setPickedGrams: Dispatch<SetStateAction<string>>;
  /** Повернутись на крок «source», щоб обрати інший продукт. */
  onChangeProduct: () => void;
}

export function PickedFoodCard({
  form,
  setForm,
  pickedFood,
  pickedGrams,
  setPickedGrams,
  onChangeProduct,
}: PickedFoodCardProps) {
  // R2-UI-18 · On touch devices the numeric grams field pops the OS numpad
  // over half the sheet; a scroll-snap wheel keeps the value inline. Desktop
  // keeps the precise +/− stepper + numeric field (arbitrary grams).
  const coarsePointer = useCoarsePointer();
  // Кома в грамах: «150,5» під `type="number"` доїжджало сюди порожнім
  // рядком, і поле стрибало на 0 прямо під час набору. Стан лишається
  // канонічним рядком із крапкою — усі `Number(pickedGrams)` нижче цілі.
  const gramsDraft = useDecimalDraft(pickedGrams, MAX_PORTION_GRAMS, (value) =>
    setPickedGrams(value == null ? "" : String(value)),
  );
  const gramValues = useMemo(() => {
    const base: number[] = [];
    for (let g = 5; g <= 1000; g += 5) base.push(g);
    // Вище 1000 г крок навмисно грубішає. На coarse pointer колесо
    // ПІДМІНЯЄ текстове поле, тож із кроком 5 до самої стелі вага
    // 1005–9995 г була недосяжна взагалі; а рівний крок 5 до 10 кг дав
    // би ~2000 позицій. Реальні порції живуть нижче 1 кг, тому дрібний
    // крок лишається там, а хвіст існує, щоб межа була досяжна.
    for (let g = 1050; g <= MAX_PORTION_GRAMS; g += 50) base.push(g);
    // Keep an adopted free-form value (e.g. 33 g from a barcode) exactly
    // representable so the wheel highlights it without silently snapping.
    // БЕЗ `Math.round`: крок «з упаковки» приймає дробові грами, і 12.5
    // округлювалось у колесі до 13, поки макроси рахувались із 12.5 —
    // тобто екран показував не ту вагу, за якою рахував.
    const cur = Number(pickedGrams);
    if (Number.isFinite(cur) && cur > 0 && !base.includes(cur)) {
      base.push(cur);
      base.sort((a, b) => a - b);
    }
    return base;
  }, [pickedGrams]);

  const applyPickedFood = useCallback(
    (p: PickedFood, gramsRaw: string | number) => {
      const g = Number(
        String(gramsRaw || "")
          .trim()
          .replace(",", "."),
      );
      const grams = Number.isFinite(g) && g > 0 ? g : p.defaultGrams || 100;
      const mac = macrosForGrams(p.per100, grams);
      setForm((s) => ({
        ...s,
        // Назва продукту сіється ЛИШЕ в порожнє поле. Ефект перезапускає
        // цей апдейтер на кожну зміну ваги, тож зворотний порядок
        // (`продукт || s.name`) затирав уже перейменовану людиною страву
        // щоразу, коли вона крутила порцію.
        name: s.name || [p.name, p.brand].filter(Boolean).join(" ").trim(),
        kcal: String(Math.round(Number(mac.kcal) || 0)),
        protein_g: String(Math.round(Number(mac.protein_g) || 0)),
        fat_g: String(Math.round(Number(mac.fat_g) || 0)),
        carbs_g: String(Math.round(Number(mac.carbs_g) || 0)),
        err: "",
      }));
    },
    [setForm],
  );

  // Live-перерахунок при зміні кількості грамів.
  useEffect(() => {
    // Перераховуємо ЛИШЕ під додатну вагу. Порожнє поле — це «людина
    // стирає, щоб набрати інше», а «0» набирається так само легко; в
    // обох випадках `applyPickedFood` відкотився б на `defaultGrams`, і
    // плашки внизу показували б КБЖВ на 100 г, поки в полі стоїть 0.
    // Останні пораховані значення чесніші за таку підстановку.
    const grams = Number(String(pickedGrams).trim().replace(",", "."));
    if (!Number.isFinite(grams) || grams <= 0) return;
    applyPickedFood(pickedFood, pickedGrams);
  }, [pickedGrams, pickedFood, applyPickedFood]);

  return (
    <div className="mb-4 rounded-2xl border border-nutrition/30 bg-nutrition/5 overflow-hidden">
      {/* Назва + зміна продукту */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-style-label text-text truncate">
            {[pickedFood.name, pickedFood.brand].filter(Boolean).join(" · ")}
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
          onClick={onChangeProduct}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-line/50 text-muted hover:text-text hover:bg-line transition-colors"
          aria-label="Обрати інший продукт"
        >
          <Icon name="close" size={16} aria-hidden />
        </button>
      </div>

      {/* Порція з кроками */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
        <div className="text-style-caption text-subtle font-semibold shrink-0">
          Скільки зʼїв
        </div>
        {coarsePointer ? (
          <WheelPicker
            values={gramValues}
            value={Number(pickedGrams) || 100}
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
                setPickedGrams(String(Math.max(1, cur - (cur > 50 ? 10 : 5))));
              }}
              className="text-style-title w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-full bg-panelHi text-text hover:bg-line transition-colors flex items-center justify-center"
            >
              −
            </button>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={gramsDraft.value}
                onChange={gramsDraft.onChange}
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
                // Та сама стеля, що й для набраного вручну: інакше
                // `MAX_PORTION_GRAMS` тримає лише один із двох шляхів
                // вводу, і межа проти зайвого нуля обходиться кнопкою.
                setPickedGrams(
                  String(
                    Math.min(MAX_PORTION_GRAMS, cur + (cur >= 50 ? 10 : 5)),
                  ),
                );
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
                // На coarse pointer степер підмінює `WheelPicker`, а ці
                // чіпи лишаються — тобто стають найдрібнішим тапабельним
                // контролом картки. 44×44 тут не опційні.
                "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] inline-flex items-center justify-center",
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
  );
}
