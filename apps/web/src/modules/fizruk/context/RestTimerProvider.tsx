import { useState, type ReactNode } from "react";
import { useFizrukRestSound } from "../hooks/useFizrukRestSound";
import { useRestTimerCountdown } from "../hooks/useWorkoutsLifecycle";
import type { RestTimerState } from "../hooks/useFizrukRestSound";
import { RestTimerContext } from "./RestTimerContext";

interface RestTimerProviderProps {
  children: ReactNode;
}

/**
 * Module-level rest-timer provider — mounted at `FizrukApp` level (above the
 * page router) so the countdown interval and end-cue survive navigation between
 * Огляд / Атлас / Тренування without being destroyed.
 *
 * Owns:
 *   - `restTimer` state (active or null)
 *   - the `setInterval`-based countdown (via `useRestTimerCountdown`)
 *   - the end-of-rest sound + haptic (via `useFizrukRestSound`)
 *
 * Children consume state via `useRestTimer()`.
 */
export function RestTimerProvider({ children }: RestTimerProviderProps) {
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);

  const { markCompletedNaturally } = useFizrukRestSound(restTimer);
  useRestTimerCountdown(restTimer, setRestTimer, markCompletedNaturally);

  return (
    <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
      {children}
    </RestTimerContext.Provider>
  );
}
