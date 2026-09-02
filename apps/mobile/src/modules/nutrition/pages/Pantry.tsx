import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { isApiError } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";

import {
  groupItemsByCategory,
  type PantryItem,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";
import { hapticTap } from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";

import { NutritionIcon } from "../components/NutritionIcon";
import { useNutritionPantries } from "../hooks/useNutritionPantries";

function formatPantryApiError(e: unknown): string {
  if (isApiError(e)) {
    return e.message || `Помилка ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return "Помилка запиту";
}

export function PantryPage({ testID }: { testID?: string }) {
  const router = useRouter();
  const api = useApiClient();
  const {
    pantries,
    pantryItems,
    placeFilter,
    setPlaceFilter,
    addLine,
    applyParsedItems,
    removeItemAt,
    restoreItemAt,
    moveItemTo,
    addPantry,
  } = useNutritionPantries();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [newPantryName, setNewPantryName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");

  // Групування по ПОВНОМУ списку, фільтр звужує вже його: `idx` усередині
  // категорії і є глобальною адресою позиції для мутацій.
  const grouped = useMemo(() => {
    const all = groupItemsByCategory<PlacedPantryItem>(pantryItems);
    if (!placeFilter) return all;
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter(({ item }) => item.pantryId === placeFilter),
      }))
      .filter((g) => g.items.length > 0);
  }, [pantryItems, placeFilter]);

  const placeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of pantryItems) {
      map.set(item.pantryId, (map.get(item.pantryId) ?? 0) + 1);
    }
    return map;
  }, [pantryItems]);

  const onAdd = useCallback(() => {
    addLine(draft);
    setDraft("");
  }, [addLine, draft]);

  const onBack = useCallback(() => {
    hapticTap();
    router.back();
  }, [router]);

  const onParseWithAi = useCallback(async () => {
    const text = bulkText.trim();
    if (!text) {
      setAiErr("Впиши список продуктів (або встав кілька рядків).");
      return;
    }
    setAiErr("");
    setAiBusy(true);
    try {
      const data = await api.nutrition.parsePantry({ text, locale: "uk-UA" });
      const items = Array.isArray(data?.items)
        ? (data.items as PantryItem[])
        : [];
      applyParsedItems(items);
      setBulkText("");
      hapticTap();
    } catch (e) {
      setAiErr(formatPantryApiError(e));
    } finally {
      setAiBusy(false);
    }
  }, [api, bulkText, applyParsedItems]);

  return (
    <View className="flex-1 bg-cream-50" testID={testID}>
      <View className="px-4 pt-2 pb-2 border-b border-line flex-row items-center gap-3">
        <BackButton variant="ghost" size="sm" onPress={onBack} />
        <Text className="text-lg font-semibold text-fg flex-1">Комора</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-3 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Фільтр місць, а не перемикач активного: усі місця видно разом,
            фільтр лише звужує. */}
        <View className="flex-row flex-wrap gap-2">
          {[{ id: null as string | null, name: "Усі" }, ...pantries].map(
            (p) => {
              const sel = placeFilter === p.id;
              const count =
                p.id === null
                  ? pantryItems.length
                  : (placeCounts.get(p.id) ?? 0);
              return (
                <Pressable
                  key={p.id ?? "__all"}
                  onPress={() => {
                    hapticTap();
                    setPlaceFilter(p.id);
                  }}
                  accessibilityState={{ selected: sel }}
                  className={
                    sel
                      ? "px-3 py-1.5 rounded-full bg-lime-600"
                      : "px-3 py-1.5 rounded-full bg-cream-200"
                  }
                >
                  <Text
                    className={sel ? "text-white text-xs" : "text-fg text-xs"}
                    numberOfLines={1}
                  >
                    {p.name} {count}
                  </Text>
                </Pressable>
              );
            },
          )}
        </View>

        <Text className="text-xs text-fg-muted">
          Додавай рядок як на веб: «2 л молока», «яйця 10 шт», парсер
          `parseLoosePantryText` зведе в структуровані позиції.
        </Text>

        <Card>
          <Text className="text-sm font-medium text-fg mb-1">
            AI-розбір списку
          </Text>
          <Text className="text-xs text-fg-muted mb-2">
            Великий список мовою природи, на сервері Claude розкладе в позиції й
            додасть у цей склад (злиття, як на web). Потрібен Anthropic key на
            бекенді та авторизована сесія.
          </Text>
          <TextInput
            value={bulkText}
            onChangeText={setBulkText}
            placeholder="молоко, яйця, борошно… (кілька рядків)"
            className="border border-cream-300 rounded-xl px-3 py-2 text-fg bg-white min-h-[88px] text-sm"
            multiline
            textAlignVertical="top"
            placeholderTextColor="#a8a29e"
            testID="pantry-ai-bulk"
            editable={!aiBusy}
          />
          {aiErr ? (
            <Text className="text-sm text-red-600 mt-1" testID="pantry-ai-err">
              {aiErr}
            </Text>
          ) : null}
          <View className="mt-2">
            {aiBusy ? (
              <ActivityIndicator />
            ) : (
              <Button
                variant="secondary"
                onPress={() => void onParseWithAi()}
                testID="pantry-ai-btn"
                disabled={!bulkText.trim()}
              >
                Розібрати AI
              </Button>
            )}
          </View>
        </Card>

        <View className="flex-row gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Продукт або список…"
            className="flex-1 border border-cream-300 rounded-xl px-3 py-2 text-fg bg-white"
            placeholderTextColor="#a8a29e"
            onSubmitEditing={onAdd}
          />
          <Button variant="nutrition" onPress={onAdd} disabled={!draft.trim()}>
            Додати
          </Button>
        </View>

        {grouped.length === 0 ? (
          <Card className="p-4">
            <Text className="text-fg-muted text-sm text-center">
              Склад порожній. Додай продукти рядком вище.
            </Text>
          </Card>
        ) : (
          grouped.map((bucket) => (
            <View key={bucket.cat.id} className="gap-1">
              <View className="flex-row items-center gap-1.5">
                <NutritionIcon name={bucket.cat.iconName} size={14} />
                <Text className="text-xs font-semibold text-fg-muted">
                  {bucket.cat.label}
                </Text>
              </View>
              {bucket.items.map(({ item, idx }) => {
                const it: PlacedPantryItem = item;
                // Наступне місце по колу: власного пікера на мобільній
                // поверхні поки немає, а зміна має лишатись одним дотиком.
                const curPlace = pantries.findIndex(
                  (p) => p.id === it.pantryId,
                );
                const nextPlace =
                  pantries[(curPlace + 1) % Math.max(pantries.length, 1)];
                return (
                  <View
                    key={`${it.pantryId}-${it.name}-${idx}`}
                    className="flex-row items-center py-1.5 border-b border-cream-200/80"
                  >
                    <View className="flex-1">
                      <Text className="text-fg text-sm">{it.name}</Text>
                      {it.qty != null || it.unit ? (
                        <Text className="text-xs text-fg-muted">
                          {it.qty != null && it.unit
                            ? `${it.qty} ${it.unit}`
                            : it.qty != null
                              ? String(it.qty)
                              : String(it.unit || "")}
                        </Text>
                      ) : null}
                    </View>
                    {pantries.length > 1 && nextPlace ? (
                      <Pressable
                        onPress={() => {
                          hapticTap();
                          moveItemTo(idx, nextPlace.id);
                        }}
                        accessibilityLabel={`Місце для ${it.name}: ${pantries[curPlace]?.name ?? ""}. Перенести в ${nextPlace.name}`}
                        className="px-2 py-1"
                      >
                        <Text
                          className="text-xs text-fg-muted"
                          numberOfLines={1}
                        >
                          {pantries[curPlace]?.name ?? ""}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        const snapshot: PantryItem = it;
                        const removedAt = it.localIdx;
                        const fromId = it.pantryId;
                        removeItemAt(idx);
                        showUndoToast(toast, {
                          msg: `Видалено «${snapshot.name}»`,
                          onUndo: () =>
                            restoreItemAt(removedAt, snapshot, fromId),
                        });
                      }}
                      accessibilityLabel={`Видалити ${it.name}`}
                      className="px-2 py-1"
                    >
                      <Text className="text-fg-subtle text-lg leading-none">
                        ×
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <View className="mt-4 border-t border-cream-200 pt-4 gap-2">
          <Text className="text-xs text-fg-muted">Нове місце зберігання</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={newPantryName}
              onChangeText={setNewPantryName}
              placeholder="Назва (напр. Балкон)"
              className="flex-1 border border-cream-300 rounded-xl px-3 py-2 text-fg bg-white"
              placeholderTextColor="#a8a29e"
            />
            <Button
              variant="secondary"
              onPress={() => {
                if (!newPantryName.trim()) return;
                addPantry(newPantryName.trim());
                setNewPantryName("");
              }}
            >
              Створити
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
