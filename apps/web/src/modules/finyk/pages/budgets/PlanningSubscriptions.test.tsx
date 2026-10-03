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
  RecurringSuggestions: ({
    transactions,
  }: {
    transactions?: ReadonlyArray<{ id: string }>;
  }) => (
    <div data-testid="recurring">
      {(transactions ?? []).map((tx) => tx.id).join(",")}
    </div>
  ),
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
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../lib/monoMirrorReader";

afterEach(() => {
  cleanup();
  clearFinykMonoMirrorCache();
});

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

  // Корінь «хвиль» кандидатів: `mono.transactions` після відповіді мережі
  // лише поточний місяць. Підказки читають дзеркало, не цей слайс.
  it("feeds «Можливі підписки» from the mirror, not from the current-month slice", () => {
    const mirrored = ["jun", "jul", "aug"].map(
      (id) => ({ id, amount: -19_900, time: 1_780_000_000 }) as Transaction,
    );
    __setFinykMonoMirrorCacheForTests({ transactions: mirrored });
    const monthOnly: AssetsProps["mono"] = {
      accounts: [],
      transactions: [{ id: "sep", amount: -19_900 } as Transaction],
    };

    render(
      wrap(<PlanningSubscriptions mono={monthOnly} storage={makeStorage()} />),
    );

    expect(screen.getByTestId("recurring")).toHaveTextContent("jun,jul,aug");
    expect(screen.getByTestId("recurring")).not.toHaveTextContent("sep");
  });

  it("keeps manual expenses in «Можливі підписки», as Overview does", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "jun", amount: -19_900, time: 1_780_000_000 } as Transaction,
      ],
    });

    render(
      wrap(
        <PlanningSubscriptions
          mono={mono}
          storage={makeStorage({
            manualExpenses: [
              {
                id: "cash-1",
                amount: 199,
                date: "2026-06-04",
                description: "Netflix",
                category: "subscriptions",
              },
            ],
          })}
        />,
      ),
    );

    expect(screen.getByTestId("recurring")).toHaveTextContent(
      "jun,manual_cash-1",
    );
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
