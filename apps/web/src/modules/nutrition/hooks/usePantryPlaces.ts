/**
 * Керування самими МІСЦЯМИ (створити / перейменувати / видалити) плюс
 * розкладання запасу по них. Винесено з `useNutritionPantries` окремим
 * модулем через Hard Rule #18 (`max-lines: 600`): позиції і місця — дві
 * різні сутності, і різати доречно саме тут.
 *
 * Позиції лишаються в `useNutritionPantries`: цей хук нічого не знає про
 * злиття, списання й журнал руху окремої позиції.
 */
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  canonicalFoodKey,
  isKnownStoragePlace,
  matchFoodName,
  planRedistribution,
  redistributePantries,
  updatePantry,
  type Pantry,
} from "@sergeant/nutrition-domain";
import { appendNutritionPantryEvent } from "../lib/nutritionStorage";
import type {
  PantryForm,
  PantryFormMode,
} from "../components/PantryManagerSheet";

interface UsePantryPlacesParams {
  pantries: Pantry[];
  setPantries: Dispatch<SetStateAction<Pantry[]>>;
  setPlaceFilter: Dispatch<SetStateAction<string | null>>;
}

export function usePantryPlaces({
  pantries,
  setPantries,
  setPlaceFilter,
}: UsePantryPlacesParams) {
  const [pantryManagerOpen, setPantryManagerOpen] = useState(false);

  // UX-roast 2026-05 §3.4: дефолтний mode `idle` — поле назви не
  // показується, доки людина явно не натиснула дію. Це робить кнопки
  // видимо реактивними.
  const [pantryForm, setPantryForm] = useState<PantryForm>(() => ({
    mode: "idle",
    name: "",
    err: "",
    targetId: null,
  }));

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const beginRenamePantry = (id: string) => {
    const target = pantries.find((p) => p.id === id);
    setPantryForm({
      mode: "rename",
      name: String(target?.name || "").trim() || "Комора",
      err: "",
      targetId: id,
    });
    setPantryManagerOpen(true);
  };

  const beginCreatePantry = () => {
    setPantryForm({ mode: "create", name: "", err: "", targetId: null });
    setPantryManagerOpen(true);
  };

  /**
   * Видалити можна лише власне місце. Три відомі — це адреси, куди
   * автовизначення кладе результат: без морозилки пельмені їхали б у
   * неіснуючий id, а вгадування мовчки перестало б працювати.
   */
  const beginDeletePantry = (id: string) => {
    if (isKnownStoragePlace(id)) return;
    setDeleteTargetId(id);
    setConfirmDeleteOpen(true);
  };

  const onSavePantryForm = (
    name: string,
    mode: Exclude<PantryFormMode, "idle">,
    targetId?: string | null,
  ) => {
    if (mode === "rename") {
      const id = targetId ?? pantryForm.targetId;
      if (id) {
        setPantries((cur) => updatePantry(cur, id, (p) => ({ ...p, name })));
      }
    } else {
      setPantries((cur) => [
        ...(Array.isArray(cur) ? cur : []),
        { id: `p_${Date.now()}`, name, items: [], text: "" },
      ]);
    }
    setPantryForm({ mode: "idle", name: "", err: "", targetId: null });
    setPantryManagerOpen(false);
  };

  const onConfirmDeletePantry = () => {
    const id = deleteTargetId;
    setConfirmDeleteOpen(false);
    setDeleteTargetId(null);
    if (!id || isKnownStoragePlace(id)) return;
    setPantries((cur) => cur.filter((p) => p.id !== id));
    setPlaceFilter((cur) => (cur === id ? null : cur));
  };

  /** Що переїде, якщо натиснути «розкласти по місцях». Порожній = нічого. */
  const redistributePlan = useMemo(
    () => planRedistribution(pantries),
    [pantries],
  );

  /**
   * Виконує рівно те, що показав план. Кожен переїзд лишає в старому
   * місці чекпойнт на 0: комора це журнал (ADR-0077), і мовчазний перенос
   * зробив би її залишок неправдою.
   */
  const applyRedistribute = () => {
    if (redistributePlan.length === 0) return;
    setPantries((cur) => redistributePantries(cur));
    for (const move of redistributePlan) {
      const key = matchFoodName(move.name);
      if (!key) continue;
      appendNutritionPantryEvent({
        id: null,
        pantryId: move.fromId,
        itemId: null,
        itemKey: canonicalFoodKey(key),
        kind: "adjust",
        deltaQty: null,
        absQty: 0,
        unit: null,
        source: "manual",
        mealId: null,
      });
    }
  };

  return {
    pantryManagerOpen,
    setPantryManagerOpen,
    pantryForm,
    setPantryForm,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    beginRenamePantry,
    beginCreatePantry,
    beginDeletePantry,
    onSavePantryForm,
    onConfirmDeletePantry,
    redistributePlan,
    applyRedistribute,
  };
}
