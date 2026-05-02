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

function resetStore() {
  _getMMKVInstance().clearAll();
}

function renderDashboard() {
  return render(
    <ToastProvider>
      <HubDashboard />
    </ToastProvider>,
  );
}

describe("HubDashboard one-hero rule", () => {
  beforeEach(() => {
    resetStore();
    mockUserData.data = { user: null };
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
