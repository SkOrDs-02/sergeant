import { useRestTimer } from "../../context/RestTimerContext";
import { RestTimerOverlay } from "./RestTimerOverlay";
import { trackFizrukRestTimerDone } from "../../lib/workoutTelemetry";

/**
 * Thin connector that pulls `restTimer` / `setRestTimer` from the fizruk-level
 * `RestTimerContext` and passes them into the presentational `RestTimerOverlay`.
 *
 * Rendered once at `FizrukApp` level (above the page router) so the overlay
 * stays visible while the user navigates between fizruk pages during a rest
 * countdown (audit-06 F3).
 */
export function RestTimerOverlayConnected() {
  const { restTimer, setRestTimer } = useRestTimer();
  return (
    <RestTimerOverlay
      restTimer={restTimer}
      onCancel={() => {
        trackFizrukRestTimerDone("skipped");
        setRestTimer(null);
      }}
      onAdjust={(seconds) =>
        setRestTimer((current) => {
          if (!current) return null;
          const remaining = Math.max(1, current.remaining + seconds);
          return {
            remaining,
            total: Math.max(current.total, remaining),
          };
        })
      }
    />
  );
}
