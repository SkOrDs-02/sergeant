/**
 * Render + behaviour tests for the Fizruk Dashboard (Phase 6 ·
 * Dashboard PR).
 *
 * The Dashboard is now the fully-featured stack-root of the Fizruk
 * nested router. These tests cover:
 *   1. Coverage guard: every non-dashboard `FizrukPage` is reachable
 *      from the Dashboard (quick-link tiles + hero CTA + recent
 *      "Усі тренування" link).
 *   2. Empty state — no workouts, no measurements, no plan entries —
 *      renders the hero empty card with a CTA that routes to
 *      `/fizruk/workouts`.
 *   3. Quick-link tile presses route to their matching Fizruk segment
 *      with haptic feedback.
 *   4. Active workout state swaps the hero to a "Продовжити" CTA and
 *      surfaces live elapsed seconds.
 *   5. A scheduled "today" plan session renders its template name
 *      and the "Почати тренування" CTA.
 *   6. KPI row reflects `computeDashboardKpis` output (streak / weekly
 *      volume / weight delta).
 *   7. Top PRs + recent workouts surface from the workout history.
 */

import { fireEvent, render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("@sergeant/shared", () => {
  const actual = jest.requireActual("@sergeant/shared");
  return {
    ...actual,
    hapticTap: jest.fn(),
    hapticSuccess: jest.fn(),
    hapticWarning: jest.fn(),
    hapticError: jest.fn(),
    hapticCancel: jest.fn(),
  };
});

// The hooks are mocked per test so we can drive Dashboard rendering
// through controlled fixtures without touching MMKV.
jest.mock("../hooks/useFizrukWorkouts", () => ({
  useFizrukWorkouts: jest.fn(),
}));
jest.mock("../hooks/useMeasurements", () => ({
  useMeasurements: jest.fn(),
}));
jest.mock("../hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: jest.fn(),
}));
jest.mock("../hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: jest.fn(),
}));
jest.mock("../hooks/useActiveFizrukWorkout", () => ({
  useActiveFizrukWorkout: jest.fn(),
}));
// PR #029a wires `useFizrukSqliteReadBoot()` at the top of `Dashboard`
// to warm the SQLite read overlay when the feature flag is on, and the
// PR #028 follow-up adds `useFizrukDualWriteBoot()` next to it. Both
// hooks reach into `useUser()` from `@sergeant/api-client/react`,
// which requires an `ApiClientProvider` ancestor — not present in
// these render-smoke tests. Stub them out so the mounting path stays
// the same as before the read overlay / dual-write boot landed.
jest.mock("../hooks/useFizrukSqliteReadBoot", () => ({
  useFizrukSqliteReadBoot: jest.fn(),
}));
jest.mock("../hooks/useFizrukDualWriteBoot", () => ({
  useFizrukDualWriteBoot: jest.fn(),
}));

import { router } from "expo-router";

import { hapticTap } from "@sergeant/shared";

import {
  Dashboard,
  fizrukDashboardQuickLinkCoverage,
  fizrukNavCardCoverage,
} from "../pages/Dashboard";
import { FIZRUK_PAGES } from "../shell/fizrukRoute";

import { useActiveFizrukWorkout } from "../hooks/useActiveFizrukWorkout";
import { useFizrukWorkouts } from "../hooks/useFizrukWorkouts";
import { useMeasurements } from "../hooks/useMeasurements";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";

const mockWorkouts = useFizrukWorkouts as jest.MockedFunction<
  typeof useFizrukWorkouts
>;
const mockMeasurements = useMeasurements as jest.MockedFunction<
  typeof useMeasurements
>;
const mockMonthlyPlan = useMonthlyPlan as jest.MockedFunction<
  typeof useMonthlyPlan
>;
const mockTemplates = useWorkoutTemplates as jest.MockedFunction<
  typeof useWorkoutTemplates
>;
const mockActive = useActiveFizrukWorkout as jest.MockedFunction<
  typeof useActiveFizrukWorkout
>;

function setupEmptyHooks(): void {
  mockWorkouts.mockReturnValue({
    workouts: [],
  } as unknown as ReturnType<typeof useFizrukWorkouts>);
  mockMeasurements.mockReturnValue({
    entries: [],
  } as unknown as ReturnType<typeof useMeasurements>);
  mockMonthlyPlan.mockReturnValue({
    state: {
      reminderEnabled: false,
      reminderHour: 20,
      reminderMinute: 0,
      days: {},
    },
  } as unknown as ReturnType<typeof useMonthlyPlan>);
  mockTemplates.mockReturnValue({
    templates: [],
    recentlyUsed: [],
  } as unknown as ReturnType<typeof useWorkoutTemplates>);
  mockActive.mockReturnValue({
    activeWorkoutId: null,
    elapsedSec: null,
    setActiveWorkoutId: jest.fn(),
    clearActiveWorkout: jest.fn(),
    restTimer: null,
    startRestTimer: jest.fn(),
    cancelRestTimer: jest.fn(),
    justFinishedRestNaturally: false,
    clearJustFinished: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupEmptyHooks();
});

describe("Fizruk Dashboard · coverage guard", () => {
  it("covers every non-dashboard Fizruk page", () => {
    const coverage = fizrukNavCardCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.extras).toEqual([]);
    expect(FIZRUK_PAGES.length).toBeGreaterThan(1);
  });

  it("quick-link tiles cover every non-dashboard/non-exercise page exactly once", () => {
    const coverage = fizrukDashboardQuickLinkCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.extras).toEqual([]);
  });
});

describe("Fizruk Dashboard · empty state", () => {
  it("renders the hero empty nudge and routes its CTA to /fizruk/workouts", () => {
    const { getByLabelText, getByTestId } = render(<Dashboard />);
    expect(getByTestId("fizruk-dashboard-hero")).toBeTruthy();
    fireEvent.press(getByLabelText("Перейти до тренувань"));
    expect(router.push).toHaveBeenCalledWith("/fizruk/workouts");
    expect(hapticTap).toHaveBeenCalled();
  });

  it("routes a quick-link tile press to the matching segment with haptics", () => {
    const { getByTestId } = render(<Dashboard />);
    fireEvent.press(getByTestId("fizruk-dashboard-quicklinks-plan"));
    expect(router.push).toHaveBeenCalledWith("/fizruk/plan");
    expect(hapticTap).toHaveBeenCalled();
    fireEvent.press(getByTestId("fizruk-dashboard-quicklinks-atlas"));
    expect(router.push).toHaveBeenCalledWith("/fizruk/atlas");
    fireEvent.press(getByTestId("fizruk-dashboard-quicklinks-progress"));
    expect(router.push).toHaveBeenCalledWith("/fizruk/progress");
  });

  it("shows the zero-state KPIs", () => {
    const { getByTestId } = render(<Dashboard />);
    const streak = getByTestId("fizruk-dashboard-kpis-streak");
    expect(streak).toBeTruthy();
    const weight = getByTestId("fizruk-dashboard-kpis-weight");
    expect(weight).toBeTruthy();
  });

  it("renders the 'no workouts yet' empty state", () => {
    const { getByTestId } = render(<Dashboard />);
    expect(getByTestId("fizruk-dashboard-recent-empty")).toBeTruthy();
    expect(getByTestId("fizruk-dashboard-prs-empty")).toBeTruthy();
  });
});

describe("Fizruk Dashboard · active workout", () => {
  it("swaps the hero to a Продовжити CTA and shows elapsed seconds", () => {
    mockActive.mockReturnValue({
      activeWorkoutId: "w-active",
      elapsedSec: 125,
      setActiveWorkoutId: jest.fn(),
      clearActiveWorkout: jest.fn(),
      restTimer: null,
      startRestTimer: jest.fn(),
      cancelRestTimer: jest.fn(),
      justFinishedRestNaturally: false,
      clearJustFinished: jest.fn(),
    });
    mockWorkouts.mockReturnValue({
      workouts: [
        {
          id: "w-active",
          startedAt: "2026-04-22T12:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    } as unknown as ReturnType<typeof useFizrukWorkouts>);

    const { getByTestId, getByText } = render(<Dashboard />);
    expect(getByTestId("fizruk-dashboard-hero-resume")).toBeTruthy();
    expect(getByText("2:05")).toBeTruthy();

    fireEvent.press(getByTestId("fizruk-dashboard-hero-resume"));
    expect(router.push).toHaveBeenCalledWith("/fizruk/workouts");
  });
});

describe("Fizruk Dashboard · scheduled today session", () => {
  it("renders the template name and routes CTA to workouts", () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    mockMonthlyPlan.mockReturnValue({
      state: {
        reminderEnabled: false,
        reminderHour: 20,
        reminderMinute: 0,
        days: { [dateKey]: { templateId: "tpl-push" } },
      },
    } as unknown as ReturnType<typeof useMonthlyPlan>);
    mockTemplates.mockReturnValue({
      templates: [
        {
          id: "tpl-push",
          name: "Push A",
          exerciseIds: ["bench", "ohp"],
          groups: [],
          updatedAt: today.toISOString(),
        },
      ],
      recentlyUsed: [],
    } as unknown as ReturnType<typeof useWorkoutTemplates>);

    const { getByTestId, getByText } = render(<Dashboard />);
    expect(getByText("Push A")).toBeTruthy();
    const startBtn = getByTestId("fizruk-dashboard-hero-start");
    expect(startBtn).toBeTruthy();
    fireEvent.press(startBtn);
    expect(router.push).toHaveBeenCalledWith("/fizruk/workouts");
  });
});

describe("Fizruk Dashboard · history aggregates", () => {
  it("renders top PRs and recent workouts derived from the history", () => {
    mockWorkouts.mockReturnValue({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-04-20T10:00:00Z",
          endedAt: "2026-04-20T11:00:00Z",
          items: [
            {
              id: "i1",
              exerciseId: "squat",
              nameUk: "Присід",
              type: "strength",
              sets: [{ weightKg: 120, reps: 5 }],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "Heavy day",
        },
      ],
    } as unknown as ReturnType<typeof useFizrukWorkouts>);

    const { getByText, getByTestId } = render(<Dashboard />);
    expect(getByText("Heavy day")).toBeTruthy();
    expect(getByText("Присід")).toBeTruthy();
    expect(getByTestId("fizruk-dashboard-prs-row-squat")).toBeTruthy();
  });
});
