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
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { WheelPicker } from "@shared/components/ui/WheelPicker";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { cn } from "@shared/lib/ui/cn";
import { ProductNutrientsRow } from "./ProductNutrientsRow";
import { ProductThumb } from "./ProductThumb";
import { macrosForGrams } from "../../lib/foodDb/foodDb";
import { MAX_PORTION_GRAMS, type MealFormState } from "./mealFormUtils";
import { useWheelGrams } from "./useWheelGrams";
import type { PickedFood } from "./FoodPickerSection";

/** Ідентичність «цей продукт під цією вагою» для гарда перерахунку. */
function rescaleKey(food: PickedFood, grams: string): string {
  return `${String(food.id ?? food.name ?? "")}|${grams}`;
}

interface PickedFoodCardProps {
  // Картка у форму лише ПИШЕ (перерахунок під вагу). Читала її рівно
  // прибрана звідси плашкова стрічка КБЖВ — див. коментар у розмітці.
  setForm: Dispatch<SetStateAction<MealFormState>>;
  pickedFood: PickedFood;
  pickedGrams: string;
  setPickedGrams: Dispatch<SetStateAction<string>>;
  /** Повернутись на крок «source», щоб обрати інший продукт. */
  onChangeProduct: () => void;
  /**
   * Не перераховувати макроси на першому рендері.
   *
   * Потрібно рівно при РЕДАГУВАННІ прийому: продукт відновлюється з
   * `foodId`, і без цього прапорця ефект нижче миттю затер би збережені
   * макроси добутком `per100 × вага`. Для страви, чиї КБЖВ людина
   * правила руками (або які приїхали з фото), це була б тиха підміна
   * даних при самому лише відкритті аркуша.
   *
   * Далі картка працює як завжди: щойно людина міняє вагу чи продукт,
   * перерахунок вмикається.
   */
  skipInitialRescale?: boolean | undefined;
}

export function PickedFoodCard({
  setForm,
  pickedFood,
  pickedGrams,
  setPickedGrams,
  onChangeProduct,
  skipInitialRescale = false,
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
  // Сталий список значень колеса + число, на якому воно стоїть. Обидва —
  // у `useWheelGrams`; там же розбір, чому виведення списку з самого
  // значення змушувало колесо стрибати після кожного коміту.
  const wheel = useWheelGrams(pickedGrams);

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

  // Пара «продукт + вага», під яку макроси вже пораховані. При
  // редагуванні сідаємо нею одразу на монтуванні, тож перший прогін ефекту
  // нічого не пише — див. `skipInitialRescale`.
  const appliedKeyRef = useRef<string | null>(
    skipInitialRescale ? rescaleKey(pickedFood, pickedGrams) : null,
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
    const key = rescaleKey(pickedFood, pickedGrams);
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    applyPickedFood(pickedFood, pickedGrams);
  }, [pickedGrams, pickedFood, applyPickedFood]);

  return (
    <div className="mb-4 rounded-2xl border border-nutrition/30 bg-nutrition/5 overflow-hidden">
      {/* Назва + зміна продукту */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <ProductThumb
          name={pickedFood.name ?? ""}
          imageUrl={pickedFood.imageUrl}
        />
        <div className="min-w-0 flex-1">
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
          <Icon name="close" size="md" aria-hidden />
        </button>
      </div>

      {/* Нутрієнти понад КБЖВ — лише перегляд, лише коли джерело їх дало */}
      {pickedFood.nutrients && (
        <ProductNutrientsRow nutrients={pickedFood.nutrients} />
      )}

      {/* Порція з кроками */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
        <div className="text-style-caption text-subtle font-semibold shrink-0">
          Скільки зʼїв
        </div>
        {coarsePointer ? (
          <WheelPicker
            values={wheel.values}
            value={wheel.value}
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

      {/*
        Рядка «Live КБЖВ плашки» тут БІЛЬШЕ НЕМАЄ — не забули, прибрали
        свідомо (звіт власника 2026-09-15: «дубль значень КБЖВ при
        підстановці»).

        AI-CONTEXT. Чотири плашки читали `form.kcal/protein_g/fat_g/carbs_g`,
        а `MacrosEditor` рендерить чотири ПОЛЯ з тим самим `form` рівно під
        карткою — тобто ті самі чотири числа стояли одне під одним двічі, і
        мінялись синхронно. Дубль не був задуманий: картка жила на кроці
        «source», всередині `FoodPickerSection`, і плашки були там єдиним
        показом перерахунку. 2026-08-22 картку перенесли на крок «fill»
        (див. AI-CONTEXT у шапці файлу), де вже стояв редактор, — плашки
        приїхали разом і з того дня дублювали його.

        Лишились поля, а не плашки: поля показують ті самі числа, живо
        оновлюються тим самим ефектом перерахунку і при цьому їх можна
        правити. Плашка правитись не вміла, тож із двох поверхонь вона
        була строго біднішою.
      */}
    </div>
  );
}
