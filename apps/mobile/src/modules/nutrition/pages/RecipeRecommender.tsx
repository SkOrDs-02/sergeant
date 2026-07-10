/**
 * Генератор AI-рецептів (mobile) — порт generator-секції
 * `apps/web/src/modules/nutrition/components/RecipesCard.tsx`.
 *
 * Дзеркалить web-флоу:
 *  - Селектор цілі (Збалансовано / Більше білка / Менше калорій),
 *    порції, хвилини, «не використовувати».
 *  - «Запропонувати рецепти» → `useNutritionRemoteActions.recommendRecipes`.
 *  - Список рецептів з «Зберегти» (→ `upsertSavedRecipe`) та
 *    «+ У журнал» (→ `useNutritionLog.addMeal`).
 *  - Session-кеш (`buildRecipeCacheKey` / `readRecipeCache`): при відкритті
 *    показуємо останній результат для поточного складу+налаштувань і
 *    підказку «натисни Запропонувати для оновлення» (паритет з web).
 *
 * Як sheet відкривається з Dashboard CTA / DailyPlan «Замінити». Prefs
 * (goal/servings/timeMinutes/exclude) пишемо у MMKV через `updatePrefs`,
 * як web `setPrefs`.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useApiClient } from "@sergeant/api-client/react";
import {
  labelForMealType,
  mealTypeByNow,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { hapticTap, toLocalISODate } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

import { useNutritionLog } from "../hooks/useNutritionLog";
import { useNutritionPantries } from "../hooks/useNutritionPantries";
import { useNutritionPrefs } from "../hooks/useNutritionPrefs";
import {
  useNutritionRemoteActions,
  type RecommendedRecipe,
} from "../hooks/useNutritionRemoteActions";
import { upsertSavedRecipe } from "../lib/recipeBookStore";
import { buildRecipeCacheKey, readRecipeCache } from "../lib/recipeCache";

const GOAL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "balanced", label: "Збалансовано" },
  { value: "high_protein", label: "Більше білка" },
  { value: "low_cal", label: "Менше калорій" },
];

function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export interface RecipeRecommenderProps {
  testID?: string;
  /** Закрити sheet (коли рендериться у модалці з Dashboard / DailyPlan). */
  onClose?: () => void;
}

export function RecipeRecommender({ testID, onClose }: RecipeRecommenderProps) {
  const api = useApiClient();
  const toast = useToast();
  const { prefs, updatePrefs } = useNutritionPrefs();
  const { activePantry, activePantryId, pantryItems } = useNutritionPantries();
  const { addMeal } = useNutritionLog();

  const recipeCacheKey = useMemo(
    () => buildRecipeCacheKey(activePantryId, pantryItems, prefs),
    [activePantryId, pantryItems, prefs],
  );

  const [recipes, setRecipes] = useState<RecommendedRecipe[]>([]);
  const [recipesRaw, setRecipesRaw] = useState("");
  const [recipesTried, setRecipesTried] = useState(false);
  const [err, setErr] = useState("");
  const [savedIds, setSavedIds] = useState<Record<string, true>>({});
  const [fromCache, setFromCache] = useState(false);

  // Hydrate з session-кеша при зміні ключа (склад/налаштування). Показуємо
  // останній результат + підказку про оновлення — паритет з web banner-ом.
  // Render-time update avoids `react-hooks/set-state-in-effect` (init 0021).
  const [prevCacheKey, setPrevCacheKey] = useState(recipeCacheKey);
  if (recipeCacheKey !== prevCacheKey) {
    setPrevCacheKey(recipeCacheKey);
    const cached = readRecipeCache<RecommendedRecipe>(recipeCacheKey);
    if (cached && cached.recipes.length > 0) {
      setRecipes(cached.recipes);
      setRecipesRaw(cached.recipesRaw);
      setRecipesTried(true);
      setFromCache(true);
    } else {
      setFromCache(false);
    }
  }

  const { recommendRecipes, isPending } = useNutritionRemoteActions({
    api,
    pantryItems,
    prefs,
    recipeCacheKey,
    setRecipes: (list) => {
      setRecipes(list);
      setFromCache(false);
    },
    setRecipesRaw,
    setRecipesTried,
    setErr,
  });

  const setGoal = useCallback(
    (goal: string) => updatePrefs({ goal } as Partial<NutritionPrefs>),
    [updatePrefs],
  );

  const onSave = useCallback(
    (r: RecommendedRecipe) => {
      upsertSavedRecipe(r);
      setSavedIds((m) => ({ ...m, [r.id]: true }));
      hapticTap();
      toast.success(`Рецепт «${r.title}» збережено.`);
    },
    [toast],
  );

  const onAddToLog = useCallback(
    (r: RecommendedRecipe) => {
      const mealType = mealTypeByNow();
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`;
      addMeal(toLocalISODate(now), {
        time,
        mealType,
        label: labelForMealType(mealType),
        name: r.title || "Рецепт",
        macros: {
          kcal: r.macros?.kcal ?? null,
          protein_g: r.macros?.protein_g ?? null,
          fat_g: r.macros?.fat_g ?? null,
          carbs_g: r.macros?.carbs_g ?? null,
        },
        source: "manual",
        macroSource: "recipeAI",
        foodId: null,
        amount_g: null,
      });
      hapticTap();
      toast.success("Додано в журнал.");
    },
    [addMeal, toast],
  );

  const hasPantry = pantryItems.length > 0;

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-cream-50"
      contentContainerClassName="p-4 gap-3 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-fg">AI-рецепти</Text>
        {onClose ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Закрити"
            testID="recipe-recommender-close"
            className="px-2 py-1"
          >
            <Text className="text-fg-subtle text-lg leading-none">×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="text-xs text-fg-muted">
        Рекомендації на базі продуктів зі складу (
        {activePantry?.name || "Склад"}
        ). Можна вказати час, порції та «не хочу».
      </Text>

      <Card className="gap-3">
        <View>
          <Text className="text-xs text-fg-muted mb-1">Ціль</Text>
          <View className="flex-row gap-2 flex-wrap">
            {GOAL_OPTIONS.map((opt) => {
              const sel = prefs.goal === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  testID={`recipe-goal-${opt.value}`}
                  onPress={() => {
                    hapticTap();
                    setGoal(opt.value);
                  }}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  className={
                    sel
                      ? "px-3 py-2 rounded-xl bg-nutrition-strong"
                      : "px-3 py-2 rounded-xl bg-cream-200"
                  }
                >
                  <Text
                    className={
                      sel
                        ? "text-white text-xs font-semibold"
                        : "text-fg text-xs font-semibold"
                    }
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <Text className="text-xs text-fg-muted mb-1">Порції</Text>
            <Input
              value={String(prefs.servings)}
              onChangeText={(raw) =>
                updatePrefs({ servings: parsePositiveInt(raw, 1) })
              }
              keyboardType="numeric"
              editable={!isPending}
              testID="recipe-servings"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-fg-muted mb-1">Хвилин</Text>
            <Input
              value={String(prefs.timeMinutes)}
              onChangeText={(raw) =>
                updatePrefs({ timeMinutes: parsePositiveInt(raw, 25) })
              }
              keyboardType="numeric"
              editable={!isPending}
              testID="recipe-time"
            />
          </View>
        </View>

        <View>
          <Text className="text-xs text-fg-muted mb-1">
            Не використовувати / алергени
          </Text>
          <Input
            value={prefs.exclude}
            onChangeText={(exclude) => updatePrefs({ exclude })}
            placeholder="напр. арахіс, гриби"
            editable={!isPending}
            testID="recipe-exclude"
          />
        </View>

        {!hasPantry ? (
          <Text className="text-xs text-fg-muted text-center">
            Спочатку додай 2–3 продукти в комору.
          </Text>
        ) : null}

        <Button
          variant="nutrition"
          onPress={() => {
            hapticTap();
            recommendRecipes();
          }}
          disabled={isPending || !hasPantry}
          testID="recipe-recommend"
        >
          {isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white">Генерую рецепти…</Text>
            </View>
          ) : (
            "Запропонувати рецепти"
          )}
        </Button>

        {fromCache && recipes.length > 0 ? (
          <Text className="text-xs text-nutrition-strong text-center">
            Показано кеш сеансу — натисни «Запропонувати» для оновлення.
          </Text>
        ) : null}

        {err ? (
          <Text className="text-xs text-danger" testID="recipe-recommend-error">
            {err}
          </Text>
        ) : null}
      </Card>

      {recipes.map((r) => {
        const isSaved = savedIds[r.id] === true;
        return (
          <Card key={r.id} className="gap-2" testID={`recipe-card-${r.id}`}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-fg"
                  numberOfLines={2}
                >
                  {r.title || "Рецепт"}
                </Text>
                <Text className="text-xs text-fg-muted mt-0.5">
                  {r.timeMinutes ? `${r.timeMinutes} хв` : "—"} ·{" "}
                  {r.servings ? `${r.servings} порц.` : "—"}
                  {r.macros?.kcal != null ? ` · ≈ ${r.macros.kcal} ккал` : ""}
                </Text>
              </View>
            </View>

            {r.ingredients.length > 0 ? (
              <View>
                <Text className="text-xs text-fg-muted mb-0.5">
                  Інгредієнти
                </Text>
                <Text className="text-sm text-fg">
                  {r.ingredients.join(", ")}
                </Text>
              </View>
            ) : null}

            {r.steps.length > 0 ? (
              <View>
                <Text className="text-xs text-fg-muted mb-0.5">Кроки</Text>
                {r.steps.slice(0, 10).map((s, i) => (
                  <Text key={i} className="text-sm text-fg mb-0.5">
                    {i + 1}. {s}
                  </Text>
                ))}
              </View>
            ) : null}

            {r.tips.length > 0 ? (
              <View>
                <Text className="text-xs text-fg-muted mb-0.5">Поради</Text>
                {r.tips.slice(0, 6).map((t, i) => (
                  <Text key={i} className="text-sm text-fg mb-0.5">
                    • {t}
                  </Text>
                ))}
              </View>
            ) : null}

            <View className="flex-row gap-2 flex-wrap mt-1">
              <View className="flex-1 min-w-[120px]">
                <Button
                  variant="secondary"
                  onPress={() => onSave(r)}
                  disabled={isPending || isSaved}
                  testID={`recipe-save-${r.id}`}
                >
                  {isSaved ? "Збережено ✓" : "Зберегти"}
                </Button>
              </View>
              <View className="flex-1 min-w-[120px]">
                <Button
                  variant="secondary"
                  onPress={() => onAddToLog(r)}
                  disabled={isPending}
                  testID={`recipe-add-log-${r.id}`}
                >
                  + У журнал
                </Button>
              </View>
            </View>
          </Card>
        );
      })}

      {recipesTried && !isPending && recipes.length === 0 && !err ? (
        <Card className="p-4">
          <Text className="text-sm text-fg-muted text-center">
            Рецептів не повернулося. Спробуй додати 2–3 базові продукти
            (яйця/крупа/овочі) або зміни налаштування.
          </Text>
          {recipesRaw ? (
            <Text
              className="text-2xs text-fg-subtle mt-2"
              testID="recipe-recommend-raw"
              numberOfLines={6}
            >
              {recipesRaw}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}
