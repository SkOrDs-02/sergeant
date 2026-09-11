/**
 * SearchTabPanel — вміст вкладки «Пошук» на кроці джерела.
 *
 * AI-CONTEXT: шаблони, нещодавні прийоми, комора й пошук продуктів — це
 * чотири різні механізми, але одна й та сама дія людини: «знайти те, що
 * вже відоме». Тому вони живуть на одній вкладці, а не розкидані по
 * кроку. Порядок — від найдешевшого руху до найдорожчого: шаблон і повтор
 * це один тап, комора — вибір зі списку, пошук — набір тексту.
 *
 * Порожні секції не рендеряться взагалі: у новачка ще немає ні шаблонів,
 * ні комори, і стос заглушок робив би крок довшим саме тоді, коли він і
 * так найменш зрозумілий.
 *
 * 2026-09-11: окремий рядок «З чека Сільпо» видалено — його єдина
 * цінність (вага фасування) переїхала на `FromPantryRow`, яка тепер
 * підставляє грами з `packGrams` найсвіжішого чекового джерела позиції
 * (`latestPackGrams`, `@sergeant/nutrition-domain`).
 *
 * Status: Active
 * Last validated: 2026-09-11
 */
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type {
  MealTemplate,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type { QuickChip } from "../../hooks/useNutritionQuickChips";
import type { MealFormState } from "./mealFormUtils";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";
import { FoodPickerSection } from "./FoodPickerSection";
import { FromPantryRow } from "./FromPantryRow";
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
        <CollapsibleSection
          storageKey={ADD_MEAL_SECTION_KEYS.recent}
          title="Нещодавні прийоми"
          // Єдина секція, відкрита за замовчуванням: повторити вчорашній
          // сніданок — найкоротший шлях у цьому аркуші, і згорнути його
          // означало б додати клік саме туди, де їх і так найменше.
          defaultOpen
          collapsedSubtitle={`${quickChips.length} прийомів`}
          className="mb-4 min-w-0"
        >
          <QuickAddChips
            chips={quickChips}
            onTap={(chip) => {
              onQuickAddMeal(chip);
              onQuickAdded();
            }}
          />
        </CollapsibleSection>
      )}

      {pantryItems.length > 0 && (
        <FromPantryRow
          pantryItems={pantryItems}
          fromPantryItem={fromPantryItem}
          setFromPantryItem={setFromPantryItem}
          setForm={setForm}
          setFoodQuery={picker.setFoodQuery}
          setPickedGrams={picker.setPickedGrams}
        />
      )}

      <FoodPickerSection {...picker} />
    </>
  );
}
