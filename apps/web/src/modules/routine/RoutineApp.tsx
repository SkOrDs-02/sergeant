import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Banner } from "@shared/components/ui/Banner";
import { SkeletonHabitRow } from "@shared/components/ui/Skeleton";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { useToast } from "@shared/hooks/useToast";
import {
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
} from "@shared/components/layout";
import { hapticTap, hapticSuccess } from "@shared/lib/adapters/haptic";
import {
  loadRoutineState,
  toggleHabitCompletion,
  markAllScheduledHabitsComplete,
  ROUTINE_EVENT,
  ROUTINE_STORAGE_ERROR,
} from "./lib/routineStorage";
import { useRoutineDualWriteBoot } from "./hooks/useRoutineDualWriteBoot";
import { useSqliteReadBoot } from "./hooks/useSqliteReadBoot";
import { addDays, startOfIsoWeek } from "./lib/weekUtils";
import { maxActiveStreak, completionRateForRange } from "./lib/streaks";
import { useRoutineReminders } from "./hooks/useRoutineReminders";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import {
  buildHubCalendarEvents,
  countEventsByDate,
  dateKeyFromDate,
  FIZRUK_GROUP_LABEL,
  parseDateKey,
  habitScheduledOnDate,
} from "./lib/hubCalendarAggregate";
import { FINYK_SUB_GROUP_LABEL } from "./lib/finykSubscriptionCalendar";
import { HUB_FINYK_ROUTINE_SYNC_EVENT } from "../finyk/hubRoutineSync";
import { useFinykHubPreview } from "../../core/hub/useFinykHubPreview";
import { ROUTINE_THEME as C } from "./lib/routineConstants";
import { RoutineBottomNav } from "./components/RoutineBottomNav";
import { RoutineCalendarPanel } from "./components/RoutineCalendarPanel";
import { RoutineStatsPanel } from "./components/RoutineStatsPanel";
import { HabitQuickCreateDialog } from "./components/HabitQuickCreateDialog";
import { RoutineCalendarProvider } from "./context/RoutineCalendarContext";
import type {
  RoutineMainTab,
  RoutineTimeMode,
} from "./context/RoutineCalendarContext";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { Dispatch, SetStateAction } from "react";
import type { HubCalendarEvent, RoutineState } from "./lib/types";

interface MonthCursor {
  y: number;
  m: number;
}

interface DateRange {
  startKey: string;
  endKey: string;
}

const FIZRUK_PLAN_SYNC = "fizruk-storage-monthly-plan";

function todayDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function monthBounds(y: number, m0: number): DateRange {
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  return {
    startKey: dateKeyFromDate(start),
    endKey: dateKeyFromDate(end),
  };
}

function monthGrid(
  y: number,
  monthIndex: number,
): { cells: Array<number | null> } {
  const last = new Date(y, monthIndex + 1, 0).getDate();
  const firstWd = (new Date(y, monthIndex, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells };
}

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

const HABIT_TIME_GROUPS = ["Ранок", "День", "Вечір", "Будь-коли"];
const GROUP_ORDER = [
  ...HABIT_TIME_GROUPS,
  FIZRUK_GROUP_LABEL,
  FINYK_SUB_GROUP_LABEL,
];

function timeOfDayBucket(hhmm: string | null | undefined): string {
  const t = (hhmm || "").trim();
  if (!t) return "Будь-коли";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return "Будь-коли";
  const h = Number(m[1]);
  if (!Number.isFinite(h)) return "Будь-коли";
  if (h < 12) return "Ранок";
  if (h <= 18) return "День";
  return "Вечір";
}

function groupEventsForList(
  events: HubCalendarEvent[],
): Array<[string, HubCalendarEvent[]]> {
  const map = new Map<string, HubCalendarEvent[]>();
  for (const e of events) {
    let head: string;
    if (e.fizruk) head = FIZRUK_GROUP_LABEL;
    else if (e.finykSub) head = FINYK_SUB_GROUP_LABEL;
    else if (e.sourceKind === "habit") head = timeOfDayBucket(e.timeOfDay);
    else head = e.tagLabels[0] || "Інше";
    const existing = map.get(head);
    if (existing) existing.push(e);
    else map.set(head, [e]);
  }
  return [...map.entries()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a[0]);
    const bi = GROUP_ORDER.indexOf(b[0]);
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "uk");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export interface RoutineAppProps {
  onBackToHub?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function RoutineApp({
  onBackToHub,
  onOpenModule,
  pwaAction,
  onPwaActionConsumed,
}: RoutineAppProps = {}) {
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

  const [mainTab, setMainTab] = useLocalStorageState<RoutineMainTab>(
    STORAGE_KEYS.ROUTINE_MAIN_TAB,
    "calendar",
    {
      raw: true,
      validate: (v): v is RoutineMainTab => v === "calendar" || v === "stats",
    },
  );

  // Deep-link: коли модуль відкритий з hash `#calendar` чи `#stats`
  // (напр. з Fizruk → «Запланувати тренування»), форсуємо вкладку
  // незалежно від попередньо збереженої у localStorage. Прибираємо
  // hash після застосування, щоб back-навігація / refresh не
  // повторювали стрибок.
  useEffect(() => {
    let raw = "";
    try {
      raw = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
    } catch {
      return;
    }
    if (raw !== "calendar" && raw !== "stats") return;
    setMainTab(raw);
    try {
      const next = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", next);
    } catch {
      /* noop */
    }
    // Один раз на mount — наступні переходи між вкладками — через
    // RoutineBottomNav, без url hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [timeMode, setTimeMode] = useState<RoutineTimeMode>("today");
  const now = todayDate();
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => ({
    y: now.getFullYear(),
    m: now.getMonth(),
  }));
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    dateKeyFromDate(now),
  );
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState<string>("");

  // Quick-create dialog state. The `add_habit` PWA action opens a
  // bottom-sheet modal overlaid on whatever tab the user is already on
  // (#S0.2). The tick is bumped each time so the dialog re-focuses its
  // name input when reopened after a previous close.
  const [quickAddHabitOpen, setQuickAddHabitOpen] = useState<boolean>(false);
  const [quickAddFocusTick, setQuickAddFocusTick] = useState<number>(0);

  useEffect(() => {
    if (pwaAction !== "add_habit") return;
    setQuickAddHabitOpen(true);
    setQuickAddFocusTick((t) => t + 1);
    onPwaActionConsumed?.();
  }, [pwaAction, onPwaActionConsumed]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("routineDay");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
        setSelectedDay(q);
        setTimeMode("day");
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
  }, []);

  useEffect(() => {
    if (timeMode !== "month") return;
    const { startKey, endKey } = monthBounds(monthCursor.y, monthCursor.m);
    setSelectedDay((d) => (d < startKey || d > endKey ? startKey : d));
  }, [monthCursor.y, monthCursor.m, timeMode]);

  const range = useMemo<DateRange>(() => {
    const t = todayDate();
    const tk = dateKeyFromDate(t);
    if (timeMode === "today") return { startKey: tk, endKey: tk };
    if (timeMode === "tomorrow") {
      const d = addDays(t, 1);
      const k = dateKeyFromDate(d);
      return { startKey: k, endKey: k };
    }
    if (timeMode === "day") {
      return { startKey: selectedDay, endKey: selectedDay };
    }
    if (timeMode === "week") {
      const anchor = parseDateKey(selectedDay);
      const s = startOfIsoWeek(anchor);
      const e = addDays(s, 6);
      return { startKey: dateKeyFromDate(s), endKey: dateKeyFromDate(e) };
    }
    return monthBounds(monthCursor.y, monthCursor.m);
  }, [timeMode, monthCursor.y, monthCursor.m, selectedDay]);

  const events = useMemo(
    () =>
      buildHubCalendarEvents(routine, range, {
        showFizruk: routine.prefs.showFizrukInCalendar !== false,
        showFinykSubs: routine.prefs.showFinykSubscriptionsInCalendar !== false,
      }),
    /* finykCalendarTick лишаємо: оновлення подій Фініка без зміни routine */
    [routine, range, finykCalendarTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = useMemo(() => {
    let ev = events;
    if (tagFilter) {
      if (tagFilter === "__fizruk") ev = ev.filter((e) => e.fizruk);
      else if (tagFilter === "__finyk_sub") ev = ev.filter((e) => e.finykSub);
      else ev = ev.filter((e) => e.tagLabels.includes(tagFilter));
    }
    const q = listQuery.trim().toLowerCase();
    if (q) {
      ev = ev.filter((e) => {
        const hay =
          `${e.title} ${e.subtitle} ${(e.tagLabels || []).join(" ")} ${e.note || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return ev;
  }, [events, tagFilter, listQuery]);

  const tagChips = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const t of routine.tags) set.add(t.name);
    for (const e of events) {
      for (const x of e.tagLabels) {
        if (x !== FIZRUK_GROUP_LABEL && x !== FINYK_SUB_GROUP_LABEL) set.add(x);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [routine.tags, events]);

  const listEvents = useMemo(() => {
    if (timeMode === "month")
      return filtered.filter((e) => e.date === selectedDay);
    return filtered;
  }, [filtered, timeMode, selectedDay]);

  const grouped = useMemo(() => groupEventsForList(listEvents), [listEvents]);

  const dayCounts = useMemo(() => countEventsByDate(events), [events]);

  const goMonth = useCallback((delta: number) => {
    setMonthCursor((c) => {
      let m = c.m + delta;
      let y = c.y;
      if (m > 11) {
        m = 0;
        y++;
      }
      if (m < 0) {
        m = 11;
        y--;
      }
      return { y, m };
    });
  }, []);

  const goToToday = useCallback(() => {
    const t = todayDate();
    setMonthCursor({ y: t.getFullYear(), m: t.getMonth() });
    setSelectedDay(dateKeyFromDate(t));
  }, []);

  const applyTimeMode = useCallback((id: RoutineTimeMode) => {
    const t = todayDate();
    const tk = dateKeyFromDate(t);
    if (id === "today") {
      setSelectedDay(tk);
      setTimeMode("today");
    } else if (id === "tomorrow") {
      setSelectedDay(dateKeyFromDate(addDays(t, 1)));
      setTimeMode("tomorrow");
    } else if (id === "week") {
      setSelectedDay(tk);
      setTimeMode("week");
    } else if (id === "month") {
      setMonthCursor({ y: t.getFullYear(), m: t.getMonth() });
      setSelectedDay(tk);
      setTimeMode("month");
    }
  }, []);

  const shiftWeekStrip = useCallback((deltaWeeks: number) => {
    setSelectedDay((prev) => {
      const d = parseDateKey(prev);
      d.setDate(d.getDate() + 7 * deltaWeeks);
      return dateKeyFromDate(d);
    });
    setTimeMode("day");
  }, []);

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
    const dk = range.startKey;
    if (range.startKey !== range.endKey) return;
    setRoutine((s) => markAllScheduledHabitsComplete(s, dk));
    hapticSuccess();
  }, [range.startKey, range.endKey, setRoutine]);

  const canBulkMark = useMemo(() => {
    if (range.startKey !== range.endKey) return false;
    const dk = range.startKey;
    for (const h of routine.habits) {
      if (h.archived) continue;
      if (!habitScheduledOnDate(h, dk)) continue;
      if (!(routine.completions[h.id] || []).includes(dk)) return true;
    }
    return false;
  }, [range.startKey, range.endKey, routine.habits, routine.completions]);

  const monthTitle = new Date(
    monthCursor.y,
    monthCursor.m,
    1,
  ).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const { cells } = monthGrid(monthCursor.y, monthCursor.m);

  const rangeLabel = useMemo(() => {
    if (timeMode === "today") return "Сьогодні";
    if (timeMode === "tomorrow") return "Завтра";
    if (timeMode === "day") {
      return parseDateKey(selectedDay).toLocaleDateString("uk-UA", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
    if (timeMode === "week") return "Цей тиждень";
    return monthTitle;
  }, [timeMode, monthTitle, selectedDay]);

  const fmtUk = (key: string) =>
    parseDateKey(key).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  const headlineDate = useMemo(() => {
    const t0 = todayDate();
    const tk = dateKeyFromDate(t0);
    if (timeMode === "day") return fmtUk(selectedDay);
    if (timeMode === "today") return fmtUk(tk);
    if (timeMode === "tomorrow") return fmtUk(dateKeyFromDate(addDays(t0, 1)));
    if (timeMode === "week") {
      const a = fmtUk(range.startKey);
      const b = fmtUk(range.endKey);
      return range.startKey === range.endKey ? a : `${a} — ${b}`;
    }
    if (timeMode === "month") return fmtUk(selectedDay);
    return fmtUk(tk);
  }, [timeMode, selectedDay, range.startKey, range.endKey]);

  const todayKey = dateKeyFromDate(todayDate());
  const streakMax = useMemo(
    () => maxActiveStreak(routine.habits, routine.completions, todayKey),
    [routine.habits, routine.completions, todayKey],
  );

  const completionRateVal = useMemo(
    () =>
      completionRateForRange(
        routine.habits,
        routine.completions,
        range.startKey,
        range.endKey,
      ),
    [routine.habits, routine.completions, range.startKey, range.endKey],
  );

  const dayProgress = useMemo(
    () =>
      completionRateForRange(
        routine.habits,
        routine.completions,
        todayKey,
        todayKey,
      ),
    [routine.habits, routine.completions, todayKey],
  );

  const activeHabitsCount = routine.habits.filter((h) => !h.archived).length;
  const hasNoHabits = activeHabitsCount === 0;
  const hasListFilter = Boolean(tagFilter) || listQuery.trim().length > 0;
  const listIsEmpty = grouped.length === 0;

  // Routine is local-first (localStorage) and the visible state is
  // recomputed from `routine` on each render, so PTR's only job is to
  // ask the App-level cloud-sync engine for a pull. The `routine`
  // listener (`ROUTINE_EVENT`) re-renders us when the engine writes new
  // state into localStorage.
  const handlePullRefresh = useCallback(() => requestCloudPull(2500), []);
  const handlePullRefreshError = useCallback(() => {
    toast.error("Не вдалося оновити дані. Перевір з'єднання.");
  }, [toast]);

  return (
    <ModuleAccentProvider module="routine" asShellRoot>
      <ModuleHeader
        module="routine"
        left={
          typeof onBackToHub === "function" ? (
            <ModuleHeaderBackButton onClick={onBackToHub} />
          ) : (
            <div
              className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border",
                C.iconBox,
              )}
              aria-hidden
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M8 14h.01M12 14h.01M16 14h.01" />
              </svg>
            </div>
          )
        }
        title="РУТИНА"
        subtitle="Звички · план Фізрука · один розклад"
        right={<ModuleHeaderAssistantButton />}
      />

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <PullToRefresh
          as="main"
          id="routine-main"
          tabIndex={-1}
          onRefresh={handlePullRefresh}
          onError={handlePullRefreshError}
          variant="routine"
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
                  onClick={() => setStorageErrorMsg(null)}
                  className="shrink-0 text-xs font-semibold text-danger/80 hover:text-danger"
                  aria-label="Закрити повідомлення"
                >
                  Закрити
                </button>
              </Banner>
            )}
            <RoutineCalendarProvider
              data={useMemo(
                () => ({
                  rangeLabel,
                  headlineDate,
                  filtered,
                  routine,
                  currentStreak: streakMax,
                  completionRate: completionRateVal,
                  dayProgress,
                  timeMode,
                  selectedDay,
                  todayKey,
                  shiftWeekStrip,
                  setSelectedDay,
                  setTimeMode,
                  listQuery,
                  setListQuery,
                  tagFilter,
                  setTagFilter,
                  tagChips,
                  monthCursor,
                  monthTitle,
                  goMonth,
                  goToToday,
                  cells,
                  dayCounts,
                  listIsEmpty,
                  hasListFilter,
                  hasNoHabits,
                  grouped,
                  canBulkMark,
                }),
                [
                  rangeLabel,
                  headlineDate,
                  filtered,
                  routine,
                  streakMax,
                  completionRateVal,
                  dayProgress,
                  timeMode,
                  selectedDay,
                  todayKey,
                  shiftWeekStrip,
                  setSelectedDay,
                  setTimeMode,
                  listQuery,
                  setListQuery,
                  tagFilter,
                  setTagFilter,
                  tagChips,
                  monthCursor,
                  monthTitle,
                  goMonth,
                  goToToday,
                  cells,
                  dayCounts,
                  listIsEmpty,
                  hasListFilter,
                  hasNoHabits,
                  grouped,
                  canBulkMark,
                ],
              )}
              actions={useMemo(
                () => ({
                  applyTimeMode,
                  onToggleHabit,
                  setRoutine,
                  setMainTab,
                  onOpenModule,
                  onBulkMarkDay,
                  onOpenQuickAddHabit: () => {
                    setQuickAddHabitOpen(true);
                    setQuickAddFocusTick((t) => t + 1);
                  },
                }),
                [
                  applyTimeMode,
                  onToggleHabit,
                  setRoutine,
                  setMainTab,
                  onOpenModule,
                  onBulkMarkDay,
                ],
              )}
            >
              <SectionErrorBoundary title="Не вдалось показати «Календар»">
                {isHabitPending && mainTab === "calendar" ? (
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
                ) : (
                  <RoutineCalendarPanel hidden={mainTab !== "calendar"} />
                )}
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

      <RoutineBottomNav
        mainTab={mainTab}
        onSelectTab={setMainTab}
        onAddHabit={() => {
          setQuickAddHabitOpen(true);
          setQuickAddFocusTick((t) => t + 1);
        }}
      />

      <HabitQuickCreateDialog
        open={quickAddHabitOpen}
        routine={routine}
        setRoutine={setRoutine}
        onClose={() => setQuickAddHabitOpen(false)}
        focusTick={quickAddFocusTick}
      />
    </ModuleAccentProvider>
  );
}
