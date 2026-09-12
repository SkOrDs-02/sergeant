/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Dedicated history route (`/fizruk/history`, 03-A). Previously "Всі →"
 * on the Workouts home opened a second, URL-invisible "Журнал" view on
 * the same `/fizruk/workouts` path (`view === "log"` in `Workouts.tsx`)
 * with its own "+ Нове" / "Шаблони" start-CTAs — a second start path
 * parallel to the home's "Швидкий старт" / "Із шаблону", and one whose
 * state (an in-memory `view`, not the URL) did not survive a refresh.
 * This page owns its own URL, and carries no start-CTA at all — starting
 * a session lives only on `WorkoutsHome`.
 */
import { Icon } from "@shared/components/ui/Icon";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { messages } from "@shared/i18n/uk";
import { useWorkouts } from "../hooks/useWorkouts";
import { WorkoutHistoryList } from "../components/workouts/WorkoutHistoryList";

export interface WorkoutHistoryProps {
  onNavigate: (target: string) => void;
}

export function WorkoutHistory({ onNavigate }: WorkoutHistoryProps) {
  const { workouts, loaded, deleteWorkout, restoreWorkout } = useWorkouts();
  const copy = messages.fizruk.workoutHistory;
  const finishedCount = workouts.filter((w) => w.endedAt).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-9 h-9 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] -ml-1 rounded-xl flex items-center justify-center text-text hover:bg-panelHi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={() => onNavigate("workouts")}
            aria-label={copy.backAria}
          >
            <Icon name="chevron-left" size="sm" />
          </button>
          <div className="flex-1">
            <h1 className="text-style-title text-text">{copy.title}</h1>
            <p className="text-style-caption text-subtle mt-0.5">
              {copy.subtitlePrefix} {finishedCount}
            </p>
          </div>
        </div>

        {!loaded ? (
          <div
            className="space-y-3"
            role="status"
            aria-live="polite"
            aria-label={messages.loadingActions.loadingWorkouts}
          >
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <WorkoutHistoryList
            workouts={workouts}
            deleteWorkout={deleteWorkout}
            restoreWorkout={restoreWorkout}
            onOpenWorkout={(id) => onNavigate(`workout/${id}`)}
          />
        )}
      </div>
    </div>
  );
}
