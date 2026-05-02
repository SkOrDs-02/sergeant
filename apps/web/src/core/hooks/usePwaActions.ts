import { useCallback, useState } from "react";
import { safeWriteLS } from "@shared/lib/storage";
import { PWA_ACTION_KEY, consumePwaAction } from "../app/pwaAction";

export type PwaAction =
  | "add_expense"
  | "start_workout"
  | "add_meal"
  | "add_meal_photo"
  | "add_habit";

const VALID_ACTIONS = new Set<PwaAction>([
  "add_expense",
  "start_workout",
  "add_meal",
  "add_meal_photo",
  "add_habit",
]);

function isPwaAction(value: string | null): value is PwaAction {
  return value != null && (VALID_ACTIONS as Set<string>).has(value);
}

export interface PwaActions {
  pwaAction: PwaAction | null;
  setPwaAction: (value: PwaAction | null) => void;
  clearPwaAction: () => void;
  validActions: Set<PwaAction>;
}

export function usePwaActions(searchParams: URLSearchParams): PwaActions {
  const [pwaAction, setPwaAction] = useState<PwaAction | null>(() => {
    const fromUrl = searchParams.get("action");
    if (isPwaAction(fromUrl)) {
      safeWriteLS(PWA_ACTION_KEY, fromUrl);
      return fromUrl;
    }
    const consumed = consumePwaAction();
    return isPwaAction(consumed) ? consumed : null;
  });

  const clearPwaAction = useCallback(() => setPwaAction(null), []);

  return {
    pwaAction,
    setPwaAction,
    clearPwaAction,
    validActions: VALID_ACTIONS,
  };
}
