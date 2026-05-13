import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { formatRestClock } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";

interface RestTimerState {
  remaining: number;
  total: number;
}

interface RestTimerOverlayProps {
  restTimer: RestTimerState | null | undefined;
  onCancel: () => void;
}

export function RestTimerOverlay({
  restTimer,
  onCancel,
}: RestTimerOverlayProps) {
  if (!restTimer) return null;

  const pct = restTimer.total > 0 ? restTimer.remaining / restTimer.total : 0;
  const urgent = restTimer.remaining <= 10 && restTimer.remaining > 0;

  return (
    <div
      className="fixed left-0 right-0 z-55 px-4 pointer-events-none fizruk-above-tabbar"
      role="timer"
      aria-live="polite"
      aria-label={`Відпочинок, залишилось ${restTimer.remaining} секунд`}
    >
      <div
        className={
          "pointer-events-auto max-w-4xl mx-auto flex items-center justify-between gap-3 rounded-2xl border bg-panel px-4 py-3 shadow-float fizruk-sheet " +
          (urgent ? "border-warning/60" : "border-line")
        }
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                className="text-line/40"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                className={urgent ? "text-warning" : "text-success"}
                strokeWidth="3"
                strokeDasharray={`${94.2 * pct} 94.2`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s linear" }}
              />
            </svg>
          </div>
          <div>
            <SectionHeading as="div" size="xs" variant="fizruk">
              {messages.fizruk.workoutRest}
            </SectionHeading>
            <div
              className={
                "text-style-hero tabular-nums leading-tight " +
                (urgent ? "text-warning" : "text-text")
              }
            >
              {formatRestClock(restTimer.remaining)}
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-11 min-h-[44px] px-4"
          type="button"
          onClick={onCancel}
        >
          {messages.actions.cancel}
        </Button>
      </div>
    </div>
  );
}
