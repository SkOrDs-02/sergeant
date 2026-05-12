import type { Dispatch, SetStateAction, ReactNode } from "react";
import type { Meal, NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { DailyPlanCard } from "../components/DailyPlanCard";
import type { PlanMeal } from "../components/DailyPlanMealRow";
import { RecipesCard } from "../components/RecipesCard";
import { SubTabs } from "../components/SubTabs";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type {
  NutritionDayPlan,
  NutritionRecipe,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";
import type { MenuSubTab } from "../lib/nutritionRouter";
import type { RecipeCacheEntry } from "../lib/recipeCache";
import { fmtMacro } from "../lib/nutritionFormat";

type PantryController = ReturnType<typeof useNutritionPantries>;

interface NutritionMenuPageProps {
  menuSubTab: MenuSubTab;
  setMenuSubTab: (id: MenuSubTab) => void;
  pantry: PantryController;
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy: boolean;
  err: string;
  dayPlan: NutritionDayPlan | null;
  dayPlanBusy: boolean;
  dayPlanQuery: DataStateQueryLike<NutritionDayPlan | null>;
  dayPlanLoadingSkeleton: ReactNode;
  fetchDayPlan: (mealType: string | null) => void | Promise<void>;
  addMealFromPlan: (meal: PlanMeal) => void | Promise<void>;
  weekPlan: NutritionWeekPlan | null;
  weekPlanRaw: string;
  weekPlanBusy: boolean;
  fetchWeekPlan: () => void | Promise<void>;
  firstRunHint: boolean;
  onDismissFirstRunHint: () => void;
  recommendRecipes: () => void | Promise<void>;
  recipes: NutritionRecipe[];
  recipesTried: boolean;
  recipesRaw: string;
  recipeCacheEntry: RecipeCacheEntry<unknown> | null;
  wrappedSaveMeal: (meal: Meal) => void | Promise<void>;
  selectedDate: string;
}

export function NutritionMenuPage({
  menuSubTab,
  setMenuSubTab,
  pantry,
  prefs,
  setPrefs,
  busy,
  err,
  dayPlan,
  dayPlanBusy,
  dayPlanQuery,
  dayPlanLoadingSkeleton,
  fetchDayPlan,
  addMealFromPlan,
  weekPlan,
  weekPlanRaw,
  weekPlanBusy,
  fetchWeekPlan,
  firstRunHint,
  onDismissFirstRunHint,
  recommendRecipes,
  recipes,
  recipesTried,
  recipesRaw,
  recipeCacheEntry,
  wrappedSaveMeal,
  selectedDate,
}: NutritionMenuPageProps) {
  return (
    <SectionErrorBoundary key="page-menu" title="Не вдалось показати «Меню»">
      <>
        <SubTabs
          value={menuSubTab}
          onChange={(id) => setMenuSubTab(id as MenuSubTab)}
          tabs={[
            { id: "plan", label: "План на день" },
            { id: "recipes", label: "Рецепти" },
          ]}
        />
        {menuSubTab === "plan" ? (
          <DataState query={dayPlanQuery} skeleton={dayPlanLoadingSkeleton}>
            {() => (
              <DailyPlanCard
                prefs={prefs}
                setPrefs={setPrefs}
                pantryItems={pantry.effectiveItems}
                busy={busy}
                dayPlan={dayPlan}
                dayPlanBusy={dayPlanBusy}
                fetchDayPlan={() => fetchDayPlan(null)}
                regenMeal={(mealType) => fetchDayPlan(mealType)}
                addMealToLog={addMealFromPlan}
                weekPlan={weekPlan}
                weekPlanRaw={weekPlanRaw}
                weekPlanBusy={weekPlanBusy}
                fetchWeekPlan={fetchWeekPlan}
                firstRunHint={firstRunHint}
                onDismissFirstRunHint={onDismissFirstRunHint}
              />
            )}
          </DataState>
        ) : (
          <RecipesCard
            busy={busy}
            activePantry={pantry.activePantry}
            prefs={prefs}
            setPrefs={setPrefs}
            recommendRecipes={recommendRecipes}
            recipes={recipes}
            recipesTried={recipesTried}
            recipesRaw={recipesRaw}
            err={err}
            fmtMacro={fmtMacro}
            recipeCacheEntry={recipeCacheEntry}
            addMealToLog={wrappedSaveMeal}
            selectedDate={selectedDate}
          />
        )}
      </>
    </SectionErrorBoundary>
  );
}
