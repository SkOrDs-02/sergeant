import { useEffect, useRef } from "react";
import { consumePresetPrefill } from "../../../core/onboarding/presetPrefill";
import type { FinykPage } from "../lib/finykRouter";

export interface UseFinykAddExpensePwaActionArgs {
  pwaAction: string | null | undefined;
  onPwaActionConsumed?: (() => void) | undefined;
  navigate: (p: FinykPage | string) => void;
  setEditingManualExpenseId: (id: string | null) => void;
  setQuickAddCategory: (cat: string | null) => void;
  setQuickAddDescription: (desc: string | null) => void;
  setShowExpenseSheet: (open: boolean) => void;
}

/**
 * Handles the `pwaAction === "add_expense"` deep-link: routes to
 * `transactions`, consumes the FTUX preset prefill, and opens the
 * ManualExpenseSheet in "create" mode.
 *
 * Stale `navigate`/`setX` references are captured by ref so the effect
 * only re-runs on `pwaAction` flips.
 */
export function useFinykAddExpensePwaAction({
  pwaAction,
  onPwaActionConsumed,
  navigate,
  setEditingManualExpenseId,
  setQuickAddCategory,
  setQuickAddDescription,
  setShowExpenseSheet,
}: UseFinykAddExpensePwaActionArgs): void {
  const handlersRef = useRef({
    navigate,
    setEditingManualExpenseId,
    setQuickAddCategory,
    setQuickAddDescription,
    setShowExpenseSheet,
    onPwaActionConsumed,
  });
  handlersRef.current = {
    navigate,
    setEditingManualExpenseId,
    setQuickAddCategory,
    setQuickAddDescription,
    setShowExpenseSheet,
    onPwaActionConsumed,
  };

  useEffect(() => {
    if (pwaAction !== "add_expense") return;
    const h = handlersRef.current;
    const prefill = consumePresetPrefill("finyk");
    h.navigate("transactions");
    h.setEditingManualExpenseId(null);
    h.setQuickAddCategory(
      typeof prefill?.["category"] === "string" ? prefill["category"] : null,
    );
    h.setQuickAddDescription(
      typeof prefill?.["description"] === "string"
        ? prefill["description"]
        : null,
    );
    h.setShowExpenseSheet(true);
    h.onPwaActionConsumed?.();
  }, [pwaAction]);
}
