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
  DebtForm: ({
    setShowDebtForm,
    onUpdate,
  }: {
    setShowDebtForm: (next: boolean) => void;
    onUpdate: (id: string, value: Record<string, unknown>) => void;
  }) => (
    <div data-testid="debt-form">
      <button type="button" onClick={() => setShowDebtForm(false)}>
        close-debt-form
      </button>
      <button
        type="button"
        onClick={() => onUpdate("d1", { name: "Оновлений борг" })}
      >
        update-debt-form
      </button>
    </div>
  ),
  SubscriptionForm: () => null,
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn((_toast, opts: { msg: string; onUndo: () => void }) => {
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", "undo-debt-btn");
    btn.textContent = "undo";
    btn.addEventListener("click", opts.onUndo);
    document.body.appendChild(btn);
  }),
}));

import { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('[data-testid="undo-debt-btn"]')
    .forEach((el) => el.remove());
});

function wrap(children: ReactNode) {
  return <ToastProvider>{children}</ToastProvider>;
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    transactions: [],
    manualDebts: [],
    setManualDebts: vi.fn(),
    editingDebtId: null,
    setEditingDebtId: vi.fn(),
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
    expect(state.setEditingDebtId).toHaveBeenCalledWith(null);
    expect(state.setNewDebt).toHaveBeenCalledWith({
      name: "",
      emoji: "",
      totalAmount: "",
      dueDate: "",
    });
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

  it("closes and updates manual debts through the form callbacks", () => {
    const setManualDebts = vi.fn();
    const state = makeState({
      showDebtForm: true,
      editingDebtId: "d1",
      setManualDebts,
      manualDebts: [
        {
          id: "d1",
          name: "Старий борг",
          linkedTxIds: ["tx-1"],
        },
      ] as unknown as State["manualDebts"],
    });

    render(wrap(<AssetsLiabilitiesSection state={state} />));

    fireEvent.click(screen.getByText("close-debt-form"));
    expect(state.setShowDebtForm).toHaveBeenCalledWith(false);
    expect(state.setEditingDebtId).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByText("update-debt-form"));
    const updater = setManualDebts.mock.calls[0]![0] as (
      debts: State["manualDebts"],
    ) => State["manualDebts"];
    expect(updater(state.manualDebts)[0]).toMatchObject({
      id: "d1",
      name: "Оновлений борг",
      linkedTxIds: ["tx-1"],
    });
    expect(state.setEditingDebtId).toHaveBeenCalledWith(null);
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

  it("renders linked Monobank debt progress and opens the transaction picker", () => {
    const state = makeState({
      monoDebtAccounts: [
        { id: "credit1", balance: -500000, currencyCode: 980, type: "black" },
      ] as unknown as State["monoDebtAccounts"],
      monoDebtLinkedTxIds: { credit1: ["tx-pay"] },
      transactions: [
        { id: "tx-pay", amount: -125000 },
        { id: "tx-other", amount: -99900 },
      ] as unknown as State["transactions"],
    });

    render(wrap(<AssetsLiabilitiesSection state={state} />));

    expect(screen.getByText(/Прив.язати транзакції \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Сплачено/)).toHaveTextContent(/1[\s\S]*250/);

    fireEvent.click(screen.getByText(/Прив.язати транзакції \(1\)/));
    expect(state.setTxPicker).toHaveBeenCalledWith({
      id: "credit1",
      type: "monoDebt",
    });
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

  it("edits, links, and deletes manual debt cards", () => {
    const setManualDebts = vi.fn((updater) => {
      if (typeof updater === "function") {
        updater([
          {
            id: "d1",
            name: "Кредит",
            emoji: "💳",
            totalAmount: 10000,
            linkedTxIds: ["tx-pay"],
          },
        ]);
      }
    });
    const state = makeState({
      setManualDebts,
      manualDebts: [
        {
          id: "d1",
          name: "Кредит",
          emoji: "💳",
          totalAmount: 10000,
          amount: 9000,
          dueDate: "2026-09-01",
          linkedTxIds: ["tx-pay"],
        },
      ] as unknown as State["manualDebts"],
      transactions: [
        { id: "tx-pay", amount: -100000 },
      ] as unknown as State["transactions"],
    });

    render(wrap(<AssetsLiabilitiesSection state={state} />));

    fireEvent.click(screen.getByRole("button", { name: "Редагувати Кредит" }));
    expect(state.setEditingDebtId).toHaveBeenCalledWith("d1");
    expect(state.setNewDebt).toHaveBeenCalledWith({
      name: "Кредит",
      emoji: "💳",
      totalAmount: "10000",
      dueDate: "2026-09-01",
    });
    expect(state.setShowDebtForm).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByText(/Прив.язати транзакції \(1\)/));
    expect(state.setTxPicker).toHaveBeenCalledWith({ id: "d1", type: "debt" });

    fireEvent.click(screen.getByRole("button", { name: "Видалити Кредит" }));
    expect(setManualDebts).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("undo-debt-btn"));
    expect(setManualDebts).toHaveBeenCalledTimes(2);
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
