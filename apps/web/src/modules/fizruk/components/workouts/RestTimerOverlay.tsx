import { useEffect, useRef } from "react";
import { formatRestClock } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";

interface RestTimerState {
  remaining: number;
  total: number;
}

interface RestTimerOverlayProps {
  restTimer: RestTimerState | null | undefined;
  onCancel: () => void;
  onAdjust?: (seconds: number) => void;
}

/**
 * Rest-timer pill shown above the tab bar while a set's rest period runs.
 *
 * A11y (fixed 2026-08-08): `role="timer"` used to sit on the whole pill
 * together with `aria-live="polite"` and an `aria-label` that embedded
 * `restTimer.remaining` — i.e. a label that changes every second inside a
 * live region, so a screen reader read the remaining seconds out loud
 * continuously for the entire rest period. `role="timer"` alone does not
 * require continuous announcement; the visual countdown still ticks every
 * second (sighted users), but screen-reader users now only hear two
 * milestones via `useAnnounce()` — "rest started" and "rest
 * finished/skipped" — plus an optional "ending soon" nudge at the same
 * `urgent` threshold (≤10s) already used for the visual warning color.
 */
export function RestTimerOverlay({
  restTimer,
  onCancel,
  onAdjust,
}: RestTimerOverlayProps) {
  const rt = messages.fizruk.restTimer;
  const { announce } = useAnnounce();
  const isActive = restTimer != null;
  const endingSoonAnnouncedRef = useRef(false);

  // Milestone announcements: fires exactly once when a rest period starts
  // (false → true transition) and once when it ends, whether it counted
  // down naturally or the user pressed "Пропустити"/adjusted it away.
  // Deliberately keyed on `isActive` (not on `restTimer` itself) so
  // ±15/±30 adjustments — which replace the `restTimer` object but keep
  // it non-null — do NOT re-fire the "started" announcement.
  useEffect(() => {
    if (!restTimer) return;
    announce(`${rt.restingPrefix} ${restTimer.total} ${rt.secondsSuffix}`);
    return () => {
      announce(rt.finished);
    };
    // Keyed on `isActive` only (see comment above) — not exhaustive on
    // purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (!restTimer) {
      endingSoonAnnouncedRef.current = false;
      return;
    }
    if (restTimer.remaining <= 10 && !endingSoonAnnouncedRef.current) {
      endingSoonAnnouncedRef.current = true;
      announce(rt.endingSoon);
    }
  }, [restTimer, announce, rt.endingSoon]);

  if (!restTimer) return null;

  const pct = restTimer.total > 0 ? restTimer.remaining / restTimer.total : 0;
  const urgent = restTimer.remaining <= 10 && restTimer.remaining > 0;

  return (
    <div className="fixed inset-x-0 z-55 px-3 pointer-events-none fizruk-above-tabbar">
      <div
        className={
          "pointer-events-auto ml-auto flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-panel px-2 py-1.5 shadow-float fizruk-sheet " +
          (urgent ? "border-warning/60" : "border-line")
        }
      >
        {/*
          `role="timer"` scoped to the non-interactive dial+digits only
          (not the whole pill with its buttons) so the static aria-label
          below is the accessible name for the display, not for the
          adjustment/skip controls that follow it in the DOM.
        */}
        <div
          className="flex items-center gap-2 min-w-0 px-1"
          role="timer"
          aria-label={rt.ariaLabel}
        >
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
              className={
                "min-h-[44px] min-w-[44px] rounded-full px-2 text-xs font-semibold text-muted hover:bg-panelHi hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45" +
                // ±30 hidden below `sm` (640px) — on a 390px viewport the
                // full 6-control pill (dial+digits, 4 adjust buttons,
                // skip) overflows its `max-w-full` bound: content needed
                // ~366-374px against ~360-366px available, and since
                // nothing in the dial+digits flex item truncates, the
                // digits visually bled ~27px into the "−30" button
                // (live-measured, 390×844 viewport). Dropping ±30 frees
                // ~100px (2 buttons × 44px + 2 gaps), leaving ±15 +
                // "Пропустити" comfortably inside the pill on every phone
                // width; ±30 comes back at `sm:` and up (tablet/desktop).
                (Math.abs(seconds) === 30 ? " hidden sm:inline-block" : "")
              }
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
