/**
 * Integration test for the mobile Finyk Overview screen.
 *
 * Uses the stub `useFinykOverviewData` (empty payload) plus an injected
 * deterministic `now` so assertions on month-sensitive copy stay stable
 * across test runs.
 *
 * Parallels the intent of `apps/web/src/modules/finyk/pages/Overview.test.*`
 * on the web side: confirm zero-state rendering and that nav callbacks
 * wire through to the parent router.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Overview } from "./Overview";
import type { FinykOverviewData } from "./types";

function emptyData(): FinykOverviewData {
  return {
    realTx: [],
    loadingTx: false,
    clientInfo: null,
    accounts: [],
    transactions: [],
    privatTotal: 0,
    budgets: [],
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    excludedTxIds: new Set<string>(),
    monthlyPlan: { income: 0, expense: 0, savings: 0 },
    networthHistory: [],
    txCategories: {},
    txSplits: {},
    manualAssets: [],
    customCategories: [],
    manualExpenses: [],
    frequentCategories: [],
    frequentMerchants: [],
    showBalance: true,
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

describe("Overview screen (mobile)", () => {
  const fixedNow = new Date(2025, 4, 15);

  it("renders the hero card with zero networth on empty data", () => {
    render(<Overview data={emptyData()} now={fixedNow} />);
    expect(screen.getByTestId("finyk-overview-hero")).toBeTruthy();
    expect(screen.getByText("Загальний нетворс")).toBeTruthy();
    expect(screen.getAllByText(/0 ₴/).length).toBeGreaterThan(0);
  });

  it("shows the networth empty-state when history has < 2 points", () => {
    render(<Overview data={emptyData()} now={fixedNow} />);
    expect(screen.getByTestId("finyk-overview-networth-empty")).toBeTruthy();
  });

  it("renders the category chart empty-state with CTA", () => {
    render(<Overview data={emptyData()} now={fixedNow} />);
    expect(screen.getByText("Поки немає витрат")).toBeTruthy();
    expect(screen.getByText("Переглянути операції")).toBeTruthy();
  });

  it("invokes onNavigate with 'transactions' when the CTA is tapped", () => {
    const onNavigate = jest.fn();
    render(
      <Overview data={emptyData()} now={fixedNow} onNavigate={onNavigate} />,
    );
    fireEvent.press(screen.getByText("Переглянути операції"));
    expect(onNavigate).toHaveBeenCalledWith("transactions");
  });

  it("renders the loading skeleton when loadingTx && realTx is empty", () => {
    const data = { ...emptyData(), loadingTx: true };
    render(<Overview data={data} now={fixedNow} />);
    expect(screen.getByTestId("finyk-overview-loading")).toBeTruthy();
  });

  it("hides the first-insight banner until there is at least one tx or manual expense", () => {
    render(<Overview data={emptyData()} now={fixedNow} />);
    expect(screen.queryByTestId("finyk-overview-first-insight")).toBeNull();
  });
});
