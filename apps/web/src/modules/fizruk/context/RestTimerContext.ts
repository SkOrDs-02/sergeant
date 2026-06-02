import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RestTimerState } from "../hooks/useFizrukRestSound";

export interface RestTimerContextValue {
  restTimer: RestTimerState | null;
  setRestTimer: Dispatch<SetStateAction<RestTimerState | null>>;
}

export const RestTimerContext = createContext<RestTimerContextValue | null>(
  null,
);

/**
 * Consume the fizruk-level rest timer context.
 *
 * - `restTimer`   — current state (`null` when no rest is active)
 * - `setRestTimer` — start (`{ remaining, total }`) or clear (`null`)
 *
 * Throws if called outside `<RestTimerProvider>`.
 */
export function useRestTimer(): RestTimerContextValue {
  const ctx = useContext(RestTimerContext);
  if (!ctx) {
    throw new Error("useRestTimer must be used within <RestTimerProvider>");
  }
  return ctx;
}
