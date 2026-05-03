import { useCallback, useRef, useState } from "react";
import { showUndoToast } from "@shared/lib/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplit,
} from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";

// Ukrainian 1 / 2-4 / 5+ noun plural for "операція" (operation/transaction).
// Inline because the only consumers are the batch-undo toasts below — if a
// third caller appears, promote to `@shared/lib/pluralize`.
function pluralizeOps(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "операції";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return "операцій";
  return "операцій";
}

export interface UseTransactionSelectionParams {
  hiddenTxIds: string[];
  excludedStatTxIds: string[] | undefined;
  txCategories: TxCategoriesMap;
  hideTx: (id: string) => void;
  toggleExcludeFromStats: (id: string) => void;
  overrideCategory: (id: string, catId: string | null) => void;
  setSplitTx: (id: string, splits: TxSplit[]) => void;
  removeManualExpense: ((id: string) => void) | undefined;
  addManualExpense: ((expense: ManualExpense) => void) | undefined;
  onEditManualExpense: ((id: string) => void) | undefined;
  toast: ReturnType<typeof useToast>;
}

export interface UseTransactionSelectionResult {
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  exitSelectMode: () => void;
  batchCatPicker: boolean;
  setBatchCatPicker: (v: boolean) => void;
  applyBatchCategory: (catId: string) => void;
  applyBatchHide: () => void;
  applyBatchExclude: () => void;
  /** Stable handler: TxRow → swipe-hide on real (non-manual) transactions. */
  stableSwipeHideTx: (id: string) => void;
  /** Stable handler: TxRow → swipe-delete on a manual expense. */
  stableSwipeDeleteManual: (tx: Transaction) => void;
  /** Stable handler: TxRow → "edit manual" inline action. */
  stableOnEditManual: (manualId?: string) => void;
  /** Stable handler: TxRow → "hide" inline action. */
  stableHideTx: (id: string) => void;
  /** Stable handler: TxRow → category override picker. */
  stableOverrideCategory: (id: string, catId: string | null) => void;
  /** Stable handler: TxRow → split editor confirm. */
  stableSetSplitTx: (id: string, splits: TxSplit[]) => void;
}

/**
 * State + side-effect handlers for batch selection on the Transactions
 * page. Owns:
 *   - `selectMode` toggle and `selectedIds` set
 *   - batch category / hide / exclude actions with undo toasts
 *   - stable identity wrappers around row-level callbacks so memoized
 *     `<TxListItem>` rows don't re-render whenever an unrelated parent
 *     state changes (the wrappers read the latest fn from `handlersRef`)
 */
export function useTransactionSelection({
  hiddenTxIds,
  excludedStatTxIds,
  txCategories,
  hideTx,
  toggleExcludeFromStats,
  overrideCategory,
  setSplitTx,
  removeManualExpense,
  addManualExpense,
  onEditManualExpense,
  toast,
}: UseTransactionSelectionParams): UseTransactionSelectionResult {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchCatPicker, setBatchCatPicker] = useState(false);

  // Stable refs for handlers used by memoized row — avoids re-rendering all
  // visible rows whenever any unrelated parent state changes.
  const handlersRef = useRef({
    hideTx,
    overrideCategory,
    setSplitTx,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  });
  handlersRef.current = {
    hideTx,
    overrideCategory,
    setSplitTx,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  };

  // useCallback — `toggleSelect` передається у кожен рядок вибору.
  // Сталий reference спільно з React.memo(TxRow)/обгорткою чекбокса дає
  // змогу дочірнім елементам не перерендерюватись при оновленні батька.
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stableHideTx = useCallback(
    (id: string) => handlersRef.current.hideTx(id),
    [],
  );
  const stableOverrideCategory = useCallback(
    (id: string, catId: string | null) =>
      handlersRef.current.overrideCategory(id, catId),
    [],
  );
  const stableSetSplitTx = useCallback(
    (id: string, splits: TxSplit[]) =>
      handlersRef.current.setSplitTx?.(id, splits),
    [],
  );
  const stableOnEditManual = useCallback((manualId?: string) => {
    const fn = handlersRef.current.onEditManualExpense;
    if (typeof fn === "function" && typeof manualId === "string") fn(manualId);
  }, []);
  const stableSwipeHideTx = useCallback(
    (id: string) => handlersRef.current.hideTx(id),
    [],
  );
  const stableSwipeDeleteManual = useCallback((tx: Transaction) => {
    const { removeManualExpense, addManualExpense, toast } =
      handlersRef.current;
    if (!removeManualExpense || !addManualExpense) return;
    const manualId = tx.manualId ?? tx._manualId;
    if (!manualId) return;
    // `_category` is a legacy back-compat field surfaced by the
    // `manual: true` row in `manualExpenseToTransaction`. It is not on
    // the canonical `Transaction` interface but the runtime payload may
    // still carry it — read it through an unknown cast for the snapshot.
    const legacyCategory = (tx as { _category?: unknown })._category;
    const snapshot: ManualExpense = {
      id: String(manualId),
      date: tx.time
        ? new Date(tx.time * 1000).toISOString()
        : new Date().toISOString(),
      description: String(tx.description || ""),
      amount: Math.abs(Number(tx.amount || 0) / 100),
      category: String(legacyCategory || "інше"),
    };
    removeManualExpense(String(manualId));
    showUndoToast(toast, {
      msg: "Витрату видалено",
      onUndo: () => addManualExpense(snapshot),
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBatchCatPicker(false);
  }, []);

  // useCallback — використовується у batch-панелі; стабільний handler
  // дозволяє безпечно мемоїзувати toolbar у майбутньому.
  const applyBatchCategory = useCallback(
    (catId: string) => {
      // Snapshot the previous override (or `null` for "default category")
      // for every selected id so the undo can restore each row to whatever
      // category it had before the batch — including rows that previously
      // had no override.
      const prev: Array<[string, string | null]> = [];
      for (const id of selectedIds) {
        prev.push([id, txCategories?.[id] ?? null]);
      }
      for (const [id] of prev) overrideCategory(id, catId);
      exitSelectMode();
      if (prev.length > 0) {
        showUndoToast(toast, {
          msg: `Категорію змінено для ${prev.length} ${pluralizeOps(prev.length)}`,
          onUndo: () => {
            for (const [id, prevCat] of prev) overrideCategory(id, prevCat);
          },
        });
      }
    },
    [selectedIds, overrideCategory, exitSelectMode, txCategories, toast],
  );

  const applyBatchHide = useCallback(() => {
    // Capture which ids were *newly* hidden so the undo doesn't accidentally
    // un-hide rows the user had already hidden manually before entering
    // select-mode. `hideTx` is a toggle, so calling it again on the same id
    // restores visibility.
    const hiddenNow: string[] = [];
    for (const id of selectedIds) {
      if (!hiddenTxIds.includes(id)) {
        hideTx(id);
        hiddenNow.push(id);
      }
    }
    exitSelectMode();
    if (hiddenNow.length > 0) {
      showUndoToast(toast, {
        msg: `Приховано ${hiddenNow.length} ${pluralizeOps(hiddenNow.length)}`,
        onUndo: () => {
          for (const id of hiddenNow) hideTx(id);
        },
      });
    }
  }, [selectedIds, hiddenTxIds, hideTx, exitSelectMode, toast]);

  const applyBatchExclude = useCallback(() => {
    // Same toggle/snapshot pattern as applyBatchHide — capture the ids that
    // were newly excluded and call `toggleExcludeFromStats` again on undo.
    const excludedNow: string[] = [];
    for (const id of selectedIds) {
      if (!(excludedStatTxIds || []).includes(id)) {
        toggleExcludeFromStats(id);
        excludedNow.push(id);
      }
    }
    exitSelectMode();
    if (excludedNow.length > 0) {
      showUndoToast(toast, {
        msg: `Виключено зі статистики: ${excludedNow.length} ${pluralizeOps(excludedNow.length)}`,
        onUndo: () => {
          for (const id of excludedNow) toggleExcludeFromStats(id);
        },
      });
    }
  }, [
    selectedIds,
    excludedStatTxIds,
    toggleExcludeFromStats,
    exitSelectMode,
    toast,
  ]);

  return {
    selectMode,
    setSelectMode,
    selectedIds,
    toggleSelect,
    exitSelectMode,
    batchCatPicker,
    setBatchCatPicker,
    applyBatchCategory,
    applyBatchHide,
    applyBatchExclude,
    stableSwipeHideTx,
    stableSwipeDeleteManual,
    stableOnEditManual,
    stableHideTx,
    stableOverrideCategory,
    stableSetSplitTx,
  };
}
