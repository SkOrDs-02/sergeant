/**
 * Render smoke test for the Hub-core Settings shell.
 *
 * Keeps the scope tight: the shell renders the screen title and all
 * nine Hub-core section headers (General / Notifications / Routine /
 * Finyk / Fizruk / AIDigest / Assistant / Experimental / Account).
 * Section-level behaviour
 * is covered by the per-section suites.
 */

import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";

import { apiClient } from "@/api/apiClient";
import { _getMMKVInstance } from "@/lib/storage";

// `AIDigestSection` calls `useWeeklyDigest`, which subscribes to a
// TanStack Query that fires a `setState` on the next microtask. The
// update reaches the settings tree after the synchronous render in
// each test — surfacing as an "An update inside a test was not
// wrapped in act" warning, and on slower CI runners it tips the
// first render past the default 5 s Jest timeout. This is a smoke
// suite for the section-header inventory only, so we stub the hook
// in the same shape `HubDashboard.test.tsx` uses.
jest.mock("../dashboard/useWeeklyDigest", () => ({
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

import { HubSettingsPage } from "./HubSettingsPage";

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock("expo-notifications", () => ({
  __esModule: true,
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, status: "undetermined" }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: "granted" }),
  ),
}));

// `react-native-safe-area-context` is mocked globally in `jest.setup.js`
// (Provider becomes a Fragment, `useSafeAreaInsets` returns zeros). The
// previous local mock used `jest.requireActual(...)` which forced the
// real module to load and re-introduced the "No safe area value
// available" crash because the real `useSafeAreaInsets` requires a
// Provider context.

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

function renderPage() {
  // AccountSection calls `useQueryClient()`, so the shell needs a
  // QueryClientProvider in scope. A fresh client per render keeps the
  // smoke tests isolated.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={client}>
        <HubSettingsPage />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe("HubSettingsPage", () => {
  it("renders the screen title and all section headers", () => {
    const { getByText, getAllByText } = renderPage();

    expect(getByText("Налаштування")).toBeTruthy();
    // Each section title appears at least once in the
    // `SETTING_GROUPS` shell and may also be rendered by the matching
    // section component (e.g. `GeneralSection` renders a nested
    // `<SettingsGroup title="Загальні" />`, `AccountSection` renders an
    // "Акаунт" header). Both renders are intentional, so assert
    // presence via `getAllByText` instead of pinning the count.
    expect(getAllByText("Загальні").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Сповіщення").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Рутина").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Фінік").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Фізрук").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("AI Звіт тижня").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Можливості асистента").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(getAllByText("Експериментальне").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Акаунт").length).toBeGreaterThanOrEqual(1);
  });
});
