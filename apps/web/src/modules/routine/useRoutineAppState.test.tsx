/** @vitest-environment jsdom */
/**
 * Orchestration tests for useRoutineAppState.
 *
 * The hook composes ~8 child hooks and several storage side effects, so
 * we mock every collaborator down to a controllable fixture and exercise
 * the App-level state the orchestrator actually owns: quick-add dialog,
 * the PWA `add_habit` deep-link, first-run prompt, the storage-error
 * banner, habit toggle / bulk-mark wiring and pull-to-refresh.
 */
import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { useState as reactUseState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

// Stable handle to React.useState for the mocked storage hook. The
// reference is captured at module-eval time but only invoked lazily
// from inside the mock factory's returned closure (after hoisting), so
// there is no TDZ hazard.
const useStateRef = reactUseState;

const h = vi.hoisted(() => ({
  loadRoutineState: vi.fn(),
  toggleHabitCompletion: vi.fn(),
  markAllScheduledHabitsComplete: vi.fn(),
  requestCloudPull: vi.fn(),
  toastError: vi.fn(),
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
  parseKyivDate: vi.fn(),
  deepLinkDay: vi.fn(),
  firstRunHandle: { firstRun: false, markSeen: vi.fn() },
  navigateSpy: vi.fn(),
}));

vi.mock("./lib/routineStorage", () => ({
  loadRoutineState: h.loadRoutineState,
  toggleHabitCompletion: h.toggleHabitCompletion,
  markAllScheduledHabitsComplete: h.markAllScheduledHabitsComplete,
  ROUTINE_EVENT: "hub-routine-storage",
  ROUTINE_STORAGE_ERROR: "hub-routine-storage-error",
}));
vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: h.requestCloudPull,
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: h.toastError, success: vi.fn() }),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: h.hapticTap,
  hapticSuccess: h.hapticSuccess,
}));
vi.mock("@shared/lib/time/kyivTime", () => ({
  parseKyivDate: h.parseKyivDate,
}));
vi.mock("@shared/hooks/useLocalStorageState", () => ({
  // raw localStorage-backed tab; a simple useState stand-in is enough.
  useLocalStorageState: (_k: string, initial: unknown) => useStateRef(initial),
}));
vi.mock("./hooks/useRoutineRoute", () => ({
  useRoutineRoute: () => ({ page: "calendar", navigate: h.navigateSpy }),
}));
vi.mock("../../core/hub/useFinykHubPreview", () => ({
  useFinykHubPreview: () => ({ dataUpdatedAt: 0 }),
}));
vi.mock("../../core/onboarding/useModuleFirstRun", () => ({
  // Return a STABLE object reference (the real hook memoises it); the
  // first-run effect depends on this object, so a fresh literal each
  // render would loop forever once `firstRun` is true.
  useModuleFirstRun: () => h.firstRunHandle,
}));
vi.mock("./hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: vi.fn(),
}));
vi.mock("./hooks/useSqliteReadBoot", () => ({
  useSqliteReadBoot: vi.fn(),
}));
vi.mock("./hooks/useRoutineReminders", () => ({
  useRoutineReminders: vi.fn(),
}));
vi.mock("./useRoutineTimeState", () => ({
  useRoutineTimeState: () => ({
    timeMode: "today",
    monthCursor: { y: 2026, m: 5 },
    selectedDay: "2026-06-24",
    applyTimeMode: vi.fn(),
    goMonth: vi.fn(),
    goToToday: vi.fn(),
    shiftWeekStrip: vi.fn(),
    setSelectedDay: vi.fn(),
    setTimeMode: vi.fn(),
    deepLinkDay: h.deepLinkDay,
  }),
}));
vi.mock("./useRoutineDerivedData", () => ({
  useRoutineDerivedData: () => ({
    range: { startKey: "2026-06-24", endKey: "2026-06-24" },
    rangeLabel: "Сьогодні",
    headlineDate: "24 червня",
    filtered: [],
    grouped: [],
    tagChips: [],
    dayCounts: new Map(),
    monthTitle: "Червень 2026",
    cells: [],
    todayKey: "2026-06-24",
    streakMax: 5,
    completionRateVal: { done: 0, total: 0, pct: 0 },
    dayProgress: { done: 0, total: 0, pct: 0 },
    hasNoHabits: true,
    hasListFilter: false,
    listIsEmpty: true,
    canBulkMark: true,
  }),
}));

import { useRoutineAppState } from "./useRoutineAppState";

const STATE = { habits: [], completions: {} };

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/routine"]}>{children}</MemoryRouter>;
}

function setup(params: Parameters<typeof useRoutineAppState>[0] = {}) {
  return renderHook(() => useRoutineAppState(params), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to a fresh, stable handle so the first-run effect deps are
  // identity-stable within a render tree (no re-run loop).
  h.firstRunHandle = { firstRun: false, markSeen: vi.fn() };
  h.loadRoutineState.mockReturnValue(STATE);
  h.toggleHabitCompletion.mockImplementation((s) => s);
  h.markAllScheduledHabitsComplete.mockImplementation((s) => s);
  h.requestCloudPull.mockResolvedValue(undefined);
  h.parseKyivDate.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRoutineAppState", () => {
  it("exposes seeded routine state and derived streakMax", () => {
    const { result } = setup();
    expect(result.current.routine).toBe(STATE);
    expect(result.current.streakMax).toBe(5);
    expect(result.current.mainTab).toBe("calendar");
    expect(result.current.quickAddHabitOpen).toBe(false);
  });

  it("opens and closes the quick-add dialog, bumping the focus tick on open", () => {
    const { result } = setup();
    const tick0 = result.current.quickAddFocusTick;
    act(() => result.current.openQuickAddHabit());
    expect(result.current.quickAddHabitOpen).toBe(true);
    expect(result.current.quickAddFocusTick).toBe(tick0 + 1);
    act(() => result.current.closeQuickAddHabit());
    expect(result.current.quickAddHabitOpen).toBe(false);
  });

  it("opens quick-add from the add_habit PWA action and consumes it", () => {
    const onPwaActionConsumed = vi.fn();
    const { result } = setup({ pwaAction: "add_habit", onPwaActionConsumed });
    expect(result.current.quickAddHabitOpen).toBe(true);
    expect(onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated PWA actions", () => {
    const onPwaActionConsumed = vi.fn();
    const { result } = setup({ pwaAction: "other", onPwaActionConsumed });
    expect(result.current.quickAddHabitOpen).toBe(false);
    expect(onPwaActionConsumed).not.toHaveBeenCalled();
  });

  it("pops the first-run quick-add hint and marks the module seen", () => {
    h.firstRunHandle = { firstRun: true, markSeen: vi.fn() };
    const { result } = setup();
    expect(result.current.quickAddHabitOpen).toBe(true);
    expect(result.current.quickAddFirstRunHint).toBe(true);
    expect(h.firstRunHandle.markSeen).toHaveBeenCalledTimes(1);
    act(() => result.current.dismissQuickAddFirstRunHint());
    expect(result.current.quickAddFirstRunHint).toBe(false);
  });

  it("does NOT show the first-run hint when a PWA add_habit action is present", () => {
    h.firstRunHandle = { firstRun: true, markSeen: vi.fn() };
    const { result } = setup({ pwaAction: "add_habit" });
    expect(result.current.quickAddFirstRunHint).toBe(false);
    expect(h.firstRunHandle.markSeen).not.toHaveBeenCalled();
  });

  it("populates the storage-error banner from the routine storage-error event", () => {
    const { result } = setup();
    expect(result.current.storageErrorMsg).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("hub-routine-storage-error", {
          detail: { message: "Сховище переповнене" },
        }),
      );
    });
    expect(result.current.storageErrorMsg).toBe("Сховище переповнене");
  });

  it("falls back to a default message when the error event carries no message", () => {
    const { result } = setup();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("hub-routine-storage-error", { detail: {} }),
      );
    });
    expect(result.current.storageErrorMsg).toBe("невідома помилка");
  });

  it("toggling a habit fires a tap haptic and runs the storage updater", () => {
    const { result } = setup();
    act(() => {
      result.current.calendarActions.onToggleHabit("h1", "2026-06-24");
    });
    expect(h.hapticTap).toHaveBeenCalledTimes(1);
    expect(h.toggleHabitCompletion).toHaveBeenCalledWith(
      STATE,
      "h1",
      "2026-06-24",
    );
  });

  it("bulk-marking the day fires a success haptic when range is a single day", () => {
    const { result } = setup();
    act(() => {
      result.current.calendarActions.onBulkMarkDay();
    });
    expect(h.markAllScheduledHabitsComplete).toHaveBeenCalledWith(
      STATE,
      "2026-06-24",
    );
    expect(h.hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it("handlePullRefresh delegates to requestCloudPull", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handlePullRefresh();
    });
    expect(h.requestCloudPull).toHaveBeenCalledWith(2500);
  });

  it("handlePullRefreshError surfaces a retry toast wired to requestCloudPull", () => {
    const { result } = setup();
    act(() => {
      result.current.handlePullRefreshError();
    });
    expect(h.toastError).toHaveBeenCalledTimes(1);
    const action = (h.toastError as Mock).mock.calls[0]![2] as {
      label: string;
      onClick: () => void;
    };
    expect(action.label).toBe("Повторити");
    action.onClick();
    expect(h.requestCloudPull).toHaveBeenCalledWith(2500);
  });

  it("setMainTab routes through the navigate setter", () => {
    const { result } = setup();
    act(() => result.current.setMainTab("stats"));
    expect(h.navigateSpy).toHaveBeenCalledWith("stats");
  });

  it("applies a valid ?routineDay deep-link once on mount", () => {
    h.parseKyivDate.mockReturnValue(new Date("2026-06-20T12:00:00"));
    renderHook(() => useRoutineAppState({}), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/routine?routineDay=2026-06-20"]}>
          {children}
        </MemoryRouter>
      ),
    });
    expect(h.deepLinkDay).toHaveBeenCalledWith("2026-06-20");
  });

  it("ignores an invalid ?routineDay deep-link", () => {
    h.parseKyivDate.mockReturnValue(null);
    renderHook(() => useRoutineAppState({}), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/routine?routineDay=2026-02-30"]}>
          {children}
        </MemoryRouter>
      ),
    });
    expect(h.deepLinkDay).not.toHaveBeenCalled();
  });

  it("re-reads routine state on the routine storage event", () => {
    const { result } = setup();
    const next = { habits: [{ id: "x" }], completions: {} };
    h.loadRoutineState.mockReturnValue(next);
    act(() => {
      window.dispatchEvent(new CustomEvent("hub-routine-storage"));
    });
    expect(result.current.routine).toBe(next);
  });
});
