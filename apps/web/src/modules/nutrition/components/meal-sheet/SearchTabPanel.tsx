/**
 * SearchTabPanel — вміст вкладки «Пошук» на кроці джерела.
 *
 * AI-CONTEXT: шаблони, нещодавні прийоми, комора, чек Сільпо й пошук
 * продуктів — це пʼять різних механізмів, але одна й та сама дія людини:
 * «знайти те, що вже відоме». Тому вони живуть на одній вкладці, а не
 * розкидані по кроку. Порядок — від найдешевшого руху до найдорожчого:
 * шаблон і повтор це один тап, комора й чек — вибір зі списку, пошук —
 * набір тексту.
 *
 * Порожні секції не рендеряться взагалі: у новачка ще немає ні шаблонів,
 * ні комори, і стос заглушок робив би крок довшим саме тоді, коли він і
 * так найменш зрозумілий.
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type {
  MealTemplate,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type { QuickChip } from "../../hooks/useNutritionQuickChips";
import type { MealFormState } from "./mealFormUtils";
import { FoodPickerSection } from "./FoodPickerSection";
import { FromPantryRow } from "./FromPantryRow";
import { FromReceiptRow } from "./FromReceiptRow";
import { MealTemplatesRow } from "./MealTemplatesRow";
import { QuickAddChips } from "../QuickAddChips";

interface SearchTabPanelProps {
  mealTemplates: MealTemplate[];
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
  /** Шаблон обрано — аркуш іде на «fill» із заповненою формою. */
  onTemplateSelected: () => void;
  onEditTemplate: (template: MealTemplate) => void;
  quickChips: readonly QuickChip[];
  onQuickAddMeal?: ((chip: QuickChip) => void) | undefined;
  /** Повтор зберігається одразу, тож аркуш після нього закривається. */
  onQuickAdded: () => void;
  pantryItems: PantryItem[];
  /** `false` — рядок чека Сільпо мовчить і не ходить у мережу. */
  receiptRowEnabled: boolean;
  fromPantryItem: string | null;
  setFromPantryItem: Dispatch<SetStateAction<string | null>>;
  /** Props пошуку йдуть групою — вони належать одному компоненту. */
  picker: ComponentProps<typeof FoodPickerSection>;
}

export function SearchTabPanel({
  mealTemplates,
  setForm,
  setPrefs,
  onTemplateSelected,
  onEditTemplate,
  quickChips,
  onQuickAddMeal,
  onQuickAdded,
  pantryItems,
  receiptRowEnabled,
  fromPantryItem,
  setFromPantryItem,
  picker,
}: SearchTabPanelProps) {
  return (
    <>
      {mealTemplates.length > 0 && (
        <MealTemplatesRow
          mealTemplates={mealTemplates}
          setForm={setForm}
          setPrefs={setPrefs}
          onSelected={onTemplateSelected}
          onEditTemplate={onEditTemplate}
        />
      )}

      {onQuickAddMeal && quickChips.length > 0 && (
        <section
          className="mb-4 min-w-0"
          aria-labelledby="recent-meals-heading"
        >
          <h3
            id="recent-meals-heading"
            className="mb-2 text-style-label text-text"
          >
            Нещодавні прийоми
          </h3>
          <QuickAddChips
            chips={quickChips}
            onTap={(chip) => {
              onQuickAddMeal(chip);
              onQuickAdded();
            }}
          />
        </section>
      )}

      {pantryItems.length > 0 && (
        <FromPantryRow
          pantryItems={pantryItems}
          fromPantryItem={fromPantryItem}
          setFromPantryItem={setFromPantryItem}
          setForm={setForm}
          setFoodQuery={picker.setFoodQuery}
        />
      )}

      <FromReceiptRow
        enabled={receiptRowEnabled}
        setForm={setForm}
        setFoodQuery={picker.setFoodQuery}
        setPickedGrams={picker.setPickedGrams}
      />

      <FoodPickerSection {...picker} />
    </>
  );
}
