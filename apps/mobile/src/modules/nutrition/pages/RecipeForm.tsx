import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { hapticTap, type NullableMacros } from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { getRecipeById, upsertSavedRecipe } from "../lib/recipeBookStore";

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function linesFromText(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function textFromLines(lines: readonly string[]): string {
  return lines.join("\n");
}

function macrosToText(m: NullableMacros): {
  k: string;
  p: string;
  f: string;
  c: string;
} {
  return {
    k: m.kcal != null ? String(m.kcal) : "",
    p: m.protein_g != null ? String(m.protein_g) : "",
    f: m.fat_g != null ? String(m.fat_g) : "",
    c: m.carbs_g != null ? String(m.carbs_g) : "",
  };
}

export function RecipeFormPage({ testID }: { testID?: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; presetId?: string }>();
  const paramId = useMemo(() => {
    const a = params.id;
    const b = params.presetId;
    return {
      editId: Array.isArray(a) ? a[0] : a,
      presetId: Array.isArray(b) ? b[0] : b,
    };
  }, [params.id, params.presetId]);

  const existing = useMemo(
    () => (paramId.editId ? getRecipeById(String(paramId.editId)) : undefined),
    [paramId.editId],
  );

  const isEdit = Boolean(existing);
  const titleBar = isEdit ? "Редагувати" : "Новий рецепт";

  const [title, setTitle] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [servingsStr, setServingsStr] = useState("");
  const [ingText, setIngText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [tipsText, setTipsText] = useState("");
  const [k, setK] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [c, setC] = useState("");
  const [idDraft, setIdDraft] = useState("");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setTimeStr(
        existing.timeMinutes != null ? String(existing.timeMinutes) : "",
      );
      setServingsStr(
        existing.servings != null && existing.servings > 0
          ? String(existing.servings)
          : "",
      );
      setIngText(textFromLines(existing.ingredients));
      setStepsText(textFromLines(existing.steps));
      setTipsText(textFromLines(existing.tips));
      const mt = macrosToText(existing.macros);
      setK(mt.k);
      setP(mt.p);
      setF(mt.f);
      setC(mt.c);
      setIdDraft(existing.id);
    } else {
      setTitle("");
      setTimeStr("");
      setServingsStr("");
      setIngText("");
      setStepsText("");
      setTipsText("");
      setK("");
      setP("");
      setF("");
      setC("");
      const pre = paramId.presetId ?? paramId.editId;
      setIdDraft(pre ? String(pre) : "");
    }
  }, [existing, paramId.presetId, paramId.editId]);

  const onBack = useCallback(() => {
    hapticTap();
    router.back();
  }, [router]);

  const onSave = useCallback(() => {
    const t = title.trim();
    if (!t) {
      Alert.alert("Потрібна назва", "Введи назву рецепта");
      return;
    }

    const timeMinutes = numOrNull(timeStr);
    const servings = numOrNull(servingsStr);
    const macros: NullableMacros = {
      kcal: numOrNull(k),
      protein_g: numOrNull(p),
      fat_g: numOrNull(f),
      carbs_g: numOrNull(c),
    };

    const manualId = idDraft.trim() || undefined;
    const idForPayload = existing?.id ?? manualId;

    const next = upsertSavedRecipe({
      id: idForPayload,
      title: t,
      timeMinutes,
      servings,
      ingredients: linesFromText(ingText),
      steps: linesFromText(stepsText),
      tips: linesFromText(tipsText),
      macros,
      createdAt: existing?.createdAt,
    });

    hapticTap();
    router.replace({
      pathname: "/(tabs)/nutrition/recipe/[id]",
      params: { id: next.id },
    });
  }, [
    title,
    timeStr,
    servingsStr,
    ingText,
    stepsText,
    tipsText,
    k,
    p,
    f,
    c,
    idDraft,
    existing,
    router,
  ]);

  return (
    <View className="flex-1 bg-cream-50" testID={testID}>
      <View className="px-4 pt-2 pb-2 border-b border-line flex-row items-center gap-3">
        <BackButton variant="ghost" size="sm" onPress={onBack} />
        <Text
          className="text-lg font-semibold text-fg flex-1"
          numberOfLines={1}
        >
          {titleBar}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-3 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text className="text-xs text-fg-muted mb-1">Назва *</Text>
          <TextInput
            className="border border-cream-200 rounded-lg p-2 text-fg"
            value={title}
            onChangeText={setTitle}
            placeholder="Борщ"
            placeholderTextColor="#a8a29e"
            testID="recipe-form-title"
          />
        </Card>

        {!isEdit ? (
          <Card>
            <Text className="text-xs text-fg-muted mb-1">
              ID (необов’язково, для deep link)
            </Text>
            <TextInput
              className="border border-cream-200 rounded-lg p-2 text-fg"
              value={idDraft}
              onChangeText={setIdDraft}
              placeholder="Залиш порожнім — згенеруємо"
              autoCapitalize="none"
              placeholderTextColor="#a8a29e"
              testID="recipe-form-id"
            />
          </Card>
        ) : null}

        <Card>
          <Text className="text-xs text-fg-muted mb-1">Час, хв · Порції</Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={timeStr}
              onChangeText={setTimeStr}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor="#a8a29e"
            />
            <TextInput
              className="flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={servingsStr}
              onChangeText={setServingsStr}
              keyboardType="decimal-pad"
              placeholder="2"
              placeholderTextColor="#a8a29e"
            />
          </View>
        </Card>

        <Card>
          <Text className="text-xs text-fg-muted mb-1">
            Ккал · Б / Ж / В (г, на порцію)
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <TextInput
              className="min-w-[20%] flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={k}
              onChangeText={setK}
              keyboardType="decimal-pad"
              placeholder="ккал"
              placeholderTextColor="#a8a29e"
            />
            <TextInput
              className="min-w-[20%] flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={p}
              onChangeText={setP}
              keyboardType="decimal-pad"
              placeholder="білки"
              placeholderTextColor="#a8a29e"
            />
            <TextInput
              className="min-w-[20%] flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={f}
              onChangeText={setF}
              keyboardType="decimal-pad"
              placeholder="жири"
              placeholderTextColor="#a8a29e"
            />
            <TextInput
              className="min-w-[20%] flex-1 border border-cream-200 rounded-lg p-2 text-fg"
              value={c}
              onChangeText={setC}
              keyboardType="decimal-pad"
              placeholder="вуглев."
              placeholderTextColor="#a8a29e"
            />
          </View>
        </Card>

        <Card>
          <Text className="text-xs text-fg-muted mb-1">
            Інгредієнти (кожен з нового рядка)
          </Text>
          <TextInput
            className="border border-cream-200 rounded-lg p-2 text-fg min-h-[100px] text-sm"
            value={ingText}
            onChangeText={setIngText}
            multiline
            testID="recipe-form-ing"
          />
        </Card>

        <Card>
          <Text className="text-xs text-fg-muted mb-1">Покроково (рядки)</Text>
          <TextInput
            className="border border-cream-200 rounded-lg p-2 text-fg min-h-[120px] text-sm"
            value={stepsText}
            onChangeText={setStepsText}
            multiline
            testID="recipe-form-steps"
          />
        </Card>

        <Card>
          <Text className="text-xs text-fg-muted mb-1">Поради (рядки)</Text>
          <TextInput
            className="border border-cream-200 rounded-lg p-2 text-fg min-h-[64px] text-sm"
            value={tipsText}
            onChangeText={setTipsText}
            multiline
          />
        </Card>

        <Button variant="nutrition" onPress={onSave} testID="recipe-form-save">
          Зберегти
        </Button>
      </ScrollView>
    </View>
  );
}
