// @vitest-environment jsdom
/**
 * Телеметрія петель цінності (Хвиля 2) для routine-чекіну.
 *
 * Окремий файл від `useRoutineAppState.test.tsx` навмисно: там
 * `toggleHabitCompletion` замокано як «завжди новий обʼєкт», що робить
 * неможливим найважливіший тут кейс — тап по НЕзапланованій звичці, який
 * домен віддає тим самим state-ом і який НЕ має рахуватись чекіном.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRoutineState {
  habits: { id: string; archived: boolean }[];
  completions: Record<string, string[]>;
}

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
  // Мутабельний «LS»: тогл читає свіжий стан через `loadRoutineState`.
  store: {
    current: {
      habits: [{ id: "h1", archived: false }],
      completions: {},
    } as FakeRoutineState,
  },
}));

// Часткова підміна, а не заміна всього модуля: якщо перевизначити
// `ANALYTICS_EVENTS` локальним обʼєктом, будь-яка ІНША подія з графа імпортів
// `useRoutineAppState` резолвиться в `undefined` і `trackEvent(undefined)`
// тихо не спрацьовує замість того, щоб впасти. Реальний реєстр лишається в
// грі разом зі своїми замороженими іменами.
vi.mock("../../core/observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../../core/observability/analytics")
  >("../../core/observability/analytics");
  return { ...actual, trackEvent: mocks.trackEvent };
});
vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: vi.fn(async () => undefined),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: vi.fn() }),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: mocks.hapticTap,
  hapticSuccess: mocks.hapticSuccess,
}));
vi.mock("@shared/hooks/useLocalStorageState", () => ({
  useLocalStorageState: () => ["calendar", vi.fn()],
}));
vi.mock("@shared/lib/time/kyivTime", () => ({
  parseKyivDate: () => null,
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/routine", search: "", hash: "" }),
  useNavigate: () => vi.fn(),
}));
vi.mock("./hooks/useRoutineRoute", () => ({
  useRoutineRoute: () => ({ page: "calendar", navigate: vi.fn() }),
}));
vi.mock("../../core/hub/useFinykHubPreview", () => ({
  useFinykHubPreview: () => ({ dataUpdatedAt: 0 }),
}));
vi.mock("../../core/onboarding/useModuleFirstRun", () => ({
  useModuleFirstRun: () => ({ firstRun: false, markSeen: vi.fn() }),
}));
vi.mock("./lib/routineStorage", () => ({
  ROUTINE_EVENT: "routine:event",
  ROUTINE_STORAGE_ERROR: "routine:storage-error",
  loadRoutineState: () => mocks.store.current,
  // Мінімальна, але ЧЕСНА реплiка домену: невідома / незапланована звичка
  // віддає ТОЙ САМИЙ обʼєкт (no-op), інакше — новий стан.
  toggleHabitCompletion: (
    state: FakeRoutineState,
    habitId: string,
    dateKey: string,
  ) => {
    if (!state.habits.some((h) => h.id === habitId)) return state;
    const cur = state.completions[habitId] ?? [];
    const next = cur.includes(dateKey)
      ? cur.filter((d) => d !== dateKey)
      : [...cur, dateKey];
    const nextState: FakeRoutineState = {
      ...state,
      completions: { ...state.completions, [habitId]: next },
    };
    mocks.store.current = nextState;
    return nextState;
  },
  markAllScheduledHabitsComplete: (
    state: FakeRoutineState,
    dateKey: string,
  ) => {
    if (state.habits.length === 0) return state;
    const nextState: FakeRoutineState = {
      ...state,
      completions: { ...state.completions, h1: [dateKey] },
    };
    mocks.store.current = nextState;
    return nextState;
  },
}));
vi.mock("./hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: vi.fn(),
}));
vi.mock("./hooks/useSqliteReadBoot", () => ({ useSqliteReadBoot: vi.fn() }));
vi.mock("./hooks/useRoutineReminders", () => ({
  useRoutineReminders: vi.fn(),
}));
vi.mock("../finyk/hubRoutineSync", () => ({
  HUB_FINYK_ROUTINE_SYNC_EVENT: "finyk:routine-sync",
}));
vi.mock("./RoutineApp.helpers", () => ({
  FIZRUK_PLAN_SYNC: "fizruk:plan-sync",
}));
vi.mock("./useRoutineTimeState", () => ({
  useRoutineTimeState: () => ({
    timeMode: "day",
    monthCursor: "2026-07",
    selectedDay: "2026-07-25",
    setTimeMode: vi.fn(),
    setSelectedDay: vi.fn(),
    shiftWeekStrip: vi.fn(),
    goMonth: vi.fn(),
    goToToday: vi.fn(),
    applyTimeMode: vi.fn(),
    deepLinkDay: vi.fn(),
  }),
}));
vi.mock("./useRoutineDerivedData", () => ({
  useRoutineDerivedData: () => ({
    rangeLabel: "",
    headlineDate: "",
    filtered: [],
    streakMax: 5,
    completionRateVal: 0,
    dayProgress: { completed: 0, scheduled: 1 },
    todayKey: "2026-07-25",
    tagChips: [],
    monthTitle: "",
    cells: [],
    dayCounts: {},
    listIsEmpty: false,
    hasListFilter: false,
    hasNoHabits: false,
    grouped: [],
    canBulkMark: true,
    range: { startKey: "2026-07-25", endKey: "2026-07-25" },
  }),
}));

import { useRoutineAppState } from "./useRoutineAppState";
import {
  markSignalShown,
  resetSignalAttribution,
} from "../../core/observability/valueSignalAttribution";
import { markStreakSeen, resetStreakExposure } from "./lib/streakExposure";

function checkinCalls() {
  return mocks.trackEvent.mock.calls.filter(
    (c) => c[0] === "routine_habit_checked",
  );
}

/** Payload n-ного чекіну. Кидає, якщо події не було — це і є асершен. */
function checkinPayload(index = 0): Record<string, unknown> {
  const call = checkinCalls()[index];
  if (!call) throw new Error(`routine_habit_checked #${index} не полетів`);
  return call[1] as Record<string, unknown>;
}

describe("useRoutineAppState — телеметрія чекіну", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSignalAttribution();
    resetStreakExposure();
    sessionStorage.clear();
    mocks.store.current = {
      habits: [{ id: "h1", archived: false }],
      completions: {},
    };
  });

  it("емітить routine_habit_checked з state=done, source=ui і device-local day_key", () => {
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(checkinCalls()).toHaveLength(1);
    expect(checkinPayload()).toMatchObject({
      state: "done",
      source: "ui",
      day_key: "2026-07-25",
      scope: "max_across_habits",
      after_signal: false,
      ms_since_signal: null,
      signal: null,
      saw_streak_surface: null,
    });
  });

  it("зняття відмітки їде як state=undone, а не як окрема подія", () => {
    mocks.store.current = {
      habits: [{ id: "h1", archived: false }],
      completions: { h1: ["2026-07-25"] },
    };
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(checkinCalls()).toHaveLength(1);
    expect(checkinPayload()).toMatchObject({ state: "undone" });
  });

  it("no-op домену (незапланована звичка) НЕ рахується чекіном", () => {
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() =>
      result.current.calendarActions.onToggleHabit("невідома", "2026-07-25"),
    );

    expect(checkinCalls()).toHaveLength(0);
    // Гаптика — це відгук на тап, вона лишається.
    expect(mocks.hapticTap).toHaveBeenCalledOnce();
  });

  it("дописує поля експозиції стріку, коли полумʼя героя вже бачили", () => {
    markStreakSeen({ surface: "hero_flame", streakDays: 5 });
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(checkinPayload()).toMatchObject({
      saw_streak_surface: "hero_flame",
      streak_days_at_checkin: 5,
    });
    expect(checkinPayload()["ms_since_streak_shown"]).toBeGreaterThanOrEqual(0);
  });

  it("дописує атрибуцію сигналу лише зі свого модуля", () => {
    markSignalShown({ signal: "routine-todo-evening", module: "routine" });
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(checkinPayload()).toMatchObject({
      after_signal: true,
      signal: "routine-todo-evening",
    });
  });

  it("сигнал чужого модуля не атрибутується routine-чекіну", () => {
    markSignalShown({ signal: "finyk-coffee-limit", module: "finyk" });
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(checkinPayload()).toMatchObject({
      after_signal: false,
      signal: null,
    });
  });

  it("масова відмітка їде тією ж подією з source=bulk і без стрік-полів", () => {
    markStreakSeen({ surface: "hero_flame", streakDays: 5 });
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onBulkMarkDay());

    expect(checkinCalls()).toHaveLength(1);
    expect(checkinPayload()).toMatchObject({
      state: "done",
      source: "bulk",
      day_key: "2026-07-25",
      saw_streak_surface: null,
      streak_days_at_checkin: null,
      ms_since_streak_shown: null,
    });
  });

  it("у payload немає ані habit_id, ані назви звички (Hard Rule #21)", () => {
    const { result } = renderHook(() => useRoutineAppState({}));

    act(() => result.current.calendarActions.onToggleHabit("h1", "2026-07-25"));

    expect(Object.keys(checkinPayload()).sort()).toEqual([
      "after_signal",
      "day_key",
      "ms_since_signal",
      "ms_since_streak_shown",
      "saw_streak_surface",
      "scope",
      "signal",
      "source",
      "state",
      "streak_days_at_checkin",
    ]);
  });
});
