/**
 * Routine module main timeline body.
 *
 * Renders the storage-error banner, the calendar/stats panels with
 * their context provider, and the pull-to-refresh wrapper. Split out
 * of `RoutineApp.tsx` as part of the Phase 2 decomposition
 * (initiative 0001).
 */

import { Banner } from "@shared/components/ui/Banner";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useCloudPullPending } from "@shared/hooks/useCloudPullPending";
import { RoutineCalendarPanel } from "./components/RoutineCalendarPanel";
import { RoutineHabitsPanel } from "./components/RoutineHabitsPanel";
import { RoutineStatsPanel } from "./components/RoutineStatsPanel";
import {
  RoutineCalendarProvider,
  type RoutineCalendarActions,
  type RoutineCalendarData,
  type RoutineMainTab,
} from "./context/RoutineCalendarContext";
import type { Dispatch, SetStateAction } from "react";
import type { RoutineState } from "./lib/types";

export interface RoutineTimelineProps {
  storageErrorMsg: string | null;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  onOpenCalendarTab: () => void;
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
  setRoutine,
  onOpenCalendarTab,
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
  // AI-DANGER: `isHabitPending` — це прапорець `useTransition` навколо тогла
  // ОДНІЄЇ звички (`useRoutineAppState.onToggleHabit`), а не завантаження
  // даних. До 2026-09-03 він годував `<DataState>`, який на час переходу
  // підміняв усю панель календаря чотирма скелетон-рядками. Наслідки були
  // два, і гірший — не візуальний: підміна РОЗМОНТОВУВАЛА кнопку, на якій
  // стоїть фокус, тож клавіатурний користувач після кожної відмітки опинявся
  // на `<body>` і мусив протабувати список наново (browser-QA 2026-09-02).
  //
  // Скелет тут не мав що показувати й на початковому завантаженні: `data`
  // була літеральним `true`, тобто ніякого асинхронного запиту за цією
  // «query» не стояло — єдиним станом, який вмикав скелет, був сам перехід.
  //
  // Тепер панель лишається змонтованою, а зайнятість повідомляється
  // `aria-busy` — для читача екрана це те саме «зачекай», але без втрати
  // фокуса. Не повертай сюди підміну піддерева: ціна одного кадру скелета —
  // зламана клавіатурна навігація.
  const calendarBusy = isHabitPending && mainTab === "calendar";
  const cloudPullPending = useCloudPullPending();

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
          <h1 className="sr-only">Рутина</h1>
          {storageErrorMsg && (
            <Banner
              variant="danger"
              role="alert"
              className="flex items-start justify-between gap-3"
            >
              <span>
                Не вдалося зберегти дані Рутини ({storageErrorMsg}). Можливо,
                браузер переповнив сховище, звільни місце або експортуй резервну
                копію.
              </span>
              <button
                type="button"
                onClick={onDismissStorageError}
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-style-caption text-danger-strong dark:text-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
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
              <div aria-busy={calendarBusy || undefined}>
                <RoutineCalendarPanel hidden={mainTab !== "calendar"} />
              </div>
            </SectionErrorBoundary>
          </RoutineCalendarProvider>

          <SectionErrorBoundary title="Не вдалось показати «Звички»">
            <RoutineHabitsPanel
              routine={routine}
              setRoutine={setRoutine}
              hidden={mainTab !== "habits"}
              onOpenCalendar={onOpenCalendarTab}
            />
          </SectionErrorBoundary>

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
