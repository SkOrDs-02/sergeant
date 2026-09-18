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
export interface RestTimerOverlayConnectedProps {
  /**
   * У сесійному режимі (`/fizruk/workout/<id>`) відлік малює докована
   * панель `SessionDock`, тож пігулку ховаємо — але НЕ демонтуємо: озвучення
   * «відпочинок почався / завершено» лишається в одному місці.
   */
  hidden?: boolean | undefined;
}

export function RestTimerOverlayConnected({
  hidden,
}: RestTimerOverlayConnectedProps = {}) {
  const { restTimer, setRestTimer } = useRestTimer();
  return (
    <RestTimerOverlay
      restTimer={restTimer}
      hidden={hidden}
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
