/**
 * HubDashboard — one-hero rule tests.
 *
 * Verifies the FTUX priority chain: `FirstActionHeroCard` >
 * `SoftAuthPromptCard` > `TodayFocusCard`. Each frame renders at most
 * one hero. When no recommendation is available `TodayFocusCard`
 * intentionally renders nothing — the bento module rows below already
 * handle quick-add, so a chip fallback would just duplicate them.
 */

import { fireEvent, render } from "@testing-library/react-native";
import { Animated } from "react-native";

import {
  FIRST_ACTION_PENDING_KEY,
  FIRST_REAL_ENTRY_KEY,
  SOFT_AUTH_DISMISSED_KEY,
} from "@sergeant/shared";

import { HubDashboard } from "./HubDashboard";
import { _getMMKVInstance } from "@/lib/storage";
import { ToastProvider } from "@/components/ui/Toast";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

// --- HubModuleStorageBoot hook mocks ---
// Mock the seven boot hooks so HubDashboard tests don't need real SQLite infra.
const mockUseFinykDualWriteBoot = jest.fn();
const mockUseRoutineDualWriteBoot = jest.fn();
const mockUseFinykSqliteReadBoot = jest.fn();
const mockUseFinykMonoMirrorBoot = jest.fn();
const mockUseRoutineSqliteReadBoot = jest.fn();
const mockUseFizrukSqliteReadBoot = jest.fn();
const mockUseNutritionSqliteReadBoot = jest.fn();

jest.mock("@/modules/finyk/hooks/useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: () => mockUseFinykDualWriteBoot(),
}));
jest.mock("@/modules/routine/hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: () => mockUseRoutineDualWriteBoot(),
}));
jest.mock("@/modules/finyk/hooks/useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: () => mockUseFinykSqliteReadBoot(),
}));
jest.mock("@/modules/finyk/hooks/useFinykMonoMirrorBoot", () => ({
  useFinykMonoMirrorBoot: () => mockUseFinykMonoMirrorBoot(),
}));
jest.mock("@/modules/routine/hooks/useRoutineSqliteReadBoot", () => ({
  useRoutineSqliteReadBoot: () => mockUseRoutineSqliteReadBoot(),
}));
jest.mock("@/modules/fizruk/hooks/useFizrukSqliteReadBoot", () => ({
  useFizrukSqliteReadBoot: () => mockUseFizrukSqliteReadBoot(),
}));
jest.mock("@/modules/nutrition/hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: () => mockUseNutritionSqliteReadBoot(),
}));

jest.mock("@/lib/analytics", () => {
  const { ANALYTICS_EVENTS } = jest.requireActual("@sergeant/shared") as {
    ANALYTICS_EVENTS: Record<string, string>;
  };
  return {
    ANALYTICS_EVENTS,
    trackEvent: jest.fn(),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// `useUser()` returns `{ data: { user: null } }` by default so the
// dashboard renders the unsigned-in variant of the hero chain.
const mockUserData: { data: { user: null | { name?: string } } } = {
  data: { user: null },
};
jest.mock("@sergeant/api-client/react", () => ({
  useUser: () => mockUserData,
}));

jest.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({
    digest: null,
    loading: false,
    error: null,
    weekKey: "2026-01-01",
    weekRange: "",
    generate: jest.fn(),
    isCurrentWeek: true,
  }),
}));

jest.mock("./useCoachInsight", () => ({
  useCoachInsight: () => ({
    insight: null,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock("../hints/useHints", () => ({
  useHints: jest.fn(),
}));

function resetStore() {
  const mmkv = _getMMKVInstance();
  mmkv.clearAll();
  mmkv.set("dashboard_drag_coach_seen", JSON.stringify(true));
}

function renderDashboard() {
  return render(
    <ToastProvider>
      <HubDashboard />
    </ToastProvider>,
  );
}

function stubDashboardAnimation() {
  jest.spyOn(Animated, "loop").mockImplementation(
    () =>
      ({
        reset: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }) as never,
  );
}

describe("HubDashboard one-hero rule", () => {
  beforeEach(() => {
    stubDashboardAnimation();
    resetStore();
    mockUserData.data = { user: null };
    mockUseFinykDualWriteBoot.mockReset();
    mockUseRoutineDualWriteBoot.mockReset();
    mockUseFinykSqliteReadBoot.mockReset();
    mockUseFinykMonoMirrorBoot.mockReset();
    mockUseRoutineSqliteReadBoot.mockReset();
    mockUseFizrukSqliteReadBoot.mockReset();
    mockUseNutritionSqliteReadBoot.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows only FirstActionHeroCard when the FTUX flag is pending", () => {
    _getMMKVInstance().set(FIRST_ACTION_PENDING_KEY, "1");

    const { getByTestId, queryByTestId } = renderDashboard();

    expect(getByTestId("first-action-hero")).toBeTruthy();
    expect(queryByTestId("soft-auth-prompt")).toBeNull();
    expect(queryByTestId("today-focus-empty")).toBeNull();
    expect(queryByTestId("today-focus-card-r1")).toBeNull();
  });

  it("shows only SoftAuthPromptCard after first real entry when not signed in", () => {
    const mmkv = _getMMKVInstance();
    mmkv.set(FIRST_REAL_ENTRY_KEY, "1");

    const { getByTestId, queryByTestId } = renderDashboard();

    expect(getByTestId("soft-auth-prompt")).toBeTruthy();
    expect(queryByTestId("first-action-hero")).toBeNull();
    expect(queryByTestId("today-focus-empty")).toBeNull();
  });

  it("hides SoftAuthPromptCard once the user has signed in", () => {
    _getMMKVInstance().set(FIRST_REAL_ENTRY_KEY, "1");
    mockUserData.data = { user: { name: "Test" } };

    const { queryByTestId } = renderDashboard();

    expect(queryByTestId("soft-auth-prompt")).toBeNull();
    // No focus rec available — TodayFocusCard renders nothing in this
    // case; the bento module rows below carry the activation surface.
    expect(queryByTestId("today-focus-empty")).toBeNull();
  });

  it("renders no hero when no FTUX prompt and no focus rec are eligible", () => {
    const { queryByTestId } = renderDashboard();

    expect(queryByTestId("first-action-hero")).toBeNull();
    expect(queryByTestId("soft-auth-prompt")).toBeNull();
    expect(queryByTestId("today-focus-empty")).toBeNull();
  });

  it("respects a previous soft-auth dismissal", () => {
    const mmkv = _getMMKVInstance();
    mmkv.set(FIRST_REAL_ENTRY_KEY, "1");
    mmkv.set(SOFT_AUTH_DISMISSED_KEY, "1");

    const { queryByTestId } = renderDashboard();

    expect(queryByTestId("soft-auth-prompt")).toBeNull();
    expect(queryByTestId("today-focus-empty")).toBeNull();
  });

  it("renders Nutrition in the dashboard stack", () => {
    const { getByTestId } = renderDashboard();

    expect(getByTestId("dashboard-module-row-nutrition")).toBeTruthy();
  });

  it("mounts HubModuleStorageBoot — all seven storage boot hooks are called", () => {
    renderDashboard();

    // Dashboard-first boot guarantee: all SQLite read-caches and dual-write
    // registrations must be active when the Hub dashboard renders so
    // coachSnapshot / weeklyDigestAggregates / searchSources see fresh data
    // even before the user visits any module tab.
    expect(mockUseFinykDualWriteBoot).toHaveBeenCalled();
    expect(mockUseRoutineDualWriteBoot).toHaveBeenCalled();
    expect(mockUseFinykSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseFinykMonoMirrorBoot).toHaveBeenCalled();
    expect(mockUseRoutineSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseFizrukSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseNutritionSqliteReadBoot).toHaveBeenCalled();
  });

  it("navigates to sign-in when SoftAuthPromptCard CTA is tapped", () => {
    const mmkv = _getMMKVInstance();
    mmkv.set(FIRST_REAL_ENTRY_KEY, "1");

    const { getByTestId } = renderDashboard();

    fireEvent.press(getByTestId("soft-auth-open"));

    const { router } = jest.requireMock("expo-router") as {
      router: { push: jest.Mock };
    };
    expect(router.push).toHaveBeenCalledWith("/(auth)/sign-in");
  });
});
