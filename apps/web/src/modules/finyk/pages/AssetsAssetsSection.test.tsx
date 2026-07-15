// @vitest-environment jsdom
/**
 * Tests for AssetsAssetsSection — the assets (receivables + manual assets)
 * portion of the Finyk Assets page.
 */
import { createRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { ReactNode } from "react";

// AssetsForm imports useFeatureGate (→ react-query) — stub to avoid provider
// wrapping in every test.
vi.mock("./AssetsForm", () => ({
  ReceivableForm: () => <div data-testid="receivable-form" />,
  AssetForm: () => <div data-testid="asset-form" />,
  DebtForm: () => null,
  SubscriptionForm: () => null,
}));

import { AssetsAssetsSection } from "./AssetsAssetsSection";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

afterEach(cleanup);

function wrap(children: ReactNode) {
  return <ToastProvider>{children}</ToastProvider>;
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    accounts: [],
    transactions: [],
    hiddenAccounts: [],
    manualAssets: [],
    setManualAssets: vi.fn(),
    editingAssetId: null,
    setEditingAssetId: vi.fn(),
    receivables: [],
    setReceivables: vi.fn(),
    editingRecvId: null,
    setEditingRecvId: vi.fn(),
    showRecvForm: false,
    setShowRecvForm: vi.fn(),
    showAssetForm: false,
    setShowAssetForm: vi.fn(),
    newRecv: { name: "", emoji: "", amount: 0 },
    setNewRecv: vi.fn(),
    newAsset: { name: "", emoji: "", amount: 0, currency: "UAH" },
    setNewAsset: vi.fn(),
    assetFormRef: createRef(),
    assetNameInputRef: createRef(),
    debtFormRef: createRef(),
    debtNameInputRef: createRef(),
    setTxPicker: vi.fn(),
    showBalance: true,
    // Extra fields required by the full State type
    monoDebtAccounts: [],
    monoDebtLinkedTxIds: {},
    manualDebts: [],
    setManualDebts: vi.fn(),
    showDebtForm: false,
    setShowDebtForm: vi.fn(),
    newDebt: { name: "", emoji: "", amount: 0 },
    setNewDebt: vi.fn(),
    subscriptions: [],
    setSubscriptions: vi.fn(),
    showSubForm: false,
    setShowSubForm: vi.fn(),
    newSub: {
      name: "",
      emoji: "",
      keyword: "",
      billingDay: "",
      currency: "UAH",
    },
    setNewSub: vi.fn(),
    openSections: { subscriptions: true, assets: true, liabilities: true },
    toggleSection: vi.fn(),
    txPickerTarget: null,
    txPicker: null,
    networth: 0,
    totalAssets: 0,
    totalDebt: 0,
    upcomingSchedule: [],
    ...overrides,
  } as unknown as State;
}

describe("AssetsAssetsSection", () => {
  it("renders the Картки Monobank section heading", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(screen.getByText("Картки Monobank")).toBeInTheDocument();
  });

  it("renders the Мені винні section heading", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(screen.getByText("Мені винні")).toBeInTheDocument();
  });

  it("renders the Інші активи section heading", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(screen.getByText("Інші активи")).toBeInTheDocument();
  });

  it("shows the empty-state placeholder for receivables", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(
      screen.getByText(/Зберігайте облік боргів і дат повернення/),
    ).toBeInTheDocument();
  });

  it("shows the empty-state chips for manual assets", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    // Multiple elements may contain "Готівка" (the placeholder <p> and the chip
    // span) — use getAllByText and assert at least one element exists.
    expect(screen.getAllByText(/Готівка/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Депозит/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Інвестиції/).length).toBeGreaterThan(0);
  });

  it("renders '+ Додати актив «мені винні»' add button", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(screen.getByText("+ Додати актив «мені винні»")).toBeInTheDocument();
  });

  it("renders '+ Додати актив' add button", () => {
    render(wrap(<AssetsAssetsSection state={makeState()} />));
    expect(screen.getByText("+ Додати актив")).toBeInTheDocument();
  });

  it("calls setShowRecvForm(true) when the receivables add button is clicked", () => {
    const state = makeState();
    render(wrap(<AssetsAssetsSection state={state} />));
    fireEvent.click(screen.getByText("+ Додати актив «мені винні»"));
    expect(state.setShowRecvForm).toHaveBeenCalledWith(true);
  });

  it("calls setShowAssetForm(true) when the assets add button is clicked", () => {
    const state = makeState();
    render(wrap(<AssetsAssetsSection state={state} />));
    fireEvent.click(screen.getByText("+ Додати актив"));
    expect(state.setShowAssetForm).toHaveBeenCalledWith(true);
  });

  it("renders ReceivableForm when showRecvForm is true", () => {
    render(
      wrap(<AssetsAssetsSection state={makeState({ showRecvForm: true })} />),
    );
    expect(screen.getByTestId("receivable-form")).toBeInTheDocument();
  });

  it("renders AssetForm when showAssetForm is true", () => {
    render(
      wrap(<AssetsAssetsSection state={makeState({ showAssetForm: true })} />),
    );
    expect(screen.getByTestId("asset-form")).toBeInTheDocument();
  });

  it("renders Monobank account cards when accounts are present", () => {
    const state = makeState({
      accounts: [
        {
          id: "acc1",
          balance: 100000,
          currencyCode: 980,
          type: "black",
        } as unknown as State["accounts"][0],
      ],
    });
    render(wrap(<AssetsAssetsSection state={state} />));
    // The card shows "Monobank" as the bank label for each linked account
    expect(screen.getByText("Monobank")).toBeInTheDocument();
    // Balance is shown (1000 UAH); the thousands-separator may be locale-specific
    expect(screen.getByText(/1[\s\S]*000,00[\s\S]*₴/)).toBeInTheDocument();
  });

  it("hides balance amounts when showBalance is false", () => {
    const state = makeState({
      accounts: [
        {
          id: "acc1",
          balance: 100000,
          currencyCode: 980,
          type: "black",
        } as unknown as State["accounts"][0],
      ],
      showBalance: false,
    });
    render(wrap(<AssetsAssetsSection state={state} />));
    // Balance masked with bullets
    expect(screen.getByText("••••")).toBeInTheDocument();
  });

  it("renders manual assets when present", () => {
    const state = makeState({
      manualAssets: [
        { name: "Готівка", emoji: "💵", amount: 5000, currency: "UAH" },
      ] as unknown as State["manualAssets"],
    });
    render(wrap(<AssetsAssetsSection state={state} />));
    expect(screen.getByText("Готівка")).toBeInTheDocument();
  });

  it("opens a manual asset in edit mode with its current values", () => {
    const asset = {
      id: "asset-1",
      name: "Готівка",
      emoji: "",
      amount: 5000,
      currency: "UAH",
    } as State["manualAssets"][number];
    const state = makeState({ manualAssets: [asset] });

    render(wrap(<AssetsAssetsSection state={state} />));
    fireEvent.click(
      screen.getByRole("button", { name: "Редагувати актив Готівка" }),
    );

    expect(state.setEditingAssetId).toHaveBeenCalledWith("asset-1");
    expect(state.setNewAsset).toHaveBeenCalledWith({
      name: "Готівка",
      emoji: "",
      amount: "5000",
      currency: "UAH",
    });
    expect(state.setShowAssetForm).toHaveBeenCalledWith(true);
  });
});
