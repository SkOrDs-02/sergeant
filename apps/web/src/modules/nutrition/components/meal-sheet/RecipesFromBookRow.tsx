/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Мої рецепти» як джерело у формі прийому (OD-27 Х-3 в). Лише збережені
 * рецепти (дефолт § 11.8 розбору 2026-11-17): згенеровані живуть у Меню і
 * в книгу ще не потрапили. Тап по рядку нічого не пише — відкриває крок
 * «скільки зʼїв» (`RecipeLogSheet`, П-5 Б).
 *
 * Блок допоміжний, тож згорнутий за замовчуванням, як шаблони
 * (`addMealSections.ts`). Перелік обрізано тим самим числом, що й «Мої
 * рецепти» в Меню (`RecipesCard.SavedSection`: перші 8).
 */
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import type { SavedRecipe } from "../../lib/recipeBook";
import { nutritionRecipeLogMessages as COPY } from "@shared/i18n/uk.nutritionRecipeLog";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";

const SHOWN_RECIPES = 8;

export function RecipesFromBookRow({
  recipes,
  onPick,
}: {
  recipes: readonly SavedRecipe[];
  onPick: (recipe: SavedRecipe) => void;
}) {
  if (recipes.length === 0) return null;
  return (
    <CollapsibleSection
      storageKey={ADD_MEAL_SECTION_KEYS.recipes}
      title={COPY.section}
      headingSize="md"
      defaultOpen={false}
      collapsedSubtitle={COPY.sectionCount.replace(
        "{n}",
        String(recipes.length),
      )}
      className="mb-4 min-w-0"
    >
      <div className="divide-y divide-line border-y border-line">
        {recipes.slice(0, SHOWN_RECIPES).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            className="flex min-h-[44px] w-full min-w-0 items-baseline justify-between gap-2 rounded-lg text-left focus-ring"
          >
            <span className="min-w-0 truncate text-style-body font-semibold text-text">
              {r.title}
            </span>
            {r.macros?.kcal != null && (
              <span className="shrink-0 text-style-caption text-muted tabular-nums">
                {COPY.perServing.replace(
                  "{kcal}",
                  String(Math.round(r.macros.kcal)),
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
