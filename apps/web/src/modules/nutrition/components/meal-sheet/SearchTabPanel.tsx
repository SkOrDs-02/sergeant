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
  Meal,
  MealTemplate,
  MealTypeId,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type { SavedRecipe } from "../../lib/recipeBook";
import type { QuickChip } from "../../hooks/useNutritionQuickChips";
import type { MealFormState } from "./mealFormUtils";
import type { NutritionFavorites } from "../../hooks/useNutritionFavorites";
import { useState } from "react";
import { pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { nutritionMealFeedbackMessages as FEEDBACK } from "@shared/i18n/uk.nutritionMealFeedback";
import { Button } from "@shared/components/ui/Button";
import { MyFoodsSheet } from "../MyFoodsSheet";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";
import { FoodPickerSection } from "./FoodPickerSection";
import { FromPantryRow } from "./FromPantryRow";
import type { MealSourcePick } from "./useMealSourcePick";
import { MealTemplatesRow } from "./MealTemplatesRow";
import { QuickAddChips } from "../QuickAddChips";
import { RecipesFromBookRow } from "./RecipesFromBookRow";
import { RecipeLogSheet } from "./RecipeLogSheet";

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
  /** Автопідбір продукту за назвою позиції комори — щоб прийом ніс КБЖУ. */
  sourcePick: MealSourcePick;
  fromPantryItem: string | null;
  setFromPantryItem: Dispatch<SetStateAction<string | null>>;
  /** Props пошуку йдуть групою — вони належать одному компоненту. */
  picker: ComponentProps<typeof FoodPickerSection>;
  /** «Мої рецепти» (OD-27 Х-3 в); порожньо — блоку немає. */
  savedRecipes?: readonly SavedRecipe[] | undefined;
  /** Тип прийому, з яким рецепт ляже в журнал (`quickMealType`). */
  recipeMealType?: MealTypeId | undefined;
  /** Рецепт записано: аркуш прийому закривається. */
  onRecipeLogged?: ((meal: Meal) => void) | undefined;
  /** Улюблені (OD-27 Х-3 б): позначка рецепта в кроці «скільки зʼїв». */
  favorites?: NutritionFavorites | undefined;
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
  sourcePick,
  fromPantryItem,
  setFromPantryItem,
  picker,
  savedRecipes = [],
  recipeMealType = "snack",
  onRecipeLogged,
  favorites,
}: SearchTabPanelProps) {
  const [myFoodsOpen, setMyFoodsOpen] = useState(false);
  const [recipeToLog, setRecipeToLog] = useState<SavedRecipe | null>(null);
  return (
    <>
      <FoodPickerSection {...picker} />
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
          headingSize="md"
          // Єдина секція, відкрита за замовчуванням: повторити вчорашній
          // сніданок — найкоротший шлях у цьому аркуші, і згорнути його
          // означало б додати клік саме туди, де їх і так найменше.
          defaultOpen
          collapsedSubtitle={pluralUa(
            quickChips.length,
            FEEDBACK.recentCount,
          ).replace("{n}", String(quickChips.length))}
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

      {onRecipeLogged && (
        <RecipesFromBookRow recipes={savedRecipes} onPick={setRecipeToLog} />
      )}

      {pantryItems.length > 0 && (
        <FromPantryRow
          pantryItems={pantryItems}
          fromPantryItem={fromPantryItem}
          setFromPantryItem={setFromPantryItem}
          setForm={setForm}
          setFoodQuery={picker.setFoodQuery}
          setPickedGrams={picker.setPickedGrams}
          onPicked={sourcePick.onPantryItemPicked}
          onCleared={sourcePick.cancelAutoPick}
        />
      )}

      <Button
        variant="text"
        className="w-full min-h-[44px]"
        onClick={() => setMyFoodsOpen(true)}
      >
        {messages.nutrition.myFoods.open}
      </Button>
      <MyFoodsSheet
        open={myFoodsOpen}
        onClose={() => setMyFoodsOpen(false)}
        zIndex={130}
      />
      {onRecipeLogged && (
        <RecipeLogSheet
          recipe={recipeToLog}
          mealType={recipeMealType}
          favorites={favorites}
          onClose={() => setRecipeToLog(null)}
          onLog={(meal) => {
            setRecipeToLog(null);
            onRecipeLogged(meal);
          }}
        />
      )}
    </>
  );
}
