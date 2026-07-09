// @vitest-environment jsdom
/**
 * Tests for AssetsLiabilitiesSection — the liabilities (manual debts +
 * Monobank credit cards) portion of the Finyk Assets page.
 */
import { createRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { ReactNode } from "react";

// Stub AssetsForm so it doesn't pull in react-query context
vi.mock("./AssetsForm", () => ({
  ReceivableForm: () => null,
  AssetForm: () => null,
  DebtForm: () => <div data-testid="debt-form" />,
  SubscriptionForm: () => null,
}));

import { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

afterEach(cleanup);

function wrap(children: ReactNode) {
  return <ToastProvider>{children}</ToastProvider>;
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    transactions: [],
    manualDebts: [],
    setManualDebts: vi.fn(),
    monoDebtAccounts: [],
    monoDebtLinkedTxIds: {},
    showDebtForm: false,
    setShowDebtForm: vi.fn(),
    newDebt: { name: "", emoji: "", amount: 0 },
    setNewDebt: vi.fn(),
    debtFormRef: createRef(),
    debtNameInputRef: createRef(),
    setTxPicker: vi.fn(),
    showBalance: true,
    // Remaining fields required by full State type
    accounts: [],
    hiddenAccounts: [],
    manualAssets: [],
    setManualAssets: vi.fn(),
    receivables: [],
    setReceivables: vi.fn(),
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

describe("AssetsLiabilitiesSection", () => {
  it("renders the '+ Додати пасив' button when showDebtForm is false", () => {
    render(wrap(<AssetsLiabilitiesSection state={makeState()} />));
    expect(screen.getByText("+ Додати пасив")).toBeInTheDocument();
  });

  it("shows the empty-state placeholder when liabilities section is empty", () => {
    render(wrap(<AssetsLiabilitiesSection state={makeState()} />));
    expect(screen.getByText(/Кредити, розстрочки, позики/)).toBeInTheDocument();
  });

  it("shows liabilities-type chips in the empty state", () => {
    render(wrap(<AssetsLiabilitiesSection state={makeState()} />));
    // Multiple elements may contain "Кредит" (the placeholder <p> and the chip
    // span) — use getAllByText to confirm at least one exists.
    expect(screen.getAllByText(/Кредит/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Розстрочка/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Позика/).length).toBeGreaterThan(0);
  });

  it("calls setShowDebtForm(true) when '+ Додати пасив' is clicked", () => {
    const state = makeState();
    render(wrap(<AssetsLiabilitiesSection state={state} />));
    fireEvent.click(screen.getByText("+ Додати пасив"));
    expect(state.setShowDebtForm).toHaveBeenCalledWith(true);
  });

  it("renders DebtForm when showDebtForm is true", () => {
    render(
      wrap(
        <AssetsLiabilitiesSection state={makeState({ showDebtForm: true })} />,
      ),
    );
    expect(screen.getByTestId("debt-form")).toBeInTheDocument();
  });

  it("does not show the empty-state placeholder when monoDebtAccounts are present", () => {
    const state = makeState({
      monoDebtAccounts: [
        { id: "credit1", balance: -5000, currencyCode: 980, type: "credit" },
      ] as unknown as State["monoDebtAccounts"],
    });
    render(wrap(<AssetsLiabilitiesSection state={state} />));
    expect(
      screen.queryByText(/Кредити, розстрочки, позики/),
    ).not.toBeInTheDocument();
  });

  it("renders manual debt cards when manualDebts are present", () => {
    const state = makeState({
      manualDebts: [
        {
          id: "d1",
          name: "МійКредит",
          emoji: "💳",
          amount: 10000,
          dueDate: null,
          linkedTxIds: [],
        },
      ] as unknown as State["manualDebts"],
    });
    render(wrap(<AssetsLiabilitiesSection state={state} />));
    // The name may be rendered with an emoji prefix in the same span.
    // Use a regex matcher so the partial match works across text nodes.
    expect(screen.getByText(/МійКредит/)).toBeInTheDocument();
  });

  it("hides the empty-state placeholder when manualDebts are present", () => {
    const state = makeState({
      manualDebts: [
        {
          id: "d1",
          name: "Кредит",
          emoji: "💳",
          amount: 10000,
          dueDate: null,
          linkedTxIds: [],
        },
      ] as unknown as State["manualDebts"],
    });
    render(wrap(<AssetsLiabilitiesSection state={state} />));
    expect(
      screen.queryByText(/Кредити, розстрочки, позики/),
    ).not.toBeInTheDocument();
  });
});
