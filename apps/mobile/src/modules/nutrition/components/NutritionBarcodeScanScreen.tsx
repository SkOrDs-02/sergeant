import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isApiError, type BarcodeProduct } from "@sergeant/api-client";
import { hapticSuccess } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

import { useBarcodeProductLookup } from "../hooks/useBarcodeProductLookup";
import { mealFormStateFromBarcodeProduct } from "../lib/applyBarcodeProduct";
import { normalizeBarcodeRaw } from "../lib/barcodeNormalize";
import { emitNutritionScanPrefill } from "../lib/nutritionScanBridge";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "itf14"] as const;

/**
 * Сканер штрихкодів (expo-camera) + lookup через `/api/barcode`.
 */
export function NutritionBarcodeScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnToRaw = params.returnTo;
  const returnTo = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useBarcodeProductLookup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleHint, setIdleHint] = useState<string | null>(null);
  const [scanDone, setScanDone] = useState(false);
  const [productPreview, setProductPreview] = useState<{
    p: BarcodeProduct;
    code: string;
  } | null>(null);
  const lastDataRef = useRef<string | null>(null);
  const handledRef = useRef<string | null>(null);
  const isAddMeal = returnTo === "addMeal";

  const runPipeline = useCallback(
    async (raw: string) => {
      const code = normalizeBarcodeRaw(raw);
      if (!code) {
        setIdleHint("Очікуємо EAN/UPC (8–14 цифр).");
        return;
      }
      if (handledRef.current === code) return;
      handledRef.current = code;
      setBusy(true);
      setError(null);
      setIdleHint(null);
      try {
        const p = await lookup(code);
        if (!p) {
          setError("Продукт не знайдено. Спробуй інший кут або введи вручну.");
          setTimeout(() => {
            handledRef.current = null;
          }, 2000);
          return;
        }
        if (!p.name?.trim()) {
          setError("Продукт знайдено, але дані неповні. Введи КБЖВ вручну.");
          setTimeout(() => {
            handledRef.current = null;
          }, 2000);
          return;
        }
        hapticSuccess();
        const form = mealFormStateFromBarcodeProduct(p, code);
        if (isAddMeal) {
          emitNutritionScanPrefill({
            name: form.name,
            kcal: form.kcal,
            protein_g: form.protein_g,
            fat_g: form.fat_g,
            carbs_g: form.carbs_g,
            err: "",
            partial: Boolean(p.partial),
            barcode: code,
          });
          router.back();
          return;
        }
        setProductPreview({ p, code });
        setScanDone(true);
      } catch (e) {
        if (isApiError(e) && e.kind === "network") {
          setError(
            e.message || "Немає мережі. Перевір з'єднання і спробуй знову.",
          );
        } else if (isApiError(e) && e.kind === "http") {
          setError(
            e.serverMessage || e.message || "Помилка пошуку. Спробуй пізніше.",
          );
        } else {
          setError("Помилка пошуку. Спробуй пізніше.");
        }
        setTimeout(() => {
          handledRef.current = null;
        }, 2000);
      } finally {
        setBusy(false);
      }
    },
    [isAddMeal, lookup, router],
  );

  const onBarcodeScanned = useCallback(
    (event: { data: string }) => {
      if (busy || scanDone) return;
      const data = String(event.data ?? "");
      if (data === lastDataRef.current) return;
      lastDataRef.current = data;
      void runPipeline(data);
    },
    [busy, runPipeline, scanDone],
  );

  if (!permission) {
    return (
      <View className="flex-1 p-4 justify-center">
        <Text className="text-fg-muted">Перевіряємо дозвіл на камеру…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // `canAskAgain === false` means the OS will no longer surface the
    // system permission dialog (iOS after first denial; Android after
    // «Don't ask again»). Without a `Linking.openSettings()` affordance
    // the user is stuck with a non-functional «Надати доступ» button
    // that re-resolves to the same denied state. Switching the CTA to
    // open Settings is the canonical recovery path documented by both
    // Apple and Google.
    const canPrompt = permission.canAskAgain !== false;
    return (
      <View className="flex-1 p-4 justify-center gap-4">
        <Text className="text-fg text-center">
          Щоб сканувати штрихкоди, потрібен доступ до камери.
        </Text>
        {!canPrompt && (
          <Text className="text-fg-muted text-center">
            Дозвіл було відхилено. Система більше не покаже діалог — відкрий
            налаштування, щоб увімкнути камеру.
          </Text>
        )}
        {canPrompt ? (
          <Button variant="nutrition" onPress={() => void requestPermission()}>
            Надати доступ
          </Button>
        ) : (
          <Button
            variant="nutrition"
            onPress={() => {
              void Linking.openSettings();
            }}
          >
            Відкрити налаштування
          </Button>
        )}
        <Button variant="ghost" onPress={() => router.back()}>
          Назад
        </Button>
      </View>
    );
  }

  if (productPreview) {
    const f = mealFormStateFromBarcodeProduct(
      productPreview.p,
      productPreview.code,
    );
    return (
      <View className="flex-1 p-4 bg-cream-50 justify-center gap-3">
        <Text className="text-lg font-semibold text-fg text-center">
          {f.name || "Продукт"}
        </Text>
        {productPreview.p.partial ? (
          <Text className="text-xs text-amber-700 text-center">
            Дані часткові — уточни КБЖВ вручну після додавання.
          </Text>
        ) : null}
        <Text className="text-sm text-fg-muted text-center">
          {f.kcal} ккал · Б {f.protein_g} г · Ж {f.fat_g} г · В {f.carbs_g} г
        </Text>
        <Button
          variant="nutrition"
          onPress={() => router.replace("/(tabs)/nutrition")}
        >
          До Харчування
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            setProductPreview(null);
            setScanDone(false);
            handledRef.current = null;
            lastDataRef.current = null;
            setError(null);
          }}
        >
          Сканерувати ще
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" testID="nutrition-barcode-scan">
      <View className="flex-1">
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        {busy ? (
          <View
            style={StyleSheet.absoluteFillObject}
            className="items-center justify-center bg-black/40"
            pointerEvents="box-none"
          >
            <Text className="text-white font-medium">Шукаю продукт…</Text>
          </View>
        ) : null}
      </View>
      <View className="p-4 bg-cream-50 gap-2">
        {error ? (
          <Text className="text-sm text-red-600 text-center">{error}</Text>
        ) : null}
        {idleHint && !error ? (
          <Text className="text-xs text-fg-muted text-center">{idleHint}</Text>
        ) : null}
        {isAddMeal ? (
          <Text className="text-xs text-fg-muted text-center">
            Після зчитання ти повернешся до форми додавання прийому їжі.
          </Text>
        ) : (
          <Text className="text-xs text-fg-muted text-center">
            Наведи камеру на штрихкод продукту.
          </Text>
        )}
        <Pressable
          onPress={() => {
            handledRef.current = null;
            lastDataRef.current = null;
            setError(null);
          }}
          className="py-2"
        >
          <Text className="text-center text-fg-muted text-xs">
            Скинути блокування й сканерувати знову
          </Text>
        </Pressable>
        <Button
          variant="secondary"
          onPress={() => router.back()}
          accessibilityLabel="Повернутися до Харчування"
        >
          Назад
        </Button>
      </View>
    </View>
  );
}
