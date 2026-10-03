/**
 * Time-state machine for the Routine calendar.
 *
 * The trio (`timeMode`, `monthCursor`, `selectedDay`) used to live as
 * three uncoupled `useState`s in `RoutineApp.tsx`, with several
 * callbacks and effects keeping them in sync. The Phase 2
 * decomposition (initiative 0001) moves them behind a `useReducer`
 * so transitions are explicit and testable in one place.
 */

import { useCallback, useEffect, useReducer } from "react";
import { dateKeyFromDate, parseDateKey } from "./lib/hubCalendarAggregate";
import { addDays } from "./lib/weekUtils";
import { useDayRollover } from "./hooks/useDayRollover";
import type { RoutineTimeMode } from "./context/RoutineCalendarContext";
import { monthBounds, todayDate, type MonthCursor } from "./RoutineApp.helpers";

export interface TimeState {
  timeMode: RoutineTimeMode;
  monthCursor: MonthCursor;
  selectedDay: string;
}

export type TimeAction =
  | { type: "applyMode"; mode: RoutineTimeMode }
  | { type: "goMonth"; delta: number }
  | { type: "goToToday" }
  | { type: "shiftWeekStrip"; deltaWeeks: number }
  | { type: "setSelectedDay"; selectedDay: string }
  | { type: "setTimeMode"; mode: RoutineTimeMode }
  | { type: "syncMonthRange" }
  | { type: "deepLinkDay"; selectedDay: string }
  | { type: "dayRollover"; prevTodayKey: string };

export function timeReducer(state: TimeState, action: TimeAction): TimeState {
  switch (action.type) {
    case "applyMode": {
      const t = todayDate();
      const tk = dateKeyFromDate(t);
      if (action.mode === "today") {
        return { ...state, timeMode: "today", selectedDay: tk };
      }
      if (action.mode === "tomorrow") {
        return {
          ...state,
          timeMode: "tomorrow",
          selectedDay: dateKeyFromDate(addDays(t, 1)),
        };
      }
      if (action.mode === "week") {
        return { ...state, timeMode: "week", selectedDay: tk };
      }
      if (action.mode === "month") {
        return {
          timeMode: "month",
          // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: `todayDate()` уже звело добу до device-local календаря; getter-и лише читають її частини, межа доби тут не вирішується.
          monthCursor: { y: t.getFullYear(), m: t.getMonth() },
          selectedDay: tk,
        };
      }
      return { ...state, timeMode: action.mode };
    }
    case "goMonth": {
      let m = state.monthCursor.m + action.delta;
      let y = state.monthCursor.y;
      if (m > 11) {
        m = 0;
        y++;
      }
      if (m < 0) {
        m = 11;
        y--;
      }
      return { ...state, monthCursor: { y, m } };
    }
    case "goToToday": {
      const t = todayDate();
      return {
        ...state,
        // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: `todayDate()` уже звело добу до device-local календаря; getter-и лише читають її частини, межа доби тут не вирішується.
        monthCursor: { y: t.getFullYear(), m: t.getMonth() },
        selectedDay: dateKeyFromDate(t),
      };
    }
    case "shiftWeekStrip": {
      const d = parseDateKey(state.selectedDay);
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: арифметика над днем, розпарсеним із ключа `YYYY-MM-DD`, а не читання «сьогодні» — жодної межі доби тут немає.
      d.setDate(d.getDate() + 7 * action.deltaWeeks);
      return {
        ...state,
        timeMode: "day",
        selectedDay: dateKeyFromDate(d),
      };
    }
    case "setSelectedDay":
      return { ...state, selectedDay: action.selectedDay };
    case "setTimeMode":
      return { ...state, timeMode: action.mode };
    case "syncMonthRange": {
      if (state.timeMode !== "month") return state;
      const { startKey, endKey } = monthBounds(
        state.monthCursor.y,
        state.monthCursor.m,
      );
      if (state.selectedDay < startKey || state.selectedDay > endKey) {
        return { ...state, selectedDay: startKey };
      }
      return state;
    }
    case "deepLinkDay":
      return {
        ...state,
        timeMode: "day",
        selectedDay: action.selectedDay,
      };
    // AI-CONTEXT: доба перекинулась, поки застосунок був відкритий.
    // Режими, чий вибір ПОХІДНИЙ від «зараз» (today / tomorrow / week),
    // мусять наздогнати нову добу — інакше `selectedDay` лишається на
    // вчора, а `todayKey` (він рахується щоренду) уже на сьогодні, і
    // стрічка тижня підсвічує два дні одночасно. Явний вибір дня
    // (`day`) — це рішення користувача, його не рухаємо.
    case "dayRollover": {
      const t = todayDate();
      const tk = dateKeyFromDate(t);
      if (tk === action.prevTodayKey) return state;
      switch (state.timeMode) {
        case "today":
        case "week":
          return { ...state, selectedDay: tk };
        case "tomorrow":
          return { ...state, selectedDay: dateKeyFromDate(addDays(t, 1)) };
        case "month": {
          // У місячному режимі рухаємось лише якщо вибір їхав за
          // «сьогодні»; коли користувач гортає інший місяць — не смикаємо.
          if (state.selectedDay !== action.prevTodayKey) return state;
          // Рік/місяць беремо прямо з ключа `YYYY-MM-DD`, а не з host-local
          // getter-ів: `tk` уже нормалізований під добу пристрою (ADR-0078),
          // тож зайвий прохід через `Date` лише повертав би ту саму цифру.
          return {
            ...state,
            monthCursor: {
              y: Number(tk.slice(0, 4)),
              m: Number(tk.slice(5, 7)) - 1,
            },
            selectedDay: tk,
          };
        }
        default:
          return state;
      }
    }
    default:
      return state;
  }
}

export function initialTimeState(): TimeState {
  const t = todayDate();
  return {
    timeMode: "today",
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: `todayDate()` уже звело добу до device-local календаря; getter-и лише читають її частини, межа доби тут не вирішується.
    monthCursor: { y: t.getFullYear(), m: t.getMonth() },
    selectedDay: dateKeyFromDate(t),
  };
}

export interface RoutineTimeStateBundle extends TimeState {
  applyTimeMode: (mode: RoutineTimeMode) => void;
  goMonth: (delta: number) => void;
  goToToday: () => void;
  shiftWeekStrip: (deltaWeeks: number) => void;
  setSelectedDay: (next: string | ((prev: string) => string)) => void;
  setTimeMode: (
    next: RoutineTimeMode | ((prev: RoutineTimeMode) => RoutineTimeMode),
  ) => void;
  deepLinkDay: (selectedDay: string) => void;
}

export function useRoutineTimeState(): RoutineTimeStateBundle {
  const [state, dispatch] = useReducer(timeReducer, initialTimeState());

  // When the month cursor moves, clamp `selectedDay` so it stays
  // inside the visible month — kept here (rather than in the parent)
  // because both inputs come from this hook's reducer.
  useEffect(() => {
    dispatch({ type: "syncMonthRange" });
  }, [state.monthCursor.y, state.monthCursor.m, state.timeMode]);

  // Застосунок, залишений відкритим через північ, мусить наздогнати нову
  // добу — інакше `selectedDay` (замерз на монтуванні) і `todayKey` (він
  // рахується щоренду) показують різні дні. Див. `useDayRollover`.
  useDayRollover(
    useCallback((prevTodayKey: string) => {
      dispatch({ type: "dayRollover", prevTodayKey });
    }, []),
  );

  const applyTimeMode = useCallback((mode: RoutineTimeMode) => {
    dispatch({ type: "applyMode", mode });
  }, []);

  const goMonth = useCallback((delta: number) => {
    dispatch({ type: "goMonth", delta });
  }, []);

  const goToToday = useCallback(() => {
    dispatch({ type: "goToToday" });
  }, []);

  const shiftWeekStrip = useCallback((deltaWeeks: number) => {
    dispatch({ type: "shiftWeekStrip", deltaWeeks });
  }, []);

  const setSelectedDay = useCallback(
    (next: string | ((prev: string) => string)) => {
      const value =
        typeof next === "function"
          ? (next as (prev: string) => string)(state.selectedDay)
          : next;
      dispatch({ type: "setSelectedDay", selectedDay: value });
    },
    [state.selectedDay],
  );

  const setTimeMode = useCallback(
    (next: RoutineTimeMode | ((prev: RoutineTimeMode) => RoutineTimeMode)) => {
      const value =
        typeof next === "function"
          ? (next as (prev: RoutineTimeMode) => RoutineTimeMode)(state.timeMode)
          : next;
      dispatch({ type: "setTimeMode", mode: value });
    },
    [state.timeMode],
  );

  const deepLinkDay = useCallback((selectedDay: string) => {
    dispatch({ type: "deepLinkDay", selectedDay });
  }, []);

  return {
    timeMode: state.timeMode,
    monthCursor: state.monthCursor,
    selectedDay: state.selectedDay,
    applyTimeMode,
    goMonth,
    goToToday,
    shiftWeekStrip,
    setSelectedDay,
    setTimeMode,
    deepLinkDay,
  };
}
