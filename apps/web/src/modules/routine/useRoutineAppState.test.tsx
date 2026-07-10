// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoutineAppState } from "./useRoutineAppState";

const routineAppMocks = vi.hoisted(() => ({
  requestCloudPull: vi.fn(async () => undefined),
  toastError: vi.fn(),
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
  routeNavigate: vi.fn(),
  reactNavigate: vi.fn(),
  setPersistedTab: vi.fn(),
  markSeen: vi.fn(),
  useRoutineDualWriteBoot: vi.fn(),
  useSqliteReadBoot: vi.fn(),
  useRoutineReminders: vi.fn(),
  setTimeMode: vi.fn(),
  setSelectedDay: vi.fn(),
  shiftWeekStrip: vi.fn(),
  goMonth: vi.fn(),
  goToToday: vi.fn(),
  applyTimeMode: vi.fn(),
  deepLinkDay: vi.fn(),
  location: {
    pathname: "/routine",
    search: "",
    hash: "",
  },
  route: {
    page: "calendar" as "calendar" | "stats",
    navigate: vi.fn(),
  },
  firstRun: {
    firstRun: false,
    markSeen: vi.fn(),
  },
  derived: {
    rangeLabel: "Тиждень",
    headlineDate: "Сьогодні",
    filtered: [],
    streakMax: 3,
    completionRateVal: 50,
    dayProgress: { done: 1, total: 2 },
    todayKey: "2026-06-25",
    tagChips: [],
    monthTitle: "Червень",
    cells: [],
    dayCounts: {},
    listIsEmpty: true,
    hasListFilter: false,
    hasNoHabits: false,
    grouped: [],
    canBulkMark: true,
    range: {
      startKey: "2026-06-25",
      endKey: "2026-06-25",
    },
  },
}));

vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: routineAppMocks.requestCloudPull,
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: routineAppMocks.toastError }),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: routineAppMocks.hapticTap,
  hapticSuccess: routineAppMocks.hapticSuccess,
}));
vi.mock("@shared/hooks/useLocalStorageState", () => ({
  useLocalStorageState: () => ["calendar", routineAppMocks.setPersistedTab],
}));
vi.mock("@shared/lib/time/kyivTime", () => ({
  parseKyivDate: (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null,
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => routineAppMocks.location,
  useNavigate: () => routineAppMocks.reactNavigate,
}));
vi.mock("./hooks/useRoutineRoute", () => ({
  useRoutineRoute: () => ({
    page: routineAppMocks.route.page,
    navigate: routineAppMocks.route.navigate,
  }),
}));
vi.mock("../../core/hub/useFinykHubPreview", () => ({
  useFinykHubPreview: () => ({ dataUpdatedAt: 0 }),
}));
vi.mock("../../core/onboarding/useModuleFirstRun", () => ({
  useModuleFirstRun: () => routineAppMocks.firstRun,
}));
vi.mock("./lib/routineStorage", () => ({
  ROUTINE_EVENT: "routine:event",
  ROUTINE_STORAGE_ERROR: "routine:storage-error",
  loadRoutineState: () => ({
    habits: [{ id: "h1", name: "Run", archived: false }],
    completions: {},
  }),
  toggleHabitCompletion: (
    state: unknown,
    habitId: string,
    dateKey: string,
  ) => ({
    ...(state as object),
    toggled: { habitId, dateKey },
  }),
  markAllScheduledHabitsComplete: (state: unknown, dateKey: string) => ({
    ...(state as object),
    bulkMarked: dateKey,
  }),
}));
vi.mock("./hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: routineAppMocks.useRoutineDualWriteBoot,
}));
vi.mock("./hooks/useSqliteReadBoot", () => ({
  useSqliteReadBoot: routineAppMocks.useSqliteReadBoot,
}));
vi.mock("./hooks/useRoutineReminders", () => ({
  useRoutineReminders: routineAppMocks.useRoutineReminders,
}));
vi.mock("../finyk/hubRoutineSync", () => ({
  HUB_FINYK_ROUTINE_SYNC_EVENT: "finyk:routine-sync",
}));
vi.mock("./RoutineApp.helpers", () => ({
  FIZRUK_PLAN_SYNC: "fizruk:plan-sync",
}));
vi.mock("./useRoutineTimeState", () => ({
  useRoutineTimeState: () => ({
    timeMode: "week",
    monthCursor: "2026-06",
    selectedDay: "2026-06-25",
    setTimeMode: routineAppMocks.setTimeMode,
    setSelectedDay: routineAppMocks.setSelectedDay,
    shiftWeekStrip: routineAppMocks.shiftWeekStrip,
    goMonth: routineAppMocks.goMonth,
    goToToday: routineAppMocks.goToToday,
    applyTimeMode: routineAppMocks.applyTimeMode,
    deepLinkDay: routineAppMocks.deepLinkDay,
  }),
}));
vi.mock("./useRoutineDerivedData", () => ({
  useRoutineDerivedData: () => routineAppMocks.derived,
}));

describe("useRoutineAppState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineAppMocks.location.pathname = "/routine";
    routineAppMocks.location.search = "";
    routineAppMocks.location.hash = "";
    routineAppMocks.route.page = "calendar";
    routineAppMocks.route.navigate = routineAppMocks.routeNavigate;
    routineAppMocks.firstRun.firstRun = false;
    routineAppMocks.firstRun.markSeen = routineAppMocks.markSeen;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("composes calendar data/actions and handles quick-add state", () => {
    const onOpenModule = vi.fn();
    const { result } = renderHook(() => useRoutineAppState({ onOpenModule }));

    expect(routineAppMocks.useSqliteReadBoot).toHaveBeenCalledOnce();
    expect(routineAppMocks.useRoutineDualWriteBoot).toHaveBeenCalledOnce();
    expect(routineAppMocks.useRoutineReminders).toHaveBeenCalledOnce();
    expect(result.current.mainTab).toBe("calendar");
    expect(result.current.streakMax).toBe(3);
    expect(result.current.calendarData.rangeLabel).toBe("Тиждень");
    expect(result.current.calendarActions.onOpenModule).toBe(onOpenModule);

    act(() => result.current.openQuickAddHabit());
    expect(result.current.quickAddHabitOpen).toBe(true);
    expect(result.current.quickAddFocusTick).toBe(1);

    act(() => result.current.closeQuickAddHabit());
    expect(result.current.quickAddHabitOpen).toBe(false);

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-06-25"));
    expect(routineAppMocks.hapticTap).toHaveBeenCalledOnce();
    expect(result.current.routine).toMatchObject({
      toggled: { habitId: "h1", dateKey: "2026-06-25" },
    });

    act(() => result.current.calendarActions.onBulkMarkDay());
    expect(routineAppMocks.hapticSuccess).toHaveBeenCalledOnce();
    expect(result.current.routine).toMatchObject({
      bulkMarked: "2026-06-25",
    });
  });

  it("handles pwa add_habit, storage errors, tab changes, and pull refresh errors", async () => {
    const onConsumed = vi.fn();
    const { result, rerender } = renderHook(
      ({
        action,
        onPwaActionConsumed,
      }: {
        action: string | null;
        onPwaActionConsumed: () => void;
      }) =>
        useRoutineAppState({
          pwaAction: action,
          onPwaActionConsumed,
        }),
      {
        initialProps: {
          action: null as string | null,
          onPwaActionConsumed: onConsumed,
        },
      },
    );

    rerender({ action: "add_habit", onPwaActionConsumed: onConsumed });
    await waitFor(() => {
      expect(result.current.quickAddHabitOpen).toBe(true);
    });
    await waitFor(() => {
      expect(onConsumed).toHaveBeenCalledOnce();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("routine:storage-error", {
          detail: { message: "quota" },
        }),
      );
    });
    expect(result.current.storageErrorMsg).toBe("quota");

    act(() => result.current.setMainTab("stats"));
    expect(routineAppMocks.setPersistedTab).toHaveBeenCalledWith("stats");
    expect(routineAppMocks.routeNavigate).toHaveBeenCalledWith("stats");

    await result.current.handlePullRefresh();
    expect(routineAppMocks.requestCloudPull).toHaveBeenCalledWith(2500);

    result.current.handlePullRefreshError();
    expect(routineAppMocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Не вдалося"),
      undefined,
      expect.objectContaining({ label: "Повторити" }),
    );
  });

  it("opens first-run quick add and consumes valid routineDay deep links", async () => {
    routineAppMocks.firstRun.firstRun = true;
    routineAppMocks.location.search = "?routineDay=2026-06-20&keep=1";
    const { result } = renderHook(() => useRoutineAppState({}));

    expect(result.current.quickAddHabitOpen).toBe(true);
    expect(result.current.quickAddFirstRunHint).toBe(true);
    await waitFor(() => {
      expect(routineAppMocks.markSeen).toHaveBeenCalledOnce();
    });
    expect(routineAppMocks.deepLinkDay).toHaveBeenCalledWith("2026-06-20");
    expect(routineAppMocks.reactNavigate).toHaveBeenCalledWith(
      {
        pathname: "/routine",
        search: "?keep=1",
        hash: "",
      },
      { replace: true },
    );

    act(() => result.current.dismissQuickAddFirstRunHint());
    expect(result.current.quickAddFirstRunHint).toBe(false);
  });
});
