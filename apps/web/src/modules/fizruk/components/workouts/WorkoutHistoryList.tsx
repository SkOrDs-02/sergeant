/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Full workout list for the dedicated `/fizruk/history` route (03-A).
 * Extracted out of `WorkoutJournalSection.tsx`, which used to render this
 * same card as the `!activeOnly` branch of `view === "log"` on the
 * `/fizruk/workouts` URL — a second, URL-invisible path into the journal
 * that duplicated the home page's "+ Нове" / "Шаблони" start-CTAs
 * (page-audit item 03). This component intentionally carries **no**
 * start-CTA of its own: starting a session lives only on `WorkoutsHome`.
 * Each row navigates to the route-owned single-workout view
 * (`/fizruk/workout/<id>`, `WorkoutJournalSection`) instead of toggling a
 * local selection — that view already renders the right thing for both
 * an in-flight and a finished session (02-A).
 */
import { useCallback } from "react";
import { VirtualList } from "@shared/components/ui/VirtualList";
import { deviceDayKey, pluralExercises } from "@sergeant/shared";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { Card } from "@shared/components/ui/Card";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";
import { messages } from "@shared/i18n/uk";
import type { Workout } from "@sergeant/fizruk-domain";

export interface WorkoutHistoryListProps {
  workouts: readonly Workout[];
  deleteWorkout: (id: string) => void;
  restoreWorkout: (workout: Workout) => void;
  /** Navigates to `/fizruk/workout/<id>` (route-owned single-workout view). */
  onOpenWorkout: (id: string) => void;
}

interface WorkoutRowProps {
  w: Workout;
  onOpen: () => void;
}

// A row with a `note` grows a second, italic, line-clamp(2) caption line
// below the date/badge line — see the sibling comment on
// `JOURNAL_ITEM_NOTE_EXTRA` below. Mirrors the estimate this component
// used to share with `WorkoutJournalSection` before the 03-A split.
const JOURNAL_ITEM_HEIGHT = 60;
const JOURNAL_ITEM_NOTE_EXTRA = 36;
const MAX_JOURNAL_HEIGHT = JOURNAL_ITEM_HEIGHT * 10;

function estimateJournalRowHeight(w: Workout | undefined): number {
  if (!w) return JOURNAL_ITEM_HEIGHT;
  return w.note
    ? JOURNAL_ITEM_HEIGHT + JOURNAL_ITEM_NOTE_EXTRA
    : JOURNAL_ITEM_HEIGHT;
}

function WorkoutRow({ w, onOpen }: WorkoutRowProps) {
  const copy = messages.fizruk.workoutHistory;
  // At most one unfinished workout can exist at a time (the "one active
  // workout" invariant enforced by `requestWorkoutStart`'s conflict
  // dialog), so any non-ended row here unambiguously *is* the active
  // session — no separate "draft" state to disambiguate.
  const isEnded = Boolean(w.endedAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-inset"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-style-label text-text">
          {formatDayKeyUk(deviceDayKey(new Date(w.startedAt)), {
            todayKey: deviceDayKey(),
            relative: false,
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-style-caption text-subtle">
            {(w.items || []).length} {pluralExercises((w.items || []).length)}
          </span>
          {isEnded ? (
            <span className="text-style-caption px-2 py-0.5 rounded-full bg-panelHi text-subtle border border-line">
              {copy.endedBadge}
            </span>
          ) : (
            <span className="text-style-caption px-2 py-0.5 rounded-full bg-success/15 text-success-strong dark:text-success border border-success/20">
              {copy.activeBadge}
            </span>
          )}
        </div>
      </div>
      {w.note && (
        <div className="text-style-caption text-subtle mt-1 italic line-clamp-2">
          {w.note}
        </div>
      )}
    </button>
  );
}

export function WorkoutHistoryList({
  workouts,
  deleteWorkout,
  restoreWorkout,
  onOpenWorkout,
}: WorkoutHistoryListProps) {
  const toast = useToast();
  const copy = messages.fizruk.workoutHistory;
  const workoutList = workouts || [];

  const handleSwipeDelete = useCallback(
    (id: string) => {
      const snapshot = (workouts || []).find((w) => w.id === id);
      if (!snapshot) return;
      deleteWorkout(id);
      showUndoToast(toast, {
        msg: copy.deletedToast,
        onUndo: () => restoreWorkout?.(snapshot),
      });
    },
    [workouts, deleteWorkout, restoreWorkout, toast, copy.deletedToast],
  );

  const listHeight = Math.min(
    workoutList.reduce((sum, w) => sum + estimateJournalRowHeight(w), 0),
    MAX_JOURNAL_HEIGHT,
  );

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3 bg-panelHi/60 border-b border-line">
        <SectionHeading as="div" size="xs" variant="fizruk">
          {copy.title}
        </SectionHeading>
      </div>

      {workoutList.length === 0 && (
        <EmptyState
          compact
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" />
            </svg>
          }
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      )}

      {workoutList.length > 0 && (
        <VirtualList
          items={workoutList}
          height={listHeight}
          estimateSize={(index) => estimateJournalRowHeight(workoutList[index])}
          getItemKey={(_, w) => w.id}
        >
          {(w) => (
            <SwipeToAction
              onSwipeLeft={
                !w.endedAt ? undefined : () => handleSwipeDelete(w.id)
              }
              rightLabel={messages.actions.delete}
              rightColor="bg-danger"
            >
              <WorkoutRow w={w} onOpen={() => onOpenWorkout(w.id)} />
            </SwipeToAction>
          )}
        </VirtualList>
      )}
    </Card>
  );
}
