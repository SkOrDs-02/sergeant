import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  safeReadStringSS,
  safeRemoveSS,
  safeWriteSS,
} from "@shared/lib/storage/storage";
import { useFizrukRestSound } from "../hooks/useFizrukRestSound";
import { useRestTimerCountdown } from "../hooks/useWorkoutsLifecycle";
import type { RestTimerState } from "../hooks/useFizrukRestSound";
import { RestTimerContext } from "./RestTimerContext";
import { trackFizrukRestTimerDone } from "../lib/workoutTelemetry";
import { notifyRestFinishedIfHidden } from "../lib/restTimerNotification";
import {
  readPersistedRestTimer,
  REST_TIMER_SESSION_KEY,
  serializeRestTimer,
} from "../lib/restTimer";

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
 *   - the end-of-rest sound + haptic (via `useFizrukRestSound`), plus a local
 *     Notification when the tab is hidden and permission is already granted
 *   - the sessionStorage slot (`REST_TIMER_SESSION_KEY`), so a reload or a
 *     remount of the provider resumes the same `endsAt` (audit `logic-10`)
 *
 * Children consume state via `useRestTimer()`.
 */
export function RestTimerProvider({ children }: RestTimerProviderProps) {
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(() =>
    readPersistedRestTimer(safeReadStringSS(REST_TIMER_SESSION_KEY)),
  );

  // Слот пишемо лише на зміну `endsAt`/`total` (старт, ±15 с, скасування,
  // кінець), а не на кожен тік: `remaining` похідне від годинника.
  const persistedEndsAt = restTimer?.endsAt ?? null;
  const persistedTotal = restTimer?.total ?? null;
  useEffect(() => {
    if (persistedEndsAt === null || persistedTotal === null) {
      safeRemoveSS(REST_TIMER_SESSION_KEY);
      return;
    }
    safeWriteSS(
      REST_TIMER_SESSION_KEY,
      serializeRestTimer({ endsAt: persistedEndsAt, total: persistedTotal }),
    );
  }, [persistedEndsAt, persistedTotal]);

  const { markCompletedNaturally } = useFizrukRestSound(restTimer);
  const handleCompletedNaturally = useCallback(() => {
    markCompletedNaturally();
    // Прихована вкладка й уже наданий дозвіл — локальне сповіщення (logic-10).
    notifyRestFinishedIfHidden();
    trackFizrukRestTimerDone("completed");
  }, [markCompletedNaturally]);
  useRestTimerCountdown(restTimer, setRestTimer, handleCompletedNaturally);

  return (
    <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
      {children}
    </RestTimerContext.Provider>
  );
}
