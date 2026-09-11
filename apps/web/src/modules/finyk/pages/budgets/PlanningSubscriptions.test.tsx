// @vitest-environment jsdom
/**
 * PlanningSubscriptions — блок «майбутнього» на Плануванні (2026-09-03):
 * найближчі платежі, підказки про регулярні витрати, підписки, quick-action.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { ReactNode } from "react";

vi.mock("../../components/RecurringSuggestions", () => ({
  RecurringSuggestions: () => <div data-testid="recurring" />,
}));
vi.mock("../AssetsSubscriptionsSection", () => ({
  AssetsSubscriptionsSection: ({
    state,
  }: {
    state: { subscriptions: unknown[]; showSubForm: boolean };
  }) => (
    <div data-testid="subs-section">
      subs:{state.subscriptions.length} form:{String(state.showSubForm)}
    </div>
  ),
}));
vi.mock("../AssetsTxPickerView", () => ({
  AssetsTxPickerView: () => <div data-testid="tx-picker" />,
}));

import { PlanningSubscriptions } from "./PlanningSubscriptions";
import type { AssetsProps } from "../useAssetsState";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";

afterEach(() => cleanup());

function wrap(children: ReactNode) {
  return <ToastProvider>{children}</ToastProvider>;
}

function makeStorage(
  overrides: Partial<AssetsProps["storage"]> = {},
): AssetsProps["storage"] {
  return {
    hiddenAccounts: [],
    toggleHideAccount: vi.fn(),
    manualAssets: [],
    setManualAssets: vi.fn(),
    manualDebts: [],
    setManualDebts: vi.fn(),
    receivables: [],
    setReceivables: vi.fn(),
    setLinkedTxRole: vi.fn(),
    subscriptions: [],
    setSubscriptions: vi.fn(),
    updateSubscription: vi.fn(),
    addSubscriptionFromRecurring: vi.fn(),
    dismissedRecurring: [],
    dismissRecurring: vi.fn(),
    excludedTxIds: new Set<string>(),
    monoDebtLinkedTxIds: {},
    toggleMonoDebtTx: vi.fn(),
    customCategories: [],
    manualExpenses: [],
    ...overrides,
  } as unknown as AssetsProps["storage"];
}

const mono: AssetsProps["mono"] = { accounts: [], transactions: [] };

describe("PlanningSubscriptions", () => {
  it("renders the subscriptions bar collapsed with the quick-action entry", () => {
    render(wrap(<PlanningSubscriptions mono={mono} storage={makeStorage()} />));
    expect(
      screen.getByRole("button", { expanded: false, name: /Підписки/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("subs-section")).toBeNull();
    expect(screen.getByTestId("recurring")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Підписка" })).toBeVisible();
  });

  it("'+ Підписка' opens the section and its form in one tap", () => {
    render(wrap(<PlanningSubscriptions mono={mono} storage={makeStorage()} />));
    fireEvent.click(screen.getByRole("button", { name: "+ Підписка" }));
    expect(screen.getByTestId("subs-section")).toHaveTextContent("form:true");
  });

  it("opens the section immediately for ?section=subscriptions", () => {
    render(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage({
            subscriptions: [
              {
                id: "s1",
                name: "Netflix",
                keyword: "",
                billingDay: 8,
                currency: "UAH",
              },
            ] as unknown as AssetsProps["storage"]["subscriptions"],
          })}
          initialOpen
        />,
      ),
    );
    expect(screen.getByTestId("subs-section")).toHaveTextContent("subs:1");
    expect(screen.getByText("1 активна")).toBeInTheDocument();
  });

  it("shows «Найближчі платежі» for a subscription due within ten days", () => {
    // День списання = сьогодні за КИЇВСЬКИМ годинником (не хостовим: у CI
    // під UTC 21:00 Київ уже в наступній добі), тож потік потрапляє у вікно.
    const today = getKyivDateParts(Date.now()).day;
    render(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage({
            subscriptions: [
              {
                id: "s1",
                name: "Netflix",
                keyword: "",
                billingDay: today,
                currency: "UAH",
              },
            ] as unknown as AssetsProps["storage"]["subscriptions"],
          })}
        />,
      ),
    );
    expect(screen.getByText("Найближчі платежі")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });
});
