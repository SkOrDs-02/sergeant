/**
 * `useNutritionRemoteActions` (mobile) — AI-генерація рецептів через
 * `apiClient.nutrition.recommendRecipes`.
 *
 * Mobile-порт `recipesMutation` з
 * `apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts`.
 * Контракт payload-у та success-обробки дзеркалить web 1:1:
 *  - payload: `{ pantry, preferences: { goal, servings, timeMinutes, exclude, locale } }`;
 *  - success: кожен рецепт тегається `stableRecipeId` (паритет id з web),
 *    список + raw пишуться у session-кеш (`writeRecipeCache`).
 *
 * На відміну від web, який тримає `nutritionApi` глобально, RN отримує
 * `ApiClient` через `useApiClient()` і передає його сюди — той самий
 * патерн, що `Shopping`/`Pantry` екрани.
 */
import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

import type { ApiClient, NutritionRecipe } from "@sergeant/api-client";
import { apiMutationKeys } from "@sergeant/api-client/react";
import type { PantryItem } from "@sergeant/nutrition-domain";
import { hapticSuccess } from "@sergeant/shared";

import { formatNutritionRecipeError } from "../lib/nutritionRecipeError";
import { writeRecipeCache } from "../lib/recipeCache";
import { stableRecipeId } from "../lib/recipeIds";

/** UI-рецепт = response-shape + стабільний клієнтський id. */
export type RecommendedRecipe = NutritionRecipe & { id: string };

/** Підмножина `NutritionPrefs`, що читає payload-білдер. */
export interface RecommendPrefs {
  goal: string;
  servings?: number | string | null;
  timeMinutes?: number | string | null;
  exclude?: string | null;
}

export interface UseNutritionRemoteActionsParams {
  api: ApiClient;
  /** Продукти активної комори (effective items). */
  pantryItems: readonly PantryItem[];
  prefs: RecommendPrefs;
  recipeCacheKey: string;
  setRecipes: (value: RecommendedRecipe[]) => void;
  setRecipesRaw: (value: string) => void;
  setRecipesTried: (value: boolean) => void;
  setErr: (value: string) => void;
}

/** Максимум pantry-items у prompt (паритет із web `items.slice(0, 40)`). */
const PANTRY_ITEMS_LIMIT = 40;

/** Coerce можливо-рядкового pref до додатного числа з fallback (як web). */
function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface UseNutritionRemoteActionsResult {
  recommendRecipes: () => void;
  isPending: boolean;
}

export function useNutritionRemoteActions({
  api,
  pantryItems,
  prefs,
  recipeCacheKey,
  setRecipes,
  setRecipesRaw,
  setRecipesTried,
  setErr,
}: UseNutritionRemoteActionsParams): UseNutritionRemoteActionsResult {
  const recipesMutation = useMutation({
    mutationKey: apiMutationKeys.nutrition.recommendRecipes(),
    mutationFn: () => {
      const items = pantryItems;
      if (items.length === 0) {
        throw new Error("Дай хоча б 2–3 продукти для рецептів.");
      }
      return api.nutrition.recommendRecipes({
        pantry: items.slice(0, PANTRY_ITEMS_LIMIT),
        preferences: {
          goal: prefs.goal,
          servings: toNumber(prefs.servings, 1),
          timeMinutes: toNumber(prefs.timeMinutes, 25),
          exclude: String(prefs.exclude || ""),
          locale: "uk-UA",
        },
      });
    },
    onMutate: () => {
      setErr("");
      setRecipes([]);
      setRecipesRaw("");
      setRecipesTried(true);
    },
    onSuccess: (data) => {
      const list: RecommendedRecipe[] = Array.isArray(data?.recipes)
        ? data.recipes.map((r) => ({
            ...r,
            id: stableRecipeId(r),
          }))
        : [];
      const raw = typeof data?.rawText === "string" ? data.rawText : "";
      setRecipes(list);
      setRecipesRaw(raw);
      writeRecipeCache(recipeCacheKey, { recipes: list, recipesRaw: raw });
      hapticSuccess();
    },
    onError: (err) => {
      setErr(formatNutritionRecipeError(err));
    },
  });

  const recommendRecipes = useCallback(() => {
    recipesMutation.mutate();
  }, [recipesMutation]);

  return { recommendRecipes, isPending: recipesMutation.isPending };
}
