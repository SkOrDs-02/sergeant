/**
 * Last validated: 2026-08-12
 * Status: Active
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

interface SaveAsFoodProps {
  setPickedFood: (product: PickedFood | null) => void;
  setPickedGrams: (grams: string) => void;
  setFoodQuery: (query: string) => void;
  setFoodErr: (error: string) => void;
}

const EMPTY_DRAFT = {
  name: "",
  kcal: "",
  protein_g: "",
  fat_g: "",
  carbs_g: "",
  defaultGrams: "100",
};

export function SaveAsFood({
  setPickedFood,
  setPickedGrams,
  setFoodQuery,
  setFoodErr,
}: SaveAsFoodProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const field = (key: keyof typeof EMPTY_DRAFT) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFoodErr("");
  };

  return (
    <details className="mt-3 rounded-2xl border border-line bg-panelHi p-3">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-style-label text-nutrition-strong dark:text-nutrition">
        Створити власний продукт
      </summary>
      <div className="space-y-3 pt-2">
        <p className="text-style-caption text-muted">
          Вкажи значення з етикетки на 100 г. Продукт збережеться на цьому
          пристрої та буде доступний у пошуку.
        </p>
        <label className="block" htmlFor="own-food-name">
          <span className="mb-1 block text-style-caption text-text">Назва</span>
          <Input
            id="own-food-name"
            value={draft.name}
            onChange={(event) => field("name")(event.target.value)}
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["kcal", "Ккал / 100 г"],
              ["protein_g", "Білки / 100 г"],
              ["fat_g", "Жири / 100 г"],
              ["carbs_g", "Вуглеводи / 100 г"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-style-caption text-text">
                {label}
              </span>
              <Input
                value={draft[key]}
                onChange={(event) => field(key)(event.target.value)}
                inputMode="decimal"
                maxLength={8}
                showCharCount={false}
              />
            </label>
          ))}
        </div>
        <label className="block" htmlFor="own-food-default-grams">
          <span className="mb-1 block text-style-caption text-text">
            Типова порція, г
          </span>
          <Input
            id="own-food-default-grams"
            value={draft.defaultGrams}
            onChange={(event) => field("defaultGrams")(event.target.value)}
            inputMode="decimal"
            maxLength={8}
            showCharCount={false}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={async () => {
            const name = draft.name.trim();
            if (!name) {
              setFoodErr("Введи назву продукту.");
              return;
            }
            const macros = (
              ["kcal", "protein_g", "fat_g", "carbs_g"] as const
            ).map((key) =>
              draft[key] === ""
                ? { ok: true as const, value: 0 }
                : parseDecimalInput(draft[key]),
            );
            const serving = parseDecimalInput(draft.defaultGrams);
            if (
              macros.some((macro) => !macro.ok) ||
              !serving.ok ||
              serving.value <= 0
            ) {
              setFoodErr(
                "Введи невід’ємні КБЖВ на 100 г і додатну вагу порції.",
              );
              return;
            }
            const [kcal, protein_g, fat_g, carbs_g] = macros.map((macro) =>
              macro.ok ? macro.value : 0,
            ) as [number, number, number, number];
            const result = await upsertFood({
              name,
              per100: { kcal, protein_g, fat_g, carbs_g },
              defaultGrams: serving.value,
            });
            if (!result.ok) {
              setFoodErr(
                ("error" in result && result.error) ||
                  "Не вдалося зберегти продукт.",
              );
              return;
            }
            void queryClient.invalidateQueries({
              queryKey: nutritionKeys.foodSearch,
            });
            setPickedFood(result.product);
            setPickedGrams(String(serving.value));
            setFoodQuery(name);
            setFoodErr("");
            setDraft(EMPTY_DRAFT);
          }}
        >
          Створити продукт
        </Button>
      </div>
    </details>
  );
}
