import { useEffect, useRef, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { openHubModule } from "@shared/lib/hubNav";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";

/**
 * Persistent "return to active workout" CTA.
 *
 * Fizruk remembers the open workout in `fizruk_active_workout_id_v1`. If
 * the user navigates to the Hub (or another module) mid-set, the workout
 * is still "live" but the user has to manually open Fizruk → Workouts →
 * find the highlighted row to get back. That's three taps for an action
 * that should be one — and it's especially easy to lose the thread when
 * the user jumps to Finyk to log the protein shake they just bought.
 *
 * This banner renders in the Hub shell (outside of any module) whenever
 * an active workout id is persisted. One tap opens Fizruk and deep-links
 * to the Workouts page via the existing cross-module nav bus.
 *
 * Returns null when there's no active workout, or when `hidden` is true
 * (e.g. during the FTUX session where any extra CTA crowds the splash).
 */
export function ActiveWorkoutBanner({ hidden = false }: { hidden?: boolean }) {
  const activeId = useActiveFizrukWorkout();

  // Track elapsed minutes since the banner first appeared (approximate).
  // We use mount time as a proxy for workout start — good enough to give
  // users a "how long have I been away?" signal without needing the exact
  // workout start timestamp from Fizruk's domain.
  const startRef = useRef(Date.now());
  const [elapsedMin, setElapsedMin] = useState(0);

  useEffect(() => {
    if (!activeId) return;
    // Reset clock each time a new active workout appears.
    startRef.current = Date.now();
    setElapsedMin(0);
    const id = setInterval(() => {
      setElapsedMin(Math.floor((Date.now() - startRef.current) / 60_000));
    }, 60_000);
    return () => clearInterval(id);
  }, [activeId]);

  if (hidden) return null;
  if (!activeId) return null;

  const label =
    elapsedMin > 0
      ? `${elapsedMin} хв · Тренування триває`
      : "Тренування триває";

  return (
    <div
      className="fixed left-4 z-40 pointer-events-none"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" }}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => openHubModule("fizruk", "#workouts")}
        className="pointer-events-auto flex items-center gap-2.5 h-12 pl-3 pr-4 rounded-full bg-fizruk-strong text-white shadow-float hover:brightness-110 transition-[filter,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        aria-label="Повернутись до активного тренування"
      >
        <span
          className="relative flex w-8 h-8 items-center justify-center rounded-full bg-white/15"
          aria-hidden
        >
          <Icon name="dumbbell" size={16} strokeWidth={2.25} />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-fizruk-strong motion-safe:animate-pulse" />
        </span>
        <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
      </button>
    </div>
  );
}
