import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { SkipReason } from "@sergeant/routine-domain";
import type { HubCalendarEvent, RoutineState } from "../lib/types";

export interface RoutineCompletionRate {
  completed: number;
  scheduled: number;
  rate: number;
}

export interface RoutineDayProgress {
  completed: number;
  scheduled: number;
}

export interface RoutineMonthCursor {
  y: number;
  m: number;
}

export type RoutineTimeMode = "today" | "tomorrow" | "day" | "week" | "month";

// «habits» додано 2026-08-03 разом із переїздом керування звичками з
// Налаштувань у модуль — див. `components/RoutineHabitsPanel.tsx`.
export type RoutineMainTab = "calendar" | "habits" | "stats";

export interface RoutineCalendarData {
  rangeLabel: string;
  headlineDate: string;
  filtered: HubCalendarEvent[];
  routine: RoutineState;
  currentStreak: number;
  completionRate: RoutineCompletionRate;
  dayProgress: RoutineDayProgress;
  timeMode: RoutineTimeMode;
  selectedDay: string;
  todayKey: string;
  shiftWeekStrip: (delta: number) => void;
  setSelectedDay: Dispatch<SetStateAction<string>>;
  setTimeMode: Dispatch<SetStateAction<RoutineTimeMode>>;
  listQuery: string;
  setListQuery: Dispatch<SetStateAction<string>>;
  tagFilter: string | null;
  setTagFilter: Dispatch<SetStateAction<string | null>>;
  tagChips: string[];
  monthCursor: RoutineMonthCursor;
  monthTitle: string;
  goMonth: (delta: number) => void;
  goToToday: () => void;
  cells: Array<number | null>;
  dayCounts: Map<string, number>;
  listIsEmpty: boolean;
  hasListFilter: boolean;
  hasNoHabits: boolean;
  grouped: Array<[string, HubCalendarEvent[]]>;
  canBulkMark: boolean;
}

export interface RoutineCalendarActions {
  applyTimeMode: (mode: RoutineTimeMode) => void;
  onToggleHabit: (habitId: string, dateKey: string) => void;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  setMainTab: Dispatch<SetStateAction<RoutineMainTab>>;
  onOpenModule?:
    | ((moduleId: string, opts?: { hash?: string } | undefined) => void)
    | undefined;
  onBulkMarkDay: () => void;
  onOpenQuickAddHabit: () => void;
  /** Позначити день як «не зміг з причиною» (канон §5). */
  onSetHabitSkip: (
    habitId: string,
    dateKey: string,
    reason: SkipReason,
  ) => void;
  /** Зняти позначку «не зміг» — день повертається у «не зробив». */
  onClearHabitSkip: (habitId: string, dateKey: string) => void;
}

const RoutineCalendarDataContext = createContext<RoutineCalendarData | null>(
  null,
);
const RoutineCalendarActionsContext =
  createContext<RoutineCalendarActions | null>(null);

export interface RoutineCalendarProviderProps {
  data: RoutineCalendarData;
  actions: RoutineCalendarActions;
  children: ReactNode;
}

export function RoutineCalendarProvider({
  data,
  actions,
  children,
}: RoutineCalendarProviderProps) {
  return (
    <RoutineCalendarDataContext.Provider value={data}>
      <RoutineCalendarActionsContext.Provider value={actions}>
        {children}
      </RoutineCalendarActionsContext.Provider>
    </RoutineCalendarDataContext.Provider>
  );
}

export function useRoutineCalendarData(): RoutineCalendarData {
  const ctx = useContext(RoutineCalendarDataContext);
  if (!ctx)
    throw new Error(
      "useRoutineCalendarData must be used within RoutineCalendarProvider",
    );
  return ctx;
}

export function useRoutineCalendarActions(): RoutineCalendarActions {
  const ctx = useContext(RoutineCalendarActionsContext);
  if (!ctx)
    throw new Error(
      "useRoutineCalendarActions must be used within RoutineCalendarProvider",
    );
  return ctx;
}
