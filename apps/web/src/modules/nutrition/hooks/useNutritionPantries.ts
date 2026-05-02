import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { nutritionApi } from "@shared/api";
import { formatNutritionError } from "../lib/nutritionErrors";
import { mergeItems } from "../lib/mergeItems";
import {
  loadActivePantryId,
  loadPantries,
  makeDefaultPantry,
  persistPantries,
  updatePantry,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_ACTIVE_PANTRY_KEY,
} from "../lib/nutritionStorage";
import {
  normalizeFoodName,
  parseLoosePantryText,
  type PantryItem,
} from "../lib/pantryTextParser";
import type {
  PantryForm,
  PantryFormMode,
} from "../components/PantryManagerSheet";

export interface UseNutritionPantriesParams {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setErr: Dispatch<SetStateAction<string>>;
  setStatusText: Dispatch<SetStateAction<string>>;
}

interface ParsePantryVariables {
  pantryId: string;
  text: string;
}

export function useNutritionPantries({
  setBusy,
  setErr,
  setStatusText,
}: UseNutritionPantriesParams) {
  const [pantries, setPantries] = useState(() =>
    loadPantries(NUTRITION_PANTRIES_KEY, NUTRITION_ACTIVE_PANTRY_KEY),
  );
  const [activePantryId, setActivePantryId] = useState(() =>
    loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY),
  );

  const activePantry = useMemo(() => {
    const arr = Array.isArray(pantries) ? pantries : [];
    return (
      arr.find((p) => p.id === activePantryId) || arr[0] || makeDefaultPantry()
    );
  }, [pantries, activePantryId]);

  const pantryText = activePantry?.text || "";
  const pantryItems = useMemo(
    () => (Array.isArray(activePantry?.items) ? activePantry.items : []),
    [activePantry?.items],
  );
  const [newItemName, setNewItemName] = useState("");

  const [pantryManagerOpen, setPantryManagerOpen] = useState(false);

  const [pantryForm, setPantryForm] = useState<PantryForm>(() => ({
    mode: "create",
    name: "",
    err: "",
  }));

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [itemEdit, setItemEdit] = useState(() => ({
    open: false,
    idx: -1,
    name: "",
    qty: "",
    unit: "",
    err: "",
  }));

  const [pantryStorageErr, setPantryStorageErr] = useState("");

  useEffect(() => {
    const ok = persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      pantries,
      activePantryId,
    );
    setPantryStorageErr(ok ? "" : "Не вдалося зберегти дані складів.");
  }, [pantries, activePantryId]);

  const pantrySummary = useMemo(() => {
    if (!Array.isArray(pantryItems) || pantryItems.length === 0) return "—";
    return pantryItems
      .slice(0, 12)
      .map((x) => x.name)
      .filter(Boolean)
      .join(", ");
  }, [pantryItems]);

  const effectiveItems = useMemo(() => {
    if (Array.isArray(pantryItems) && pantryItems.length > 0)
      return pantryItems;
    const raw = pantryText.trim();
    if (!raw) return [];
    return parseLoosePantryText(raw);
  }, [pantryItems, pantryText]);

  const upsertItem = (raw: string | PantryItem | PantryItem[]) => {
    const parsed = parseLoosePantryText(raw);
    if (!parsed.length) return;
    setPantries((cur) =>
      updatePantry(cur, activePantryId, (p) => ({
        ...p,
        items: mergeItems(Array.isArray(p.items) ? p.items : [], parsed),
      })),
    );
  };

  const removeItem = (name: string) => {
    const n = normalizeFoodName(name);
    if (!n) return;
    setPantries((cur) =>
      updatePantry(cur, activePantryId, (p) => ({
        ...p,
        items: (Array.isArray(p.items) ? p.items : []).filter(
          (x) => normalizeFoodName(x?.name) !== n,
        ),
      })),
    );
  };

  const ensureStructuredItems = () => {
    if (pantryItems.length > 0) return true;
    if (effectiveItems.length === 0) return false;
    setPantries((cur) =>
      updatePantry(cur, activePantryId, (p) => ({
        ...p,
        items: effectiveItems.map((x) => ({
          name: normalizeFoodName(x?.name),
          qty: x?.qty ?? null,
          unit: x?.unit ?? null,
          notes: x?.notes ?? null,
        })),
      })),
    );
    return true;
  };

  const editItemAt = (idx: number) => {
    if (!ensureStructuredItems()) return;
    const cur = (Array.isArray(activePantry?.items) ? activePantry.items : [])[
      idx
    ];
    if (!cur) return;
    const curName = normalizeFoodName(cur.name) || "Продукт";
    setItemEdit({
      open: true,
      idx,
      name: curName,
      qty: cur.qty != null ? String(cur.qty) : "",
      unit: cur.unit != null ? String(cur.unit) : "",
      err: "",
    });
  };

  const removeItemAt = (idx: number) => {
    if (!ensureStructuredItems()) return;
    setPantries((curPantries) =>
      updatePantry(curPantries, activePantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        items.splice(idx, 1);
        return { ...p, items };
      }),
    );
  };

  const beginRenamePantry = () => {
    const curName = String(activePantry?.name || "").trim() || "Склад";
    setPantryForm({ mode: "rename", name: curName, err: "" });
    setPantryManagerOpen(true);
  };

  const beginCreatePantry = () => {
    setPantryForm({ mode: "create", name: "", err: "" });
    setPantryManagerOpen(true);
  };

  const beginDeletePantry = () => {
    setConfirmDeleteOpen(true);
  };

  const onSavePantryForm = (name: string, mode: PantryFormMode) => {
    if (mode === "rename") {
      setPantries((cur) =>
        updatePantry(cur, activePantryId, (p) => ({ ...p, name })),
      );
    } else {
      const id = `p_${Date.now()}`;
      setPantries((cur) => [
        ...(Array.isArray(cur) ? cur : []),
        { id, name, items: [], text: "" },
      ]);
      setActivePantryId(id);
    }
    setPantryManagerOpen(false);
  };

  const onConfirmDeletePantry = () => {
    const arr = Array.isArray(pantries) ? pantries : [];
    if (arr.length <= 1) return;
    const next = arr.filter((p) => p.id !== activePantryId);
    setPantries(next);
    setActivePantryId(next[0]?.id || "home");
    setConfirmDeleteOpen(false);
    setPantryManagerOpen(false);
  };

  const onSaveItemEdit = (
    idx: number,
    qty: number | string | null,
    unit: string | null,
  ) => {
    setPantries((curPantries) =>
      updatePantry(curPantries, activePantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const item = items[idx];
        if (!item) return p;
        const qtyNum = qty == null || qty === "" ? null : Number(qty);
        const normalizedQty =
          qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : null;
        items[idx] = { ...item, qty: normalizedQty, unit };
        return { ...p, items };
      }),
    );
    setItemEdit((s) => ({ ...s, open: false }));
  };

  const consumePantryItem = (name: string, gramsConsumed: number) => {
    const norm = normalizeFoodName(name);
    if (!norm) return;
    setPantries((cur) =>
      updatePantry(cur, activePantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const idx = items.findIndex((x) => normalizeFoodName(x?.name) === norm);
        if (idx < 0) return p;
        const item = items[idx];
        const qty = Number(item.qty);
        if (!Number.isFinite(qty) || qty <= 0) return p;
        const unit = String(item.unit || "г")
          .toLowerCase()
          .trim();
        // Only deduct from mass-based units (грами/кілограми). Inventory in
        // штуках, мл/л, чи будь-яких інших одиницях не має одно-однозначної
        // конверсії з "грамів спожитого", тому лишаємо позицію як є —
        // інакше "200г молока" з'їдало б всю пляшку "2 л" (див. H2 з аудиту).
        if (unit !== "г" && unit !== "кг") return p;
        const remaining =
          unit === "кг" ? qty - gramsConsumed / 1000 : qty - gramsConsumed;
        if (remaining <= 0) {
          items.splice(idx, 1);
        } else {
          items[idx] = { ...item, qty: Math.round(remaining * 10) / 10 };
        }
        return { ...p, items };
      }),
    );
  };

  const setPantryText = (text: string) => {
    setPantries((cur) =>
      updatePantry(cur, activePantryId, (p) => ({ ...p, text })),
    );
  };

  const parsePantryMutation = useMutation({
    mutationFn: ({ pantryId, text }: ParsePantryVariables) => {
      if (!text) throw new Error("Надиктуй/впиши список продуктів.");
      return nutritionApi
        .parsePantry({ text, locale: "uk-UA" })
        .then((data) => ({
          data,
          pantryId,
        }));
    },
    onMutate: () => {
      setBusy(true);
      setErr("");
      setStatusText("Розбираю список…");
    },
    onSuccess: ({ data, pantryId }) => {
      const next = Array.isArray(data?.items) ? data.items : [];
      setPantries((cur) =>
        updatePantry(cur, pantryId, (p) => ({
          ...p,
          items: mergeItems(p.items, next),
          text: "",
        })),
      );
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Помилка розбору списку"));
    },
    onSettled: () => {
      setStatusText("");
      setBusy(false);
    },
  });

  const parsePantry = useCallback(
    () =>
      parsePantryMutation.mutate({
        pantryId: activePantryId,
        text: pantryText.trim(),
      }),
    [parsePantryMutation, activePantryId, pantryText],
  );

  return {
    pantries,
    activePantryId,
    setActivePantryId,
    activePantry,
    pantryText,
    pantryItems,
    newItemName,
    setNewItemName,
    pantryManagerOpen,
    setPantryManagerOpen,
    pantryForm,
    setPantryForm,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    itemEdit,
    setItemEdit,
    upsertItem,
    removeItem,
    editItemAt,
    removeItemAt,
    beginRenamePantry,
    beginCreatePantry,
    beginDeletePantry,
    onSavePantryForm,
    onConfirmDeletePantry,
    onSaveItemEdit,
    setPantryText,
    effectiveItems,
    pantrySummary,
    parsePantry,
    pantryStorageErr,
    consumePantryItem,
  };
}
