/**
 * PackageEntryStep — ручний ввід продукту «з упаковки»: КБЖВ на 100 г з
 * етикетки плюс вага зʼїденої порції.
 *
 * AI-CONTEXT: це один із двох ручних режимів аркуша, і різниця між ними
 * — саме одиниця вводу. Тут числа читаються з етикетки й тому завжди на
 * 100 г; далі вони масштабуються під вагу порції у `PickedFoodCard`.
 * Другий режим («Готова страва») бере КБЖВ одразу за всю порцію і ваги
 * не має взагалі. Раніше цей режим існував, але як згорнутий `<details>`
 * «Створити власний продукт» під полем пошуку, тож люди з упаковкою в
 * руках його не знаходили і йшли у «Ввести вручну», де ті самі числа
 * означають зовсім інше. Не згортай його назад у disclosure.
 *
 * Продукт тут лише будується (`makeFoodProduct`, з позначкою `unsaved`),
 * а в локальну базу його пише `AddMealSheet` разом із записом. «Далі»
 * не пише нічого: запис, скасований після цього кроку, не лишає в пошуку
 * продукт, якого людина не хотіла.
 *
 * Status: Active
 * Last validated: 2026-10-08
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { makeFoodProduct } from "../../lib/foodDb/foodDb";
import { FoodFields } from "./FoodFields";
import {
  EMPTY_FOOD_DRAFT,
  validateFoodDraft,
  type FoodDraft,
} from "./foodDraft";
import type { PickedFood } from "./FoodPickerSection";

interface PackageEntryStepProps {
  /** Обраний продукт — аркуш авто-переходить на крок «fill». */
  onCreated: (product: PickedFood, grams: string) => void;
}

export function PackageEntryStep({ onCreated }: PackageEntryStepProps) {
  const [draft, setDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [grams, setGrams] = useState("100");
  const [err, setErr] = useState("");
  const [portionErrors, setPortionErrors] = useState<Record<string, string>>(
    {},
  );

  function handleSubmit() {
    const result = validateFoodDraft(draft, grams);
    if (!result.ok) {
      setErr(result.error);
      setPortionErrors(result.portionErrors);
      return;
    }
    const serving = result.serving ?? 100;
    const product = makeFoodProduct({
      name: result.name,
      per100: result.per100,
      portions: result.portions,
      // Вага цієї порції стає й типовою для продукту: наступного разу
      // вона підставиться в пошуку, і її знову можна буде змінити.
      defaultGrams: serving,
    });
    setDraft(EMPTY_FOOD_DRAFT);
    setGrams("100");
    onCreated({ ...product, unsaved: true }, String(serving));
  }

  return (
    <div className="space-y-3">
      <p className="text-style-body text-muted">
        Візьми КБЖВ з етикетки: вони майже завжди наведені на 100 г. Скільки
        саме ти зʼїв, вкажи нижче: макроси перерахуються під цю вагу.
      </p>
      <FoodFields
        idPrefix="package-food"
        draft={draft}
        portionErrors={portionErrors}
        onChange={(next) => {
          setDraft(next);
          setErr("");
          setPortionErrors({});
        }}
      />
      <label className="block" htmlFor="package-food-grams">
        <span className="mb-1 block text-style-caption text-text">
          Скільки зʼїв, г
        </span>
        <Input
          id="package-food-grams"
          value={grams}
          onChange={(event) => {
            setGrams(event.target.value);
            setErr("");
          }}
          inputMode="decimal"
          maxLength={8}
          showCharCount={false}
        />
      </label>
      {err && (
        <div className="text-style-caption text-danger-strong dark:text-danger">
          {err}
        </div>
      )}
      <p className="text-style-body text-subtle">
        Продукт збережеться на цьому пристрої разом із записом і буде доступний
        у пошуку.
      </p>
      <Button
        type="button"
        variant="solid"
        tone="nutrition"
        className="w-full min-h-[44px]"
        onClick={handleSubmit}
      >
        Далі
      </Button>
    </div>
  );
}
