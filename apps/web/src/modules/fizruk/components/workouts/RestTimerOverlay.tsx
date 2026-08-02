import { formatRestClock } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";

interface RestTimerState {
  remaining: number;
  total: number;
}

interface RestTimerOverlayProps {
  restTimer: RestTimerState | null | undefined;
  onCancel: () => void;
  onAdjust?: (seconds: number) => void;
}

export function RestTimerOverlay({
  restTimer,
  onCancel,
  onAdjust,
}: RestTimerOverlayProps) {
  const rt = messages.fizruk.restTimer;
  if (!restTimer) return null;

  const pct = restTimer.total > 0 ? restTimer.remaining / restTimer.total : 0;
  const urgent = restTimer.remaining <= 10 && restTimer.remaining > 0;

  return (
    <div
      className="fixed inset-x-0 z-55 px-3 pointer-events-none fizruk-above-tabbar"
      role="timer"
      aria-live="polite"
      aria-label={`Відпочинок, залишилось ${restTimer.remaining} секунд`}
    >
      <div
        className={
          "pointer-events-auto ml-auto flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-panel px-2 py-1.5 shadow-float fizruk-sheet " +
          (urgent ? "border-warning/60" : "border-line")
        }
      >
        <div className="flex items-center gap-2 min-w-0 px-1">
          <div className="relative w-8 h-8 shrink-0">
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
          <span
            className={
              "text-style-label tabular-nums whitespace-nowrap " +
              (urgent ? "text-warning-strong dark:text-warning" : "text-text")
            }
          >
            {formatRestClock(restTimer.remaining)}
          </span>
        </div>
        {onAdjust &&
          [-30, -15, 15, 30].map((seconds) => (
            <button
              key={seconds}
              type="button"
              className="min-h-[44px] min-w-[44px] rounded-full px-2 text-xs font-semibold text-muted hover:bg-panelHi hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
              onClick={() => onAdjust(seconds)}
              aria-label={`${seconds > 0 ? rt.add : rt.subtract} ${Math.abs(seconds)} ${rt.secondsSuffix}`}
            >
              {seconds > 0 ? "+" : "−"}
              {Math.abs(seconds)}
            </button>
          ))}
        <button
          className="min-h-[44px] rounded-full px-3 text-xs font-semibold text-danger-strong dark:text-danger hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
          type="button"
          onClick={onCancel}
        >
          {rt.skip}
        </button>
      </div>
    </div>
  );
}
