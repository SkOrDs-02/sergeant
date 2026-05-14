/**
 * Routine module main timeline body.
 *
 * Renders the storage-error banner, the calendar/stats panels with
 * their context provider, and the pull-to-refresh wrapper. Split out
 * of `RoutineApp.tsx` as part of the Phase 2 decomposition
 * (initiative 0001).
 */

import { Banner } from "@shared/components/ui/Banner";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { SkeletonHabitRow } from "@shared/components/ui/Skeleton";
import { useCloudPullPending } from "@shared/hooks/useCloudPullPending";
import { RoutineCalendarPanel } from "./components/RoutineCalendarPanel";
import { RoutineStatsPanel } from "./components/RoutineStatsPanel";
import {
  RoutineCalendarProvider,
  type RoutineCalendarActions,
  type RoutineCalendarData,
  type RoutineMainTab,
} from "./context/RoutineCalendarContext";
import type { RoutineState } from "./lib/types";

export interface RoutineTimelineProps {
  storageErrorMsg: string | null;
  onDismissStorageError: () => void;
  calendarData: RoutineCalendarData;
  calendarActions: RoutineCalendarActions;
  isHabitPending: boolean;
  mainTab: RoutineMainTab;
  routine: RoutineState;
  streakMax: number;
  onPullRefresh: () => Promise<void>;
  onPullRefreshError: () => void;
}

export function RoutineTimeline({
  storageErrorMsg,
  onDismissStorageError,
  calendarData,
  calendarActions,
  isHabitPending,
  mainTab,
  routine,
  streakMax,
  onPullRefresh,
  onPullRefreshError,
}: RoutineTimelineProps) {
  const calendarBusy = isHabitPending && mainTab === "calendar";
  const calendarQuery: DataStateQueryLike<true> = {
    data: calendarBusy ? undefined : (true as const),
    isLoading: calendarBusy,
  };
  const cloudPullPending = useCloudPullPending();

  const calendarLoadingSkeleton = (
    <div className="px-4 pt-2 space-y-2 motion-safe:animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <SkeletonHabitRow
          key={i}
          shimmer
          module="routine"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      <PullToRefresh
        as="main"
        id="routine-main"
        tabIndex={-1}
        onRefresh={onPullRefresh}
        onError={onPullRefreshError}
        variant="routine"
        enabled={!cloudPullPending}
        contentClassName="page-tabbar-pad routine-main-pad"
      >
        <div className="max-w-4xl mx-auto w-full pt-4 space-y-4">
          {storageErrorMsg && (
            <Banner
              variant="danger"
              role="alert"
              className="flex items-start justify-between gap-3"
            >
              <span>
                Не вдалося зберегти дані Рутини ({storageErrorMsg}). Можливо,
                браузер переповнив сховище — звільни місце або експортуй
                резервну копію.
              </span>
              <button
                type="button"
                onClick={onDismissStorageError}
                className="shrink-0 text-xs font-semibold text-danger/80 hover:text-danger"
                aria-label="Закрити повідомлення"
              >
                Закрити
              </button>
            </Banner>
          )}
          <RoutineCalendarProvider
            data={calendarData}
            actions={calendarActions}
          >
            <SectionErrorBoundary title="Не вдалось показати «Календар»">
              <DataState
                query={calendarQuery}
                skeleton={calendarLoadingSkeleton}
              >
                {() => <RoutineCalendarPanel hidden={mainTab !== "calendar"} />}
              </DataState>
            </SectionErrorBoundary>
          </RoutineCalendarProvider>

          <SectionErrorBoundary title="Не вдалось показати «Статистика»">
            <RoutineStatsPanel
              routine={routine}
              currentStreak={streakMax}
              hidden={mainTab !== "stats"}
            />
          </SectionErrorBoundary>
        </div>
      </PullToRefresh>
    </div>
  );
}
