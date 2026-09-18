// @vitest-environment jsdom
/**
 * Branch coverage for Assets page shell — txPicker overlay vs main table view.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Assets } from "./Assets";

const useAssetsStateMock = vi.fn();

vi.mock("./useAssetsState", () => ({
  useAssetsState: (...args: unknown[]) => useAssetsStateMock(...args),
}));

vi.mock("./AssetsTxPickerView", () => ({
  AssetsTxPickerView: () => <div data-testid="tx-picker-view">picker</div>,
}));

vi.mock("./AssetsTable", () => ({
  AssetsTable: () => <div data-testid="assets-table">table</div>,
}));

function baseState(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    ...overrides,
  };
}

describe("Assets page (branches)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AssetsTable when txPicker is null", () => {
    useAssetsStateMock.mockReturnValue(baseState());
    render(
      <Assets
        mono={{ accounts: [], transactions: [] } as never}
        storage={{} as never}
      />,
    );
    expect(screen.getByTestId("assets-table")).toBeInTheDocument();
    expect(screen.queryByTestId("tx-picker-view")).toBeNull();
    expect(screen.getByRole("heading", { name: "Активи" })).toBeInTheDocument();
  });

  it("renders AssetsTxPickerView when txPicker is active", () => {
    useAssetsStateMock.mockReturnValue(
      baseState({ txPicker: { type: "sub", subId: "sub-1" } }),
    );
    render(
      <Assets
        mono={{ accounts: [], transactions: [] } as never}
        storage={{} as never}
      />,
    );
    expect(screen.getByTestId("tx-picker-view")).toBeInTheDocument();
    expect(screen.queryByTestId("assets-table")).toBeNull();
  });
});
