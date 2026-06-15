/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { isApiError } from "@shared/api";
import {
  bindBarcodeToFood,
  lookupFoodByBarcode,
  type FoodProduct,
} from "../../lib/foodDb/foodDb";
import { useBarcodeProductLookup } from "../../hooks/useBarcodeProduct";
import type { MealFormState } from "./mealFormUtils";
import type { PickedFood } from "./FoodPickerSection";

export interface UseBarcodeLookupParams {
  pickedFood: PickedFood | null;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  setPickedGrams: Dispatch<SetStateAction<string>>;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export interface UseBarcodeLookupResult {
  barcode: string;
  setBarcode: Dispatch<SetStateAction<string>>;
  barcodeStatus: string;
  setBarcodeStatus: Dispatch<SetStateAction<string>>;
  scannerOpen: boolean;
  setScannerOpen: Dispatch<SetStateAction<boolean>>;
  handleBarcodeLookup: (code: string) => Promise<void>;
  handleBarcodeBind: (code: string) => Promise<void>;
}

export function useBarcodeLookup({
  pickedFood,
  setPickedFood,
  setPickedGrams,
  setForm,
}: UseBarcodeLookupParams): UseBarcodeLookupResult {
  const [barcode, setBarcode] = useState("");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const lookupProduct = useBarcodeProductLookup();

  const handleBarcodeLookup = useCallback(
    async (codeRaw: string) => {
      const code = String(codeRaw || "").trim();
      if (!code) return;
      setBarcodeStatus("Шукаю…");

      const localFound = await lookupFoodByBarcode(code);
      if (localFound) {
        setBarcodeStatus("Знайдено ✔");
        setPickedFood(localFound);
        setPickedGrams(String(Math.round(localFound.defaultGrams || 100)));
        return;
      }

      let p;
      try {
        p = await lookupProduct(code);
      } catch (err) {
        if (isApiError(err) && err.isOffline) {
          setBarcodeStatus(
            "Немає підключення. Перевір інтернет і спробуй знову.",
          );
          return;
        }
        if (isApiError(err) && err.kind === "http") {
          setBarcodeStatus(
            err.serverMessage || "Помилка пошуку. Спробуй пізніше.",
          );
          return;
        }
        setBarcodeStatus(
          "Помилка пошуку. Перевір з'єднання і спробуй пізніше.",
        );
        return;
      }

      if (!p) {
        setBarcodeStatus("Продукт не знайдено. Можна ввести дані вручну.");
        return;
      }
      if (!p.name) {
        setBarcodeStatus("Продукт знайдено, але дані неповні. Введи вручну.");
        return;
      }

      const grams = p.servingGrams || 100;
      const gramsStr = String(Math.round(grams));
      const factor = grams / 100;
      const fakeFood: FoodProduct = {
        id: `barcode_${code}`,
        name: p.name,
        brand: p.brand || "",
        norm: "",
        defaultGrams: grams,
        per100: {
          kcal: p.kcal_100g || 0,
          protein_g: p.protein_100g || 0,
          fat_g: p.fat_100g || 0,
          carbs_g: p.carbs_100g || 0,
        },
        updatedAt: Date.now(),
      };
      setPickedFood(fakeFood);
      setPickedGrams(gramsStr);
      setForm((s) => ({
        ...s,
        name: [p?.name, p?.brand].filter(Boolean).join(" ").trim() || s.name,
        kcal:
          p?.kcal_100g != null
            ? String(Math.round(p.kcal_100g * factor))
            : s.kcal,
        protein_g:
          p?.protein_100g != null
            ? String(Math.round(p.protein_100g * factor))
            : s.protein_g,
        fat_g:
          p?.fat_100g != null
            ? String(Math.round(p.fat_100g * factor))
            : s.fat_g,
        carbs_g:
          p?.carbs_100g != null
            ? String(Math.round(p.carbs_100g * factor))
            : s.carbs_g,
        err: "",
      }));
      // partial = UPCitemdb found name/brand but has no nutrition data
      if (p.partial) {
        setBarcodeStatus(
          `Знайдено: ${[p.name, p.brand].filter(Boolean).join(" — ")} — введи КБЖВ вручну.`,
        );
      } else {
        setBarcodeStatus(
          `Знайдено: ${[p.name, p.brand].filter(Boolean).join(" — ")} ✔`,
        );
      }
    },
    [lookupProduct, setPickedFood, setPickedGrams, setForm],
  );

  const handleBarcodeBind = useCallback(
    async (codeRaw: string) => {
      const code = String(codeRaw || "").trim();
      if (!/^\d{8,14}$/.test(code)) {
        setBarcodeStatus("Некоректний штрихкод (очікую 8–14 цифр).");
        return;
      }
      if (!pickedFood?.id) {
        setBarcodeStatus(
          "Спочатку обери продукт (або збережи поточний як продукт).",
        );
        return;
      }
      const ok = await bindBarcodeToFood(code, String(pickedFood.id));
      setBarcodeStatus(ok ? "Прив'язано ✔" : "Не вдалося прив'язати");
    },
    [pickedFood],
  );

  return {
    barcode,
    setBarcode,
    barcodeStatus,
    setBarcodeStatus,
    scannerOpen,
    setScannerOpen,
    handleBarcodeLookup,
    handleBarcodeBind,
  };
}
