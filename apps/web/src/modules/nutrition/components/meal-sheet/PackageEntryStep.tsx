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
 * Продукт зберігається в локальну базу і стає доступним у пошуку —
 * наступного разу його не треба вводити знову.
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { nutritionKeys } from "@shared/lib/api/queryKeys";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import { upsertFood } from "../../lib/foodDb/foodDb";
import type { PickedFood } from "./FoodPickerSection";
import { MAX_PORTION_GRAMS } from "./mealFormUtils";

interface PackageEntryStepProps {
  /** Обраний продукт — аркуш авто-переходить на крок «fill». */
  onCreated: (product: PickedFood, grams: string) => void;
}

const EMPTY_DRAFT = {
  name: "",
  kcal: "",
  protein_g: "",
  fat_g: "",
  carbs_g: "",
  grams: "100",
};

export function PackageEntryStep({ onCreated }: PackageEntryStepProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const field = (key: keyof typeof EMPTY_DRAFT) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErr("");
  };

  async function handleSubmit() {
    // `disabled={busy}` ловить подвійний тап, але не програмний повтор —
    // а тут ціна помилки це ДВА продукти в базі замість одного.
    if (busy) return;
    const name = draft.name.trim();
    if (!name) {
      setErr("Введи назву продукту.");
      return;
    }
    const macros = (["kcal", "protein_g", "fat_g", "carbs_g"] as const).map(
      (key) =>
        draft[key] === ""
          ? { ok: true as const, value: 0 }
          : parseDecimalInput(draft[key]),
    );
    const serving = parseDecimalInput(draft.grams);
    if (
      macros.some((macro) => !macro.ok) ||
      !serving.ok ||
      serving.value <= 0
    ) {
      setErr("Введи невідʼємні КБЖВ на 100 г і додатну вагу порції.");
      return;
    }
    // Верхня межа мусить стояти і тут: далі вага їде прямо в `pickedGrams`
    // і в `amount_g`, а клемп у картці ловить лише набране в ній самій.
    if (serving.value > MAX_PORTION_GRAMS) {
      setErr(`Забагато: максимум ${MAX_PORTION_GRAMS} г на порцію.`);
      return;
    }
    const [kcal, protein_g, fat_g, carbs_g] = macros.map((macro) =>
      macro.ok ? macro.value : 0,
    ) as [number, number, number, number];
    setBusy(true);
    const result = await upsertFood({
      name,
      per100: { kcal, protein_g, fat_g, carbs_g },
      // Вага цієї порції стає й типовою для продукту: наступного разу
      // вона підставиться в пошуку, і її знову можна буде змінити.
      defaultGrams: serving.value,
    });
    setBusy(false);
    if (!result.ok) {
      setErr(
        ("error" in result && result.error) || "Не вдалося зберегти продукт.",
      );
      return;
    }
    void queryClient.invalidateQueries({ queryKey: nutritionKeys.foodSearch });
    setDraft(EMPTY_DRAFT);
    onCreated(result.product, String(serving.value));
  }

  return (
    <div className="space-y-3">
      <p className="text-style-body text-muted">
        Візьми КБЖВ з етикетки: вони майже завжди наведені на 100 г. Скільки
        саме ти зʼїв, вкажи нижче: макроси перерахуються під цю вагу.
      </p>
      <label className="block" htmlFor="package-food-name">
        <span className="mb-1 block text-style-caption text-text">
          Назва продукту
        </span>
        <Input
          id="package-food-name"
          value={draft.name}
          onChange={(event) => field("name")(event.target.value)}
          placeholder="Равіолі з сиром"
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["kcal", "Ккал / 100 г", "350"],
            ["protein_g", "Білки / 100 г", "12"],
            ["fat_g", "Жири / 100 г", "6"],
            ["carbs_g", "Вуглеводи / 100 г", "60"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-style-caption text-text">
              {label}
            </span>
            <Input
              value={draft[key]}
              onChange={(event) => field(key)(event.target.value)}
              inputMode="decimal"
              placeholder={placeholder}
              maxLength={8}
              showCharCount={false}
            />
          </label>
        ))}
      </div>
      <label className="block" htmlFor="package-food-grams">
        <span className="mb-1 block text-style-caption text-text">
          Скільки зʼїв, г
        </span>
        <Input
          id="package-food-grams"
          value={draft.grams}
          onChange={(event) => field("grams")(event.target.value)}
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
        Продукт збережеться на цьому пристрої та буде доступний у пошуку.
      </p>
      <Button
        type="button"
        variant="primary"
        module="nutrition"
        className="w-full min-h-[44px]"
        disabled={busy}
        onClick={() => void handleSubmit()}
      >
        Далі
      </Button>
    </div>
  );
}
