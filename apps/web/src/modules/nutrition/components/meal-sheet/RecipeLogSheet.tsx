/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Крок «скільки зʼїв» для рецепта, обраного у формі прийому (OD-27 Х-3 в,
 * П-5 (Б), рішення власника 2026-11-18): тап по рецепту нічого не пише
 * одразу, а відкриває цей аркуш із порціями або грамами; запис — лише
 * кнопкою в його футері.
 *
 * Число й КБЖВ рахує той самий `buildRecipeLogEntry`, що й «Мої рецепти» в
 * Меню: КБЖВ рецепта — на ОДНУ порцію (рішення власника 2026-10-01), грами
 * доступні лише рецепту з відомою вагою готової страви.
 */
import { useState } from "react";
import type { Meal, MealTypeId } from "@sergeant/nutrition-domain";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import type { SavedRecipe } from "../../lib/recipeBook";
import {
  buildRecipeLogEntry,
  defaultServingGrams,
  parseGramsInput,
  recipeMeal,
  supportsGramsLogging,
  type RecipeLogMode,
} from "../../lib/recipeLogging";
import { newMealId } from "../../lib/mealId";
import { currentTime } from "./mealFormUtils";
import { nutritionRecipeLogMessages as COPY } from "@shared/i18n/uk.nutritionRecipeLog";
import type { NutritionFavorites } from "../../hooks/useNutritionFavorites";
import { FavoriteToggle } from "./FavoriteToggle";

interface RecipeLogSheetProps {
  /** `null` — аркуш закрито. */
  recipe: SavedRecipe | null;
  /** Тип прийому за контекстом аркуша (`quickMealType`). */
  mealType: MealTypeId;
  onClose: () => void;
  onLog: (meal: Meal) => void;
  /** Позначка «улюблене» на рецепті (OD-27 Х-3 б). */
  favorites?: NutritionFavorites | undefined;
}

/** Скільки порцій: число > 0 з комою чи крапкою, інакше `null`. */
function parsePortions(raw: string): number | null {
  const parsed = parseDecimalInput(raw);
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

export function RecipeLogSheet({
  recipe,
  mealType,
  onClose,
  onLog,
  favorites,
}: RecipeLogSheetProps) {
  const [mode, setMode] = useState<RecipeLogMode>("portions");
  const [portionsRaw, setPortionsRaw] = useState("1");
  const [gramsRaw, setGramsRaw] = useState("");
  // Кожен новий рецепт стартує з однієї порції і ваги однієї порції.
  const [forId, setForId] = useState<string | null>(null);
  if (recipe && recipe.id !== forId) {
    setForId(recipe.id);
    setMode("portions");
    setPortionsRaw("1");
    setGramsRaw(String(defaultServingGrams(recipe)));
  }

  const canGrams = recipe != null && supportsGramsLogging(recipe);
  const gramsMode = canGrams && mode === "grams";
  const portions = parsePortions(portionsRaw);
  const grams = parseGramsInput(gramsRaw);
  const valid = gramsMode ? grams != null : portions != null;
  const entry =
    recipe && valid
      ? buildRecipeLogEntry(
          recipe,
          gramsMode ? "grams" : "portions",
          portions ?? 1,
          grams,
        )
      : null;
  const kcal = entry?.macros.kcal;

  return (
    <Sheet
      open={recipe != null}
      onClose={onClose}
      title={recipe?.title || COPY.titleFallback}
      description={COPY.question}
      zIndex={130}
      footer={
        <div className="p-4">
          <Button
            type="button"
            variant="solid"
            className="h-12 w-full"
            disabled={!entry}
            onClick={() => {
              if (!recipe || !entry) return;
              onLog(
                recipeMeal(recipe.title, entry, {
                  id: newMealId(),
                  mealType,
                  time: currentTime(),
                }),
              );
            }}
          >
            {COPY.submit}
          </Button>
        </div>
      }
    >
      {recipe && (
        <div className="space-y-4">
          {favorites && (
            <div className="-mb-2 flex justify-end">
              <FavoriteToggle
                name={recipe.title}
                favorite={favorites.recipeIds.has(recipe.id)}
                onToggle={() => favorites.toggleRecipe(recipe.id)}
              />
            </div>
          )}
          {canGrams && (
            <ChoiceGroup
              size="sm"
              ariaLabel={COPY.modeAria.replace("{title}", recipe.title)}
              value={gramsMode ? "grams" : "portions"}
              onChange={(m) => setMode(m)}
              items={[
                { value: "portions", label: COPY.modePortions },
                { value: "grams", label: COPY.modeGrams },
              ]}
            />
          )}
          {gramsMode ? (
            <Input
              value={gramsRaw}
              onChange={(e) => setGramsRaw(e.target.value)}
              inputMode="numeric"
              aria-label={COPY.gramsAria}
              error={grams == null}
              helperText={grams == null ? COPY.gramsInvalid : ""}
            />
          ) : (
            <Input
              value={portionsRaw}
              onChange={(e) => setPortionsRaw(e.target.value)}
              inputMode="decimal"
              aria-label={COPY.portionsAria}
              error={portions == null}
              helperText={portions == null ? COPY.portionsInvalid : ""}
            />
          )}
          <p className="text-style-caption text-muted">
            {kcal != null
              ? COPY.total.replace("{kcal}", String(Math.round(kcal)))
              : COPY.totalUnknown}
            {recipe.macros?.kcal != null &&
              COPY.perServingSuffix.replace(
                "{kcal}",
                String(Math.round(recipe.macros.kcal)),
              )}
          </p>
        </div>
      )}
    </Sheet>
  );
}
