/**
 * Render smoke test for the Hub-core Settings shell.
 *
 * Keeps the scope tight:
 *  1. The shell renders the screen title and all nine Hub-core section headers.
 *  2. `HubModuleStorageBoot` is mounted — all four module storage boot hooks
 *     are called on render (settings-first boot guarantee).
 *
 * Section-level behaviour is covered by per-section suites.
 */

import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";

import { apiClient } from "@/api/apiClient";
import { _getMMKVInstance } from "@/lib/storage";

// --- module storage boot hook mocks (via HubModuleStorageBoot) ---
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
  mockUseFinykDualWriteBoot.mockReset();
  mockUseRoutineDualWriteBoot.mockReset();
  mockUseFinykSqliteReadBoot.mockReset();
  mockUseFinykMonoMirrorBoot.mockReset();
  mockUseRoutineSqliteReadBoot.mockReset();
  mockUseFizrukSqliteReadBoot.mockReset();
  mockUseNutritionSqliteReadBoot.mockReset();
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

  it("mounts HubModuleStorageBoot — all seven storage boot hooks are called", () => {
    renderPage();

    // Settings-first boot guarantee: all write registrations and read-caches
    // must be active before any settings mutation or Hub aggregator can fire,
    // even if the user has never visited the module tabs.
    expect(mockUseFinykDualWriteBoot).toHaveBeenCalled();
    expect(mockUseRoutineDualWriteBoot).toHaveBeenCalled();
    expect(mockUseFinykSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseFinykMonoMirrorBoot).toHaveBeenCalled();
    expect(mockUseRoutineSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseFizrukSqliteReadBoot).toHaveBeenCalled();
    expect(mockUseNutritionSqliteReadBoot).toHaveBeenCalled();
  });
});
