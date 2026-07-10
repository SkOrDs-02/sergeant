// @vitest-environment jsdom
/**
 * Branch-focused coverage for useRoutineAppState — bulk-mark guard,
 * persisted-tab restore, PWA edge cases, and storage-error defaults.
 */
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
  persistedTab: "calendar" as "calendar" | "stats",
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
  useLocalStorageState: () => [
    routineAppMocks.persistedTab,
    routineAppMocks.setPersistedTab,
  ],
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

describe("useRoutineAppState (branches)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineAppMocks.persistedTab = "calendar";
    routineAppMocks.location.pathname = "/routine";
    routineAppMocks.location.search = "";
    routineAppMocks.location.hash = "";
    routineAppMocks.route.page = "calendar";
    routineAppMocks.route.navigate = routineAppMocks.routeNavigate;
    routineAppMocks.firstRun.firstRun = false;
    routineAppMocks.firstRun.markSeen = routineAppMocks.markSeen;
    routineAppMocks.derived.range = {
      startKey: "2026-06-25",
      endKey: "2026-06-25",
    };
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("skips bulk mark when the visible range spans multiple days", () => {
    routineAppMocks.derived.range = {
      startKey: "2026-06-25",
      endKey: "2026-06-26",
    };
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onBulkMarkDay());
    expect(routineAppMocks.hapticSuccess).not.toHaveBeenCalled();
    expect(result.current.routine).not.toMatchObject({
      bulkMarked: expect.anything(),
    });
  });

  it("ignores an unknown pwaAction without opening quick-add", async () => {
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

    rerender({ action: "unknown_action", onPwaActionConsumed: onConsumed });
    expect(result.current.quickAddHabitOpen).toBe(false);
    await waitFor(() => {
      expect(onConsumed).not.toHaveBeenCalled();
    });
  });

  it("restores the persisted stats tab on bare /routine entry", () => {
    routineAppMocks.persistedTab = "stats";
    renderHook(() => useRoutineAppState({}));
    expect(routineAppMocks.routeNavigate).toHaveBeenCalledWith("stats");
  });

  it("ignores an invalid routineDay deep-link param", () => {
    routineAppMocks.location.search = "?routineDay=not-a-date";
    renderHook(() => useRoutineAppState({}));
    expect(routineAppMocks.deepLinkDay).not.toHaveBeenCalled();
    expect(routineAppMocks.reactNavigate).not.toHaveBeenCalled();
  });

  it("uses a fallback storage-error message when detail.message is missing", () => {
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("routine:storage-error", { detail: {} }),
      );
    });
    expect(result.current.storageErrorMsg).toBe("невідома помилка");
  });

  it("setMainTab accepts a functional updater", () => {
    routineAppMocks.route.page = "calendar";
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() =>
      result.current.setMainTab((prev) =>
        prev === "calendar" ? "stats" : prev,
      ),
    );
    expect(routineAppMocks.setPersistedTab).toHaveBeenCalledWith("stats");
    expect(routineAppMocks.routeNavigate).toHaveBeenCalledWith("stats");
  });
});
