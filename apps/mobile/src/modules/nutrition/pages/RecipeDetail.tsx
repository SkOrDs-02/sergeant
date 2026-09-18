import { useCallback } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { hapticTap, type NullableMacros } from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";

import { useSavedRecipeById } from "../hooks/useSavedRecipeById";
import { removeSavedRecipe, upsertSavedRecipe } from "../lib/recipeBookStore";

function formatMacros(m: NullableMacros): { text: string; hasAny: boolean } {
  const parts = [
    m.kcal != null ? `Ккал: ${m.kcal}` : null,
    m.protein_g != null ? `Б: ${m.protein_g} г` : null,
    m.fat_g != null ? `Ж: ${m.fat_g} г` : null,
    m.carbs_g != null ? `В: ${m.carbs_g} г` : null,
  ].filter(Boolean) as string[];
  return { text: parts.join(" · "), hasAny: parts.length > 0 };
}

export function RecipeDetailPage({
  id,
}: {
  id: string | string[] | undefined;
}) {
  const router = useRouter();
  const { recipe, recipeId } = useSavedRecipeById(id);
  const toast = useToast();
  const onBack = useCallback(() => {
    hapticTap();
    router.back();
  }, [router]);

  const onShare = useCallback(() => {
    if (!recipe) return;
    hapticTap();
    void Share.share({
      message: JSON.stringify(recipe, null, 2),
      title: recipe.title,
    });
  }, [recipe]);

  const onEdit = useCallback(() => {
    if (!recipe) return;
    hapticTap();
    router.push({
      pathname: "/(tabs)/nutrition/recipe/form",
      params: { id: recipe.id },
    });
  }, [recipe, router]);

  // Single-tap delete + undo-toast (parity з web). Після видалення
  // відразу вертаємося назад, а toast живе ї є доступний у листі рецептів.
  const onDelete = useCallback(() => {
    if (!recipe) return;
    const snapshot = recipe;
    removeSavedRecipe(recipe.id);
    hapticTap();
    router.back();
    showUndoToast(toast, {
      msg: `Рецепт «${snapshot.title}» видалено`,
      onUndo: () => {
        upsertSavedRecipe(snapshot);
      },
    });
  }, [recipe, router, toast]);

  if (!recipeId) {
    return (
      <View className="flex-1 bg-cream-50">
        <Header onBack={onBack} title="Рецепт" />
        <View className="p-4">
          <Text className="text-fg-muted">Некоректний ID рецепта.</Text>
        </View>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View className="flex-1 bg-cream-50">
        <Header onBack={onBack} title="Рецепт" />
        <View className="p-4 gap-3" testID={`recipe-${recipeId}-missing`}>
          <Text className="text-fg font-medium">Рецепт не знайдено</Text>
          <Text className="text-fg-muted text-sm">
            ID: {recipeId}. На пристрої немає цієї копії. Web (IndexedDB) треба
            імпортувати вручну (список рецептів → Імпорт JSON) або створити
            рецепт з тим самим id.
          </Text>
          <View className="gap-2">
            <Button
              variant="nutrition"
              onPress={() => {
                hapticTap();
                router.push({
                  pathname: "/(tabs)/nutrition/recipe/form",
                  params: { presetId: recipeId },
                });
              }}
            >
              Створити з цим ID
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                hapticTap();
                router.push("/(tabs)/nutrition/saved-recipes");
              }}
            >
              Усі збережені
            </Button>
          </View>
        </View>
      </View>
    );
  }

  const m = recipe.macros;
  const { text: macrosText, hasAny: hasMacros } = formatMacros(m);

  return (
    <View className="flex-1 bg-cream-50" testID={`recipe-${recipe.id}-root`}>
      <Header onBack={onBack} title={recipe.title} />
      <View className="px-3 pt-1 pb-1 flex-row flex-wrap gap-2">
        <Button variant="secondary" onPress={onShare} className="px-3">
          JSON
        </Button>
        <Button
          variant="nutrition"
          onPress={onEdit}
          className="px-3"
          testID={`recipe-${recipe.id}-edit`}
        >
          Редагувати
        </Button>
        <Button
          variant="destructive"
          onPress={onDelete}
          className="px-3"
          testID={`recipe-${recipe.id}-delete`}
        >
          Видалити
        </Button>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-3 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row flex-wrap gap-2">
          {recipe.timeMinutes != null ? (
            <Text className="text-xs text-fg-muted bg-cream-200 px-2 py-1 rounded">
              ⏱ {recipe.timeMinutes} хв
            </Text>
          ) : null}
          {recipe.servings != null && recipe.servings > 0 ? (
            <Text className="text-xs text-fg-muted bg-cream-200 px-2 py-1 rounded">
              Порції: {recipe.servings}
            </Text>
          ) : null}
        </View>

        {hasMacros ? (
          <Card>
            <Text className="text-sm font-medium text-fg mb-1">
              Макроси (на порцію)
            </Text>
            <Text
              className="text-fg text-sm"
              testID={`recipe-${recipe.id}-macros`}
            >
              {macrosText}
            </Text>
          </Card>
        ) : (
          <Text
            className="text-xs text-fg-muted"
            testID={`recipe-${recipe.id}-empty-macros`}
          >
            Макроси не зазначено
          </Text>
        )}

        {recipe.ingredients.length > 0 ? (
          <Card>
            <Text className="text-sm font-medium text-fg mb-2">
              Інгредієнти
            </Text>
            {recipe.ingredients.map((line, i) => (
              <Text key={i} className="text-fg text-sm mb-1">
                • {line}
              </Text>
            ))}
          </Card>
        ) : null}

        {recipe.steps.length > 0 ? (
          <Card>
            <Text className="text-sm font-medium text-fg mb-2">Покроково</Text>
            {recipe.steps.map((line, i) => (
              <Text key={i} className="text-fg text-sm mb-2">
                {i + 1}. {line}
              </Text>
            ))}
          </Card>
        ) : null}

        {recipe.tips.length > 0 ? (
          <Card>
            <Text className="text-sm font-medium text-fg mb-2">Поради</Text>
            {recipe.tips.map((line, i) => (
              <Text key={i} className="text-fg text-sm mb-1">
                {line}
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="px-4 pt-2 pb-2 border-b border-line flex-row items-center gap-3">
      <BackButton variant="ghost" size="sm" onPress={onBack} />
      <Text className="text-lg font-semibold text-fg flex-1" numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}
