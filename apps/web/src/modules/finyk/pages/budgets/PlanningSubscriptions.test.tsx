// @vitest-environment jsdom
/**
 * PlanningSubscriptions — блок «майбутнього» на Плануванні (2026-09-03):
 * найближчі платежі, підказки про регулярні витрати, підписки. Власний
 * quick-action прибрано founder-UX audit round 2 (F2) — форма підписки
 * тепер відкривається через `openSubscriptionSignal`, переданий із
 * комбінованого пікера «Запланувати» в `Budgets.tsx` (див. `FinykApp.tsx`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
  it("renders the subscriptions bar collapsed, with no local quick-action button", () => {
    render(wrap(<PlanningSubscriptions mono={mono} storage={makeStorage()} />));
    expect(
      screen.getByRole("button", { expanded: false, name: /Підписки/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("subs-section")).toBeNull();
    expect(screen.getByTestId("recurring")).toBeInTheDocument();
    // Own "+ Підписка" trigger removed (F2) — it now lives inside the
    // combined «Запланувати» picker on `Budgets.tsx`.
    expect(screen.queryByRole("button", { name: "+ Підписка" })).toBeNull();
  });

  it("opens the section and its form when openSubscriptionSignal changes", () => {
    const { rerender } = render(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage()}
          openSubscriptionSignal={0}
        />,
      ),
    );
    expect(screen.queryByTestId("subs-section")).toBeNull();

    rerender(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage()}
          openSubscriptionSignal={1}
        />,
      ),
    );
    expect(screen.getByTestId("subs-section")).toHaveTextContent("form:true");
  });

  it("does not reopen the form on mount just because a signal prop is present", () => {
    render(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage()}
          openSubscriptionSignal={0}
        />,
      ),
    );
    expect(screen.queryByTestId("subs-section")).toBeNull();
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
