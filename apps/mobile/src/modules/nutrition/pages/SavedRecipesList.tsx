import { useCallback, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { hapticTap } from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { useSavedRecipesList } from "../hooks/useSavedRecipesList";
import {
  importRecipesFromJson,
  type SavedRecipe,
} from "../lib/recipeBookStore";

export function SavedRecipesListPage({ testID }: { testID?: string }) {
  const router = useRouter();
  const { recipes } = useSavedRecipesList();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const onBack = useCallback(() => {
    hapticTap();
    router.back();
  }, [router]);

  const runImport = useCallback(() => {
    setImportError(null);
    const res = importRecipesFromJson(importText);
    if (!res.ok) {
      setImportError(res.error);
      return;
    }
    hapticTap();
    setImportOpen(false);
    setImportText("");
  }, [importText]);

  const renderItem = useCallback(
    ({ item }: { item: SavedRecipe }) => (
      <Pressable
        onPress={() => {
          hapticTap();
          router.push({
            pathname: "/(tabs)/nutrition/recipe/[id]",
            params: { id: item.id },
          });
        }}
        className="mb-2"
        accessibilityRole="button"
        accessibilityLabel={item.title}
        testID={`saved-recipe-row-${item.id}`}
      >
        <Card>
          <Text className="text-fg font-medium" numberOfLines={2}>
            {item.title}
          </Text>
          {item.timeMinutes != null ? (
            <Text className="text-xs text-fg-muted mt-1">
              {item.timeMinutes} хв
            </Text>
          ) : null}
        </Card>
      </Pressable>
    ),
    [router],
  );

  return (
    <View className="flex-1 bg-cream-50" testID={testID}>
      <View className="px-4 pt-2 pb-2 border-b border-line flex-row items-center gap-3">
        <BackButton variant="ghost" size="sm" onPress={onBack} />
        <Text className="text-lg font-semibold text-fg flex-1">
          Збережені рецепти
        </Text>
      </View>

      <View className="p-3 gap-2 flex-row flex-wrap">
        <View className="flex-1 min-w-[120px]">
          <Button
            variant="nutrition"
            onPress={() => {
              hapticTap();
              router.push("/(tabs)/nutrition/recipe/form");
            }}
            testID="saved-recipes-new"
          >
            Новий рецепт
          </Button>
        </View>
        <View className="flex-1 min-w-[120px]">
          <Button
            variant="secondary"
            onPress={() => {
              hapticTap();
              setImportText("");
              setImportError(null);
              setImportOpen(true);
            }}
            testID="saved-recipes-import"
          >
            Імпорт JSON
          </Button>
        </View>
      </View>

      {recipes.length === 0 ? (
        <View className="px-4 py-6">
          <Text className="text-fg-muted text-sm">
            Порожньо. Додай рецепт вручну, імпортуй копію з web (експорт JSON)
            або збережи згодом з AI, коли з’явиться на мобайлі.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerClassName="px-3 pb-8"
        />
      )}

      <Modal
        visible={importOpen}
        animationType="slide"
        onRequestClose={() => setImportOpen(false)}
        transparent
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setImportOpen(false)}
        >
          <Pressable
            onPress={() => undefined}
            className="bg-cream-50 p-4 rounded-t-2xl max-h-[80%]"
            accessibilityViewIsModal
          >
            <Text className="text-fg font-medium mb-2">
              Встав JSON (масив, об’єкт з recipes або один рецепт)
            </Text>
            <TextInput
              className="border border-cream-200 rounded-lg p-2 text-fg min-h-[160px] text-sm"
              value={importText}
              onChangeText={setImportText}
              multiline
              placeholder='[{"id":"r1","title":"Суп"}]'
              placeholderTextColor="#a8a29e"
              testID="saved-recipes-import-input"
            />
            {importError ? (
              <Text className="text-red-600 text-sm mt-1">{importError}</Text>
            ) : null}
            <View className="mt-3 gap-2">
              <Button
                variant="nutrition"
                onPress={runImport}
                testID="saved-recipes-import-apply"
              >
                Імпортувати
              </Button>
              <Button variant="secondary" onPress={() => setImportOpen(false)}>
                Скасувати
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
