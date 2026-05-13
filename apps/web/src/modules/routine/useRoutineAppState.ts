/**
 * Orchestrator hook for `RoutineApp`.
 *
 * Composes the smaller hooks introduced as part of the Phase 2
 * decomposition (initiative 0001):
 *
 *   - `useRoutineTimeState` — the time-mode reducer.
 *   - `useRoutineDerivedData` — pure-derived calendar/stats data.
 *
 * On top of those it owns the rest of the App-level state: the
 * canonical routine state (LS-backed), the main tab, filter inputs,
 * the quick-add dialog and the storage-error banner. It also wires
 * the side effects that connect the module to the rest of the app
 * (sqlite read boot, dual-write boot, Finyk preview, reminders,
 * deep-link handling and the PWA `add_habit` action).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { useToast } from "@shared/hooks/useToast";
import { hapticTap, hapticSuccess } from "@shared/lib/adapters/haptic";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { useRoutineRoute } from "./hooks/useRoutineRoute";
import { useFinykHubPreview } from "../../core/hub/useFinykHubPreview";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import {
  loadRoutineState,
  toggleHabitCompletion,
  markAllScheduledHabitsComplete,
  ROUTINE_EVENT,
  ROUTINE_STORAGE_ERROR,
} from "./lib/routineStorage";
import { useRoutineDualWriteBoot } from "./hooks/useRoutineDualWriteBoot";
import { useSqliteReadBoot } from "./hooks/useSqliteReadBoot";
import { useRoutineReminders } from "./hooks/useRoutineReminders";
import { HUB_FINYK_ROUTINE_SYNC_EVENT } from "../finyk/hubRoutineSync";
import type {
  RoutineCalendarActions,
  RoutineCalendarData,
  RoutineMainTab,
} from "./context/RoutineCalendarContext";
import type { RoutineState } from "./lib/types";
import { FIZRUK_PLAN_SYNC } from "./RoutineApp.helpers";
import { useRoutineTimeState } from "./useRoutineTimeState";
import { useRoutineDerivedData } from "./useRoutineDerivedData";

function useRoutineState(): [
  RoutineState,
  Dispatch<SetStateAction<RoutineState>>,
] {
  const [state, setState] = useState<RoutineState>(() => loadRoutineState());
  useEffect(() => {
    const sync = () => setState(loadRoutineState());
    window.addEventListener("storage", sync);
    window.addEventListener(ROUTINE_EVENT, sync);
    window.addEventListener(FIZRUK_PLAN_SYNC, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ROUTINE_EVENT, sync);
      window.removeEventListener(FIZRUK_PLAN_SYNC, sync);
    };
  }, []);
  return [state, setState];
}

export interface UseRoutineAppStateParams {
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
}

export interface RoutineAppStateBundle {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  isHabitPending: boolean;
  storageErrorMsg: string | null;
  setStorageErrorMsg: Dispatch<SetStateAction<string | null>>;
  mainTab: RoutineMainTab;
  setMainTab: Dispatch<SetStateAction<RoutineMainTab>>;
  quickAddHabitOpen: boolean;
  quickAddFocusTick: number;
  /** True only on the very first quick-add open of a fresh user. */
  quickAddFirstRunHint: boolean;
  /** Acknowledge the first-run hint banner inside the quick-add dialog. */
  dismissQuickAddFirstRunHint: () => void;
  openQuickAddHabit: () => void;
  closeQuickAddHabit: () => void;
  streakMax: number;
  calendarData: RoutineCalendarData;
  calendarActions: RoutineCalendarActions;
  handlePullRefresh: () => Promise<void>;
  handlePullRefreshError: () => void;
}

export function useRoutineAppState({
  pwaAction,
  onPwaActionConsumed,
  onOpenModule,
}: UseRoutineAppStateParams): RoutineAppStateBundle {
  const toast = useToast();
  useSqliteReadBoot();
  useRoutineDualWriteBoot();
  const [routine, setRoutine] = useRoutineState();
  // Low-priority transition for habit toggles: the checkbox haptic fires
  // instantly while React defers the heavier re-render (full list + persist)
  // so the animation never feels janky on slower devices.
  const [isHabitPending, startHabitTransition] = useTransition();
  // Finyk calendar events depend on both the Finyk Monobank cache and the
  // subscription calendar. The former now flows through React Query
  // (`hubKeys.preview("finyk")`), the latter still uses a custom event
  // because nothing else observes the subscription-only signal.
  const finykPreview = useFinykHubPreview();
  const [routineSyncBump, setRoutineSyncBump] = useState<number>(0);
  useEffect(() => {
    const bump = () => setRoutineSyncBump((n) => n + 1);
    window.addEventListener(HUB_FINYK_ROUTINE_SYNC_EVENT, bump);
    return () => {
      window.removeEventListener(HUB_FINYK_ROUTINE_SYNC_EVENT, bump);
    };
  }, []);
  const finykCalendarTick = finykPreview.dataUpdatedAt + routineSyncBump;

  // Persistent storage-error banner: quota failures won't go away until the
  // user frees space, so a 7s toast is too transient. Matches the pattern
  // already used in Nutrition (`storageBanner`) and Finyk.
  const [storageErrorMsg, setStorageErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      const msg = detail?.message || "невідома помилка";
      setStorageErrorMsg(msg);
    };
    window.addEventListener(ROUTINE_STORAGE_ERROR, onErr);
    return () => window.removeEventListener(ROUTINE_STORAGE_ERROR, onErr);
  }, []);

  useRoutineReminders(routine);

  // Path-based mainTab: `/routine` → calendar, `/routine/stats` → stats.
  // The `useRoutineRoute` hook owns:
  //   - the pathname → mainTab derivation,
  //   - the one-time hash-compat shim (rewrites legacy `/routine#calendar`,
  //     `/routine#stats`, `/?module=routine#stats` to `/routine/<tab>`),
  //   - the typed `navigate(tab)` setter (history push).
  // The `useLocalStorageState`-backed "last-active tab" is still kept as
  // a memory layer so that opening Hub → Routine (bare `/routine`) after a
  // refresh lands on the previously active tab. The URL is otherwise
  // canonical: bookmarking `/routine/stats` always opens stats regardless
  // of the stored value.
  const route = useRoutineRoute("calendar");
  const [persistedTab, setPersistedTab] = useLocalStorageState<RoutineMainTab>(
    STORAGE_KEYS.ROUTINE_MAIN_TAB,
    "calendar",
    {
      raw: true,
      validate: (v): v is RoutineMainTab => v === "calendar" || v === "stats",
    },
  );
  const mainTab: RoutineMainTab = route.page;
  // One-shot on mount: when the user lands on bare `/routine` (no tab in
  // the path, no legacy hash), restore the last-active tab from
  // localStorage. Subsequent tab changes go through `setMainTab` →
  // `route.navigate(...)`, which writes both the URL and localStorage.
  const restoredFromPersistRef = useRef(false);
  useEffect(() => {
    if (restoredFromPersistRef.current) return;
    restoredFromPersistRef.current = true;
    if (typeof window === "undefined") return;
    const pathTail = window.location.pathname.replace(/^\/routine\/?/, "");
    if (pathTail !== "") return;
    if (window.location.hash) return;
    if (persistedTab === "calendar") return;
    route.navigate(persistedTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setMainTab: Dispatch<SetStateAction<RoutineMainTab>> = useCallback(
    (next) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: RoutineMainTab) => RoutineMainTab)(mainTab)
          : next;
      setPersistedTab(resolved);
      route.navigate(resolved);
    },
    [mainTab, route, setPersistedTab],
  );

  const time = useRoutineTimeState();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState<string>("");

  // Quick-create dialog state. The `add_habit` PWA action opens a
  // bottom-sheet modal overlaid on whatever tab the user is already on
  // (#S0.2). The tick is bumped each time so the dialog re-focuses its
  // name input when reopened after a previous close.
  const [quickAddHabitOpen, setQuickAddHabitOpen] = useState<boolean>(false);
  const [quickAddFocusTick, setQuickAddFocusTick] = useState<number>(0);
  const openQuickAddHabit = useCallback(() => {
    setQuickAddHabitOpen(true);
    setQuickAddFocusTick((t) => t + 1);
  }, []);
  const closeQuickAddHabit = useCallback(() => {
    setQuickAddHabitOpen(false);
  }, []);

  // PWA shortcut entry: when the App-shell receives the
  // `?pwa=add_habit` deep-link it sets `pwaAction` and we open the
  // quick-add dialog once. The setStates here are an external-event
  // adaptor (the OS opening the PWA), not a render derivation, so we
  // suppress `react-hooks/set-state-in-effect` rather than restructure.
  useEffect(() => {
    if (pwaAction !== "add_habit") return;
    setQuickAddHabitOpen(true);
    setQuickAddFocusTick((t) => t + 1);
    onPwaActionConsumed?.();
  }, [pwaAction, onPwaActionConsumed]);

  // Per-module first-run: pop the quick-create dialog the first time
  // the user enters Routine. Habits do not have a small «previous
  // goal» scalar to seed (recurrence/reminders/weekdays all need
  // explicit input) so the canonical «domivka» is the same
  // `HabitQuickCreateDialog` every returning user uses; the dialog
  // itself renders a `<FirstRunHintBanner />` framing this first habit
  // as preliminary. We mark the seen flag immediately so closing the
  // dialog without saving still retires the prompt for next time.
  const routineFirstRun = useModuleFirstRun("routine");
  const [quickAddFirstRunHint, setQuickAddFirstRunHint] =
    useState<boolean>(false);
  useEffect(() => {
    if (!routineFirstRun.firstRun) return;
    if (pwaAction === "add_habit") return;
    setQuickAddHabitOpen(true);
    setQuickAddFocusTick((t) => t + 1);
    setQuickAddFirstRunHint(true);
    routineFirstRun.markSeen();
  }, [routineFirstRun, pwaAction]);
  const dismissQuickAddFirstRunHint = useCallback(() => {
    setQuickAddFirstRunHint(false);
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("routineDay");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
        time.deepLinkDay(q);
        // Видаляємо параметр після застосування, щоб back-навігація чи
        // рефреш не запускали стрибок у "day"-режим повторно.
        params.delete("routineDay");
        const qs = params.toString();
        const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", next);
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeState = useMemo(
    () => ({
      timeMode: time.timeMode,
      monthCursor: time.monthCursor,
      selectedDay: time.selectedDay,
    }),
    [time.timeMode, time.monthCursor, time.selectedDay],
  );

  const derived = useRoutineDerivedData({
    routine,
    timeState,
    tagFilter,
    listQuery,
    finykCalendarTick,
  });

  const onToggleHabit = useCallback(
    (habitId: string, dateKey: string) => {
      // Легкий тап на ✓ — фізичне відчуття підтверджує дію до того, як
      // око встигне відскакувати до heatmap-анімації. `hapticTap` —
      // noop на desktop/iOS Safari і під prefers-reduced-motion.
      hapticTap();
      // Wrap in startTransition so React can commit the haptic + checkbox
      // visual change at high priority while deferring the full list
      // re-render + localStorage persist to a lower-priority lane.
      startHabitTransition(() => {
        setRoutine((prev) => toggleHabitCompletion(prev, habitId, dateKey));
      });
    },
    [setRoutine, startHabitTransition],
  );

  const onBulkMarkDay = useCallback(() => {
    const dk = derived.range.startKey;
    if (derived.range.startKey !== derived.range.endKey) return;
    setRoutine((s) => markAllScheduledHabitsComplete(s, dk));
    hapticSuccess();
  }, [derived.range.startKey, derived.range.endKey, setRoutine]);

  // Routine is local-first (localStorage) and the visible state is
  // recomputed from `routine` on each render, so PTR's only job is to
  // ask the App-level cloud-sync engine for a pull. The `routine`
  // listener (`ROUTINE_EVENT`) re-renders us when the engine writes new
  // state into localStorage.
  const handlePullRefresh = useCallback(() => requestCloudPull(2500), []);
  const handlePullRefreshError = useCallback(() => {
    toast.error("Не вдалося оновити дані. Перевір з'єднання.");
  }, [toast]);

  const calendarData = useMemo<RoutineCalendarData>(
    () => ({
      rangeLabel: derived.rangeLabel,
      headlineDate: derived.headlineDate,
      filtered: derived.filtered,
      routine,
      currentStreak: derived.streakMax,
      completionRate: derived.completionRateVal,
      dayProgress: derived.dayProgress,
      timeMode: time.timeMode,
      selectedDay: time.selectedDay,
      todayKey: derived.todayKey,
      shiftWeekStrip: time.shiftWeekStrip,
      setSelectedDay: time.setSelectedDay,
      setTimeMode: time.setTimeMode,
      listQuery,
      setListQuery,
      tagFilter,
      setTagFilter,
      tagChips: derived.tagChips,
      monthCursor: time.monthCursor,
      monthTitle: derived.monthTitle,
      goMonth: time.goMonth,
      goToToday: time.goToToday,
      cells: derived.cells,
      dayCounts: derived.dayCounts,
      listIsEmpty: derived.listIsEmpty,
      hasListFilter: derived.hasListFilter,
      hasNoHabits: derived.hasNoHabits,
      grouped: derived.grouped,
      canBulkMark: derived.canBulkMark,
    }),
    [derived, routine, time, listQuery, tagFilter],
  );

  const calendarActions = useMemo<RoutineCalendarActions>(
    () => ({
      applyTimeMode: time.applyTimeMode,
      onToggleHabit,
      setRoutine,
      setMainTab,
      onOpenModule,
      onBulkMarkDay,
      onOpenQuickAddHabit: openQuickAddHabit,
    }),
    [
      time.applyTimeMode,
      onToggleHabit,
      setRoutine,
      setMainTab,
      onOpenModule,
      onBulkMarkDay,
      openQuickAddHabit,
    ],
  );

  return {
    routine,
    setRoutine,
    isHabitPending,
    storageErrorMsg,
    setStorageErrorMsg,
    mainTab,
    setMainTab,
    quickAddHabitOpen,
    quickAddFocusTick,
    quickAddFirstRunHint,
    dismissQuickAddFirstRunHint,
    openQuickAddHabit,
    closeQuickAddHabit,
    streakMax: derived.streakMax,
    calendarData,
    calendarActions,
    handlePullRefresh,
    handlePullRefreshError,
  };
}
