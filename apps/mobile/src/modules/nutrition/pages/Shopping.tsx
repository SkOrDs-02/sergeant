/**
 * Sergeant Nutrition — Shopping screen (RN).
 *
 * Mobile port of `apps/web/.../components/ShoppingListCard.tsx`. Уся
 * мутаційна логіка списку — `useShoppingList()` поверх
 * `@sergeant/nutrition-domain`. AI-генерація списку з рецептів іде
 * через `apiClient.nutrition.shoppingList` (той самий endpoint, що
 * на web). Weekly-plan source поки disabled — мобільний клієнт ще не
 * зберігає week-plan локально (web equivalent — Phase 7 backlog).
 */
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { isApiError } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";
import { hapticTap } from "@sergeant/shared";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

import { useNutritionPantries } from "../hooks/useNutritionPantries";
import { useSavedRecipesList } from "../hooks/useSavedRecipesList";
import { useShoppingList } from "../hooks/useShoppingList";
import {
  buildShoppingRequestBody,
  callShoppingList,
  type ShoppingSource,
} from "../lib/shoppingGenerateApi";

function formatShoppingApiError(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 402 || e.status === 429) {
      return "Перевищено AI-квоту. Спробуй пізніше.";
    }
    if (e.kind === "network") {
      return "Немає звʼязку. Перевір інтернет і спробуй ще раз.";
    }
    return e.message || `Помилка ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return "Помилка генерації списку.";
}

export function Shopping({ testID }: { testID?: string }) {
  const api = useApiClient();
  const toast = useToast();
  const {
    shoppingList,
    totalCount,
    toggle,
    clearChecked,
    clearAll,
    addItemToCategory,
    setGeneratedList,
  } = useShoppingList();
  const { recipes } = useSavedRecipesList();
  const { activePantry } = useNutritionPantries();
  const pantryItems = useMemo(
    () => (Array.isArray(activePantry?.items) ? activePantry.items : []),
    [activePantry?.items],
  );

  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<ShoppingSource>("recipes");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");

  const hasRecipes = recipes.length > 0;
  const hasWeekPlan = false; // mobile: not persisted yet
  const canGenerate =
    (source === "recipes" && hasRecipes) ||
    (source === "weekplan" && hasWeekPlan);

  const onAdd = useCallback(() => {
    addItemToCategory("Інше", draft);
    setDraft("");
  }, [addItemToCategory, draft]);

  const onGenerate = useCallback(async () => {
    if (aiBusy || !canGenerate) return;
    setAiErr("");
    setAiBusy(true);
    try {
      const body = buildShoppingRequestBody({
        source,
        recipes,
        pantryItems,
      });
      const categories = await callShoppingList(api, body);
      // `setGeneratedList` пропускає категорії через `normalizeShoppingList`
      // — він і додає `id`/`checked: false`, і дедуплікує позиції за
      // ключем імені. Рерун генерації заміщає попередній список, тож
      // повторна генерація не дублює позиції (acceptance criteria).
      setGeneratedList(categories);
      hapticTap();
      if (categories.length === 0) {
        toast.info("Все вже є в коморі — список покупок порожній.");
      } else {
        toast.success("Список покупок згенеровано.");
      }
    } catch (e) {
      setAiErr(formatShoppingApiError(e));
    } finally {
      setAiBusy(false);
    }
  }, [
    aiBusy,
    api,
    canGenerate,
    pantryItems,
    recipes,
    setGeneratedList,
    source,
    toast,
  ]);

  return (
    <ScrollView
      className="flex-1 bg-cream-50"
      testID={testID}
      contentContainerClassName="p-4 gap-3 pb-8"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-lg font-semibold text-fg">Список покупок</Text>
      <Text className="text-xs text-fg-muted">
        AI складає список з рецептів, автоматично виключаючи продукти, які вже є
        в активній коморі. Паритет із web.
      </Text>

      <Card className="gap-3">
        <Text className="text-sm font-medium text-fg">
          Згенерувати AI-список
        </Text>
        <View className="flex-row gap-2">
          <Pressable
            testID="shopping-source-recipes"
            onPress={() => setSource("recipes")}
            accessibilityRole="button"
            accessibilityState={{ selected: source === "recipes" }}
            disabled={aiBusy}
            className={
              source === "recipes"
                ? "flex-1 py-2 px-3 rounded-xl bg-lime-600"
                : "flex-1 py-2 px-3 rounded-xl bg-cream-200"
            }
          >
            <Text
              className={
                source === "recipes"
                  ? "text-white text-xs font-semibold text-center"
                  : "text-fg text-xs font-semibold text-center"
              }
            >
              Рецепти
            </Text>
            <Text
              className={
                source === "recipes"
                  ? "text-white/80 text-2xs text-center mt-0.5"
                  : "text-fg-muted text-2xs text-center mt-0.5"
              }
            >
              {hasRecipes ? `${recipes.length} збережених` : "немає рецептів"}
            </Text>
          </Pressable>
          <Pressable
            testID="shopping-source-weekplan"
            onPress={() => setSource("weekplan")}
            accessibilityRole="button"
            accessibilityState={{ selected: source === "weekplan" }}
            disabled={aiBusy || !hasWeekPlan}
            className={
              source === "weekplan"
                ? "flex-1 py-2 px-3 rounded-xl bg-lime-600 opacity-60"
                : "flex-1 py-2 px-3 rounded-xl bg-cream-200 opacity-60"
            }
          >
            <Text className="text-fg text-xs font-semibold text-center">
              Тижневий план
            </Text>
            <Text className="text-fg-muted text-2xs text-center mt-0.5">
              поки тільки на web
            </Text>
          </Pressable>
        </View>

        {!canGenerate ? (
          <Text className="text-xs text-fg-muted text-center">
            {source === "recipes"
              ? "Спочатку додай рецепт у Меню → Збережені рецепти."
              : "Тижневий план поки доступний лише в web-версії."}
          </Text>
        ) : null}

        <Button
          variant="nutrition"
          onPress={onGenerate}
          disabled={aiBusy || !canGenerate}
          testID="shopping-generate"
        >
          {aiBusy ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white">Генерую список…</Text>
            </View>
          ) : (
            "Згенерувати зі рецептів"
          )}
        </Button>

        {aiErr ? (
          <Text
            className="text-xs text-danger"
            testID="shopping-generate-error"
          >
            {aiErr}
          </Text>
        ) : null}
      </Card>

      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-fg-muted" testID="shopping-count">
          {totalCount.total} поз. · відмічено {totalCount.checked}
        </Text>
      </View>

      {shoppingList.categories.length === 0 ? (
        <Card className="p-4">
          <Text className="text-fg-muted text-sm text-center">
            Список порожній. Згенеруй AI-список вище або додай позицію вручну.
          </Text>
        </Card>
      ) : null}

      {shoppingList.categories.map((cat) => (
        <View
          key={cat.name}
          className="gap-1"
          testID={`shopping-cat-${cat.name}`}
        >
          <Text className="text-xs font-semibold text-fg-muted mt-1">
            {cat.name}
          </Text>
          {cat.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => toggle(cat.name, item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              className="flex-row items-center py-2 border-b border-cream-200"
            >
              <Text
                className={
                  item.checked
                    ? "text-fg-subtle line-through flex-1"
                    : "text-fg flex-1"
                }
              >
                {item.name}
                {item.quantity ? ` · ${item.quantity}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}

      <View className="flex-row gap-2 mt-2 items-end">
        <View className="flex-1">
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="Назва продукту"
            size="md"
          />
        </View>
        <Button variant="nutrition" onPress={onAdd} disabled={!draft.trim()}>
          Додати
        </Button>
      </View>

      <View className="flex-row gap-2 flex-wrap">
        <Button
          variant="secondary"
          onPress={clearChecked}
          disabled={totalCount.checked === 0}
        >
          Прибрати відмічені
        </Button>
        <Button
          variant="ghost"
          onPress={clearAll}
          disabled={totalCount.total === 0}
        >
          Очистити все
        </Button>
      </View>
    </ScrollView>
  );
}
