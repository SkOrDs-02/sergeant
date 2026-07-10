// @vitest-environment jsdom
/**
 * Branch-focused coverage for the Overview lazy page shell — sync badge,
 * first-insight banner, loading footer, showBalance passthrough, and
 * DataState loading skeleton branches without re-running useOverviewData math.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Overview } from "./Overview";
import { useOverviewData } from "./overview/useOverviewData";
import { THEME_HEX } from "@shared/lib/ui/themeHex";

vi.mock("./overview/useOverviewData");

vi.mock("../components/FinykInsightsBlock", () => ({
  FinykInsightsBlock: () => <div data-testid="finyk-insights" />,
}));

const mockedUseOverviewData = vi.mocked(useOverviewData);

function buildOverviewData(
  overrides: Partial<ReturnType<typeof useOverviewData>> = {},
): ReturnType<typeof useOverviewData> {
  return {
    realTx: [],
    loadingTx: false,
    clientInfo: null,
    syncState: { status: "idle" },
    lastUpdated: null,
    monoError: null,
    monoRefresh: vi.fn(),
    networth: 0,
    monoTotal: 0,
    totalDebt: 0,
    nonUahManualAssetCount: 0,
    daysInMonth: 30,
    daysPassed: 10,
    dayBudget: 500,
    hasExpensePlan: false,
    spendPlanRatio: 0,
    dateLabel: "10 червня",
    spent: 0,
    income: 0,
    showMonthForecast: false,
    projectedSpend: 0,
    planExpense: 0,
    forecastTrendPct: 0,
    forecastBarClass: "bg-success",
    recurringOutThisMonth: 0,
    recurringInThisMonth: 0,
    unknownOutCount: 0,
    networthHistory: [],
    budgetAlerts: [],
    statTx: [],
    txCategories: {},
    txSplits: {},
    customCategories: [],
    plannedFlows: [],
    showFirstInsight: false,
    hasAnyData: false,
    handleSetBudgetFromInsight: vi.fn(),
    dismissFirstInsight: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useOverviewData>;
}

function buildStorage() {
  return {
    budgets: [],
    subscriptions: [],
    dismissedRecurring: [],
    excludedTxIds: new Set<string>(),
  } as never;
}

function buildMono() {
  return { realTx: [], loadingTx: false } as never;
}

describe("Overview page (branches)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    mockedUseOverviewData.mockReturnValue(buildOverviewData());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders hero card and insights when data is loaded", () => {
    render(
      <Overview mono={buildMono()} storage={buildStorage()} showBalance />,
    );
    expect(screen.getByText("Нетворс")).toBeInTheDocument();
    expect(screen.getByTestId("finyk-insights")).toBeInTheDocument();
  });

  it("shows sync badge when mono clientInfo is present", () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        clientInfo: { name: "Test" } as never,
      }),
    );
    render(<Overview mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByText("Очікування")).toBeInTheDocument();
  });

  it("shows sync badge on sync error state", () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        syncState: {
          status: "error",
          lastError: "sync failed",
          source: "network",
          lastSuccess: null,
          accountsTotal: 0,
          accountsOk: 0,
        } as never,
        monoError: "sync failed",
      }),
    );
    render(<Overview mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByText("Помилка синхронізації")).toBeInTheDocument();
  });

  it("shows first-insight banner and wires CTA callbacks", () => {
    const handleSetBudget = vi.fn();
    const dismiss = vi.fn();
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        showFirstInsight: true,
        hasAnyData: true,
        handleSetBudgetFromInsight: handleSetBudget,
        dismissFirstInsight: dismiss,
      }),
    );
    render(<Overview mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByText("Ось куди йдуть твої гроші")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Поставити бюджет" }));
    expect(handleSetBudget).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрити підказку" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("shows updating footer while loadingTx with existing transactions", () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        loadingTx: true,
        realTx: [{ id: "tx-1" }] as never,
      }),
    );
    render(<Overview mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByText("Оновлення…")).toBeInTheDocument();
  });

  it("renders planned flows card when flows exist", () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        plannedFlows: [
          {
            id: "sub-1",
            title: "Netflix",
            hint: "завтра",
            amount: 299,
            sign: "-",
            currency: "₴",
            color: THEME_HEX.danger,
            daysLeft: 1,
            dueDate: new Date("2026-06-16"),
          },
        ] as never,
      }),
    );
    render(<Overview mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByText("Найближчі платежі")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });

  it("masks balances when showBalance=false", () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        networth: 50000,
        monoTotal: 10000,
        totalDebt: 2000,
      }),
    );
    render(
      <Overview
        mono={buildMono()}
        storage={buildStorage()}
        showBalance={false}
      />,
    );
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });

  it("shows loading skeleton when loading with no transactions yet", async () => {
    mockedUseOverviewData.mockReturnValue(
      buildOverviewData({
        loadingTx: true,
        realTx: [],
      }),
    );
    await act(async () => {
      render(<Overview mono={buildMono()} storage={buildStorage()} />);
    });
    expect(screen.queryByText("Нетворс")).not.toBeInTheDocument();
  });
});
