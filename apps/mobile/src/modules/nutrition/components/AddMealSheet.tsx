/**
 * AddMealSheet — RN port of web's AddMealSheet.
 *
 * Two-step bottom sheet:
 *  Step "source" — вручну, штрихкод, фото (галерея/камера → analyze-photo).
 *  Step "fill"   — форма; для фото — опційно refine (порція + відповіді на питання).
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { isApiError, type NutritionPhotoResult } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";

import {
  MEAL_TYPES,
  type MealMacroSource,
  type MealSource,
  type MealTypeId,
} from "@sergeant/nutrition-domain";
import { hapticSuccess } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { setNutritionScanPrefillHandler } from "../lib/nutritionScanBridge";
import { mapPhotoResultToMealForm } from "../lib/photoResultToMealForm";
import {
  captureResizeAndReadBase64Jpeg,
  pickResizeAndReadBase64Jpeg,
} from "../lib/pickImageJpegForNutritionApi";

import { MacrosEditor } from "./meal-sheet/MacrosEditor";
import { MealTypePicker } from "./meal-sheet/MealTypePicker";
import { NameTimeRow } from "./meal-sheet/NameTimeRow";
import {
  currentTime,
  emptyForm,
  type MealFormState,
} from "./meal-sheet/mealFormUtils";

export interface MealSavePayload {
  id: string;
  time: string;
  mealType: MealTypeId;
  label: string;
  name: string;
  macros: {
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carbs_g: number | null;
  };
  source: MealSource;
  macroSource: MealMacroSource;
}

export interface InitialMeal {
  id?: string;
  name?: string;
  mealType?: MealTypeId;
  time?: string;
  macros?: {
    kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  };
}

interface PhotoSession {
  payload: {
    image_base64: string;
    mime_type: "image/jpeg";
    locale: "uk-UA";
  };
  prior: NutritionPhotoResult;
}

interface AddMealSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (meal: MealSavePayload) => void;
  initialMeal?: InitialMeal | null;
}

export function AddMealSheet({
  open,
  onClose,
  onSave,
  initialMeal,
}: AddMealSheetProps) {
  const api = useApiClient();
  const [form, setForm] = useState<MealFormState>(() => emptyForm(null));
  const [step, setStep] = useState<"source" | "fill">("source");
  const [macroSource, setMacroSource] = useState<MealMacroSource>("manual");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSession, setPhotoSession] = useState<PhotoSession | null>(null);
  const [refinePortion, setRefinePortion] = useState("");
  const [refineAnswers, setRefineAnswers] = useState<Record<string, string>>(
    {},
  );
  const [refineBusy, setRefineBusy] = useState(false);

  const resetPhotoRefine = useCallback(() => {
    setPhotoSession(null);
    setRefinePortion("");
    setRefineAnswers({});
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initialMeal?.id) {
      const mac = initialMeal.macros || {};
      setForm({
        name: String(initialMeal.name || ""),
        mealType: initialMeal.mealType || "breakfast",
        time: initialMeal.time || currentTime(),
        kcal: mac.kcal != null ? String(Math.round(mac.kcal)) : "",
        protein_g:
          mac.protein_g != null ? String(Math.round(mac.protein_g)) : "",
        fat_g: mac.fat_g != null ? String(Math.round(mac.fat_g)) : "",
        carbs_g: mac.carbs_g != null ? String(Math.round(mac.carbs_g)) : "",
        err: "",
      });
      setMacroSource("manual");
      setStep("fill");
      resetPhotoRefine();
    } else {
      setForm(emptyForm(null));
      setMacroSource("manual");
      setStep("source");
      resetPhotoRefine();
    }
  }, [open, initialMeal, resetPhotoRefine]);

  useEffect(() => {
    if (!open) {
      setNutritionScanPrefillHandler(null);
      return;
    }
    setNutritionScanPrefillHandler((payload) => {
      setForm((s) => ({
        ...s,
        name: payload.name,
        kcal: payload.kcal,
        protein_g: payload.protein_g,
        fat_g: payload.fat_g,
        carbs_g: payload.carbs_g,
        err: payload.partial
          ? "Перевір макроси: часткові дані з каталогу."
          : "",
      }));
      setMacroSource("productDb");
      setStep("fill");
      resetPhotoRefine();
    });
    return () => setNutritionScanPrefillHandler(null);
  }, [open, resetPhotoRefine]);

  const field = useCallback(
    (key: keyof MealFormState) => (v: string) =>
      setForm((s) => ({ ...s, [key]: v, err: "" })),
    [],
  );

  function handleSave() {
    const name = form.name.trim();
    if (!name) {
      setForm((s) => ({ ...s, err: "Введіть назву страви." }));
      return;
    }
    const kcal = form.kcal === "" ? null : Number(form.kcal);
    const protein_g = form.protein_g === "" ? null : Number(form.protein_g);
    const fat_g = form.fat_g === "" ? null : Number(form.fat_g);
    const carbs_g = form.carbs_g === "" ? null : Number(form.carbs_g);
    if (
      [kcal, protein_g, fat_g, carbs_g].some(
        (n) => n != null && (!Number.isFinite(n) || n < 0),
      )
    ) {
      setForm((s) => ({ ...s, err: "Некоректне значення КБЖВ." }));
      return;
    }
    const mealLabel =
      MEAL_TYPES.find((m) => m.id === form.mealType)?.label || "Прийом їжі";
    hapticSuccess();
    const contentSource: MealSource =
      macroSource === "photoAI" ? "photo" : "manual";
    onSave({
      id:
        initialMeal?.id ||
        `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: form.time || currentTime(),
      mealType: form.mealType,
      label: mealLabel,
      name,
      macros: { kcal, protein_g, fat_g, carbs_g },
      source: contentSource,
      macroSource,
    });
  }

  const applyPhotoAnalyzeSuccess = useCallback(
    (base64: string, mimeType: "image/jpeg", r: NutritionPhotoResult) => {
      setForm((s) => ({ ...s, ...mapPhotoResultToMealForm(r), err: "" }));
      setMacroSource("photoAI");
      setStep("fill");
      setPhotoSession({
        payload: {
          image_base64: base64,
          mime_type: mimeType,
          locale: "uk-UA",
        },
        prior: r,
      });
      const g = r.portion?.gramsApprox;
      setRefinePortion(g != null && g > 0 ? String(Math.round(g)) : "");
      const qs = (r.questions || []).slice(0, 6);
      setRefineAnswers((prev) => {
        const next = { ...prev };
        for (const q of qs) {
          if (next[q] == null) next[q] = "";
        }
        return next;
      });
    },
    [],
  );

  const runPickAndAnalyze = useCallback(
    async (mode: "library" | "camera") => {
      const picked =
        mode === "library"
          ? await pickResizeAndReadBase64Jpeg()
          : await captureResizeAndReadBase64Jpeg();
      if (picked.status === "cancel") return;
      if (picked.status === "error") {
        setForm((s) => ({ ...s, err: picked.message }));
        return;
      }
      setPhotoBusy(true);
      setForm((s) => ({ ...s, err: "" }));
      try {
        const out = await api.nutrition.analyzePhoto({
          image_base64: picked.base64,
          mime_type: picked.mimeType,
          locale: "uk-UA",
        });
        const r = out?.result;
        if (!r) {
          setForm((s) => ({
            ...s,
            err: "Порожня відповідь сервера. Спробуй інше фото.",
          }));
          return;
        }
        applyPhotoAnalyzeSuccess(picked.base64, picked.mimeType, r);
      } catch (e) {
        const msg = isApiError(e)
          ? e.message
          : e instanceof Error
            ? e.message
            : "Помилка аналізу фото";
        setForm((s) => ({ ...s, err: msg }));
      } finally {
        setPhotoBusy(false);
      }
    },
    [api, applyPhotoAnalyzeSuccess],
  );

  const onRefinePhoto = useCallback(async () => {
    if (!photoSession) return;
    setRefineBusy(true);
    setForm((s) => ({ ...s, err: "" }));
    try {
      const gRaw = String(refinePortion).replace(",", ".").trim();
      const grams = Number(gRaw);
      const qna = (photoSession.prior.questions || [])
        .slice(0, 6)
        .map((q) => ({
          question: q,
          answer: String(refineAnswers[q] || "").trim(),
        }))
        .filter((x) => x.answer);
      const out = await api.nutrition.refinePhoto({
        image_base64: photoSession.payload.image_base64,
        mime_type: photoSession.payload.mime_type,
        prior_result: photoSession.prior,
        portion_grams: Number.isFinite(grams) && grams > 0 ? grams : null,
        qna,
        locale: "uk-UA",
      });
      const r = out?.result;
      if (!r) {
        setForm((s) => ({ ...s, err: "Порожня відповідь (refine)." }));
        return;
      }
      setForm((s) => ({ ...s, ...mapPhotoResultToMealForm(r) }));
      setPhotoSession((ps) => (ps ? { ...ps, prior: r } : null));
      const g2 = r.portion?.gramsApprox;
      if (g2 != null && g2 > 0) {
        setRefinePortion(String(Math.round(g2)));
      }
    } catch (e) {
      const msg = isApiError(e)
        ? e.message
        : e instanceof Error
          ? e.message
          : "Помилка уточнення";
      setForm((s) => ({ ...s, err: msg }));
    } finally {
      setRefineBusy(false);
    }
  }, [api, photoSession, refinePortion, refineAnswers]);

  const showBack = step === "fill" && !initialMeal?.id;
  const showPhotoRefine =
    step === "fill" && macroSource === "photoAI" && photoSession;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === "source" ? "Звідки страва?" : "Додати прийом їжі"}
    >
      {step === "source" ? (
        <View>
          <Text className="text-xs text-fg-subtle mb-4">
            Оберіть джерело нижче. Макроси, назву й час відредагуєте на
            наступному кроці.
          </Text>

          <Button
            variant="secondary"
            onPress={() => {
              router.push({
                pathname: "/(tabs)/nutrition/scan",
                params: { returnTo: "addMeal" },
              });
            }}
            accessibilityLabel="Сканер штрихкоду"
            testID="add-meal-open-barcode-scan"
            disabled={photoBusy}
          >
            Сканер штрихкоду
          </Button>

          {photoBusy ? (
            <View
              className="items-center py-3"
              testID="add-meal-photo-analyzing"
            >
              <ActivityIndicator />
              <Text className="text-xs text-fg-muted mt-2">Аналізую фото…</Text>
            </View>
          ) : (
            <View className="mt-2 gap-2">
              <Button
                variant="secondary"
                onPress={() => void runPickAndAnalyze("library")}
                accessibilityLabel="Фото з галереї"
                testID="add-meal-open-photo-library"
              >
                Фото з галереї
              </Button>
              <Button
                variant="secondary"
                onPress={() => void runPickAndAnalyze("camera")}
                accessibilityLabel="Зняти камерою"
                testID="add-meal-open-photo-camera"
              >
                Зняти камерою
              </Button>
            </View>
          )}

          <View className="items-center my-3">
            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-px bg-cream-300" />
              {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- divider text */}
              <Text className="text-[10px] text-fg-subtle uppercase tracking-wider">
                або
              </Text>
              <View className="flex-1 h-px bg-cream-300" />
            </View>
          </View>

          <Button
            variant="secondary"
            onPress={() => {
              setMacroSource("manual");
              setForm((s) => ({ ...s, err: "" }));
              setStep("fill");
            }}
            accessibilityLabel="Ввести вручну"
            disabled={photoBusy}
            testID="add-meal-source-manual"
          >
            Ввести вручну
          </Button>
          {form.err && step === "source" ? (
            <Text
              className="text-xs text-red-500 mt-2"
              testID="add-meal-source-err"
            >
              {form.err}
            </Text>
          ) : null}
        </View>
      ) : (
        <View>
          {showBack ? (
            <Pressable
              onPress={() => {
                setStep("source");
                resetPhotoRefine();
              }}
              accessibilityRole="button"
              accessibilityLabel="Назад до вибору джерела"
              className="mb-3"
            >
              <Text className="text-xs text-fg-subtle underline">
                ← Назад до вибору джерела
              </Text>
            </Pressable>
          ) : null}
          <MealTypePicker mealType={form.mealType} setForm={setForm} />
          <NameTimeRow form={form} field={field} setForm={setForm} />
          <MacrosEditor form={form} field={field} setForm={setForm} />

          {showPhotoRefine && photoSession ? (
            <View
              className="mt-3 p-3 rounded-xl border border-cream-200 bg-cream-50/80"
              testID="add-meal-photo-refine-block"
            >
              <Text className="text-sm font-medium text-fg mb-1">
                Уточнення AI
              </Text>
              <Text className="text-xs text-fg-muted mb-2">
                Можна вказати вагу порції та відповіді на питання — перерахунок
                КБЖВ через сервер.
              </Text>
              <Text className="text-xs text-fg-muted mb-0.5">Порція, г</Text>
              <TextInput
                className="border border-cream-200 rounded-lg px-2 py-1.5 text-fg bg-white text-sm"
                value={refinePortion}
                onChangeText={setRefinePortion}
                keyboardType="decimal-pad"
                placeholder="напр. 180"
                placeholderTextColor="#a8a29e"
                editable={!refineBusy}
              />
              {photoSession.prior.questions.slice(0, 6).map((q) => (
                <View key={q} className="mt-2">
                  <Text
                    className="text-xs text-fg-muted mb-0.5"
                    numberOfLines={3}
                  >
                    {q}
                  </Text>
                  <TextInput
                    className="border border-cream-200 rounded-lg px-2 py-1.5 text-fg bg-white text-sm"
                    value={refineAnswers[q] ?? ""}
                    onChangeText={(v) =>
                      setRefineAnswers((a) => ({ ...a, [q]: v }))
                    }
                    placeholder="Відповідь, якщо треба"
                    placeholderTextColor="#a8a29e"
                    editable={!refineBusy}
                  />
                </View>
              ))}
              {refineBusy ? (
                <View
                  className="mt-2 items-center"
                  testID="add-meal-refine-busy"
                >
                  <ActivityIndicator />
                  <Text className="text-xs text-fg-muted mt-1">Уточнюю…</Text>
                </View>
              ) : (
                <View className="mt-2">
                  <Button
                    variant="secondary"
                    onPress={() => void onRefinePhoto()}
                    testID="add-meal-refine-submit"
                  >
                    Перерахувати з уточненнями
                  </Button>
                </View>
              )}
            </View>
          ) : null}

          {form.err ? (
            <Text className="text-xs text-red-500 mt-2">{form.err}</Text>
          ) : null}

          <View className="mt-5 gap-2">
            <Button
              variant="nutrition"
              onPress={handleSave}
              testID="add-meal-save"
            >
              Зберегти
            </Button>
            <Button variant="ghost" onPress={onClose}>
              Скасувати
            </Button>
          </View>
        </View>
      )}
    </Sheet>
  );
}
