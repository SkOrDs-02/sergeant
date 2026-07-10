// @vitest-environment jsdom
/**
 * Branch-focused coverage for the Assets lazy page — tx-picker overlay vs
 * main table shell, driven by useAssetsState return shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Assets } from "./Assets";
import { useAssetsState } from "./useAssetsState";

vi.mock("./useAssetsState");

vi.mock("./AssetsTxPickerView", () => ({
  AssetsTxPickerView: () => <div data-testid="tx-picker-view" />,
}));

vi.mock("./AssetsTable", () => ({
  AssetsTable: () => <div data-testid="assets-table" />,
}));

const mockedUseAssetsState = vi.mocked(useAssetsState);

function buildState(
  overrides: Partial<ReturnType<typeof useAssetsState>> = {},
): ReturnType<typeof useAssetsState> {
  return {
    txPicker: null,
    setTxPicker: vi.fn(),
    accounts: [],
    transactions: [],
    monoDebtLinkedTxIds: {},
    toggleMonoDebtTx: vi.fn(),
    subscriptions: [],
    updateSubscription: vi.fn(),
    manualDebts: [],
    receivables: [],
    toggleLinkedTx: vi.fn(),
    showBalance: true,
    customCategories: [],
    open: { assets: false, liabilities: false, subscriptions: false },
    networth: 0,
    totalAssets: 0,
    totalDebt: 0,
    monoTotal: 0,
    manualAssetTotal: 0,
    totalReceivable: 0,
    showAssetForm: false,
    showDebtForm: false,
    showSubForm: false,
    openAssetForm: vi.fn(),
    openDebtForm: vi.fn(),
    openSubscriptionForm: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAssetsState>;
}

function buildStorage() {
  return {
    hiddenAccounts: [],
    manualAssets: [],
    manualDebts: [],
    receivables: [],
    subscriptions: [],
    excludedTxIds: new Set<string>(),
    monoDebtLinkedTxIds: {},
    customCategories: [],
  } as never;
}

function buildMono() {
  return { accounts: [], transactions: [] } as never;
}

describe("Assets page (branches)", () => {
  beforeEach(() => {
    mockedUseAssetsState.mockReturnValue(buildState());
  });

  it("renders AssetsTable when txPicker is null", () => {
    render(<Assets mono={buildMono()} storage={buildStorage()} showBalance />);
    expect(screen.getByTestId("assets-table")).toBeInTheDocument();
    expect(screen.queryByTestId("tx-picker-view")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Активи" })).toBeInTheDocument();
  });

  it("renders AssetsTxPickerView when txPicker is active", () => {
    mockedUseAssetsState.mockReturnValue(
      buildState({
        txPicker: { mode: "sub", id: "sub-1" } as never,
      }),
    );
    render(<Assets mono={buildMono()} storage={buildStorage()} />);
    expect(screen.getByTestId("tx-picker-view")).toBeInTheDocument();
    expect(screen.queryByTestId("assets-table")).not.toBeInTheDocument();
  });

  it("passes initialOpenDebt into useAssetsState", () => {
    render(
      <Assets
        mono={buildMono()}
        storage={buildStorage()}
        initialOpenDebt
        showBalance={false}
      />,
    );
    expect(mockedUseAssetsState).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOpenDebt: true,
        showBalance: false,
      }),
    );
  });
});
