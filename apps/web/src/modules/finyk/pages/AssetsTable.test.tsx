// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsNetworthCard, AssetsTable } from "./AssetsTable";
import type { SectionOpenState } from "./useAssetsState";

vi.mock("../components/FinykStatsStrip", () => ({
  FinykStatsStrip: ({
    onOpenLiabilities,
  }: {
    onOpenLiabilities?: () => void;
  }) => (
    <button type="button" onClick={onOpenLiabilities}>
      stats-liabilities
    </button>
  ),
}));
vi.mock("../components/RecurringSuggestions", () => ({
  RecurringSuggestions: ({
    onAdd,
    onDismiss,
  }: {
    onAdd: (candidate: { key: string }) => void;
    onDismiss: (key: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onAdd({ key: "candidate-1" })}>
        add-recurring
      </button>
      <button type="button" onClick={() => onDismiss("candidate-1")}>
        dismiss-recurring
      </button>
    </div>
  ),
}));
vi.mock("./AssetsSubscriptionsSection", () => ({
  AssetsSubscriptionsSection: ({
    state,
  }: {
    state: { subscriptions: unknown[] };
  }) => <div data-testid="subs-section">subs:{state.subscriptions.length}</div>,
}));
vi.mock("./AssetsAssetsSection", () => ({
  AssetsAssetsSection: () => <div data-testid="assets-section">assets</div>,
}));
vi.mock("./AssetsLiabilitiesSection", () => ({
  AssetsLiabilitiesSection: () => (
    <div data-testid="liabilities-section">liabilities</div>
  ),
}));

describe("AssetsNetworthCard", () => {
  it("renders networth header when showBalance is true", () => {
    render(
      <AssetsNetworthCard
        networth={12345}
        totalAssets={15000}
        totalDebt={2655}
        showBalance={true}
      />,
    );
    expect(screen.getByText("Загальний капітал")).toBeInTheDocument();
  });

  it("shows 'Суми приховано' when showBalance is false", () => {
    render(
      <AssetsNetworthCard
        networth={12345}
        totalAssets={15000}
        totalDebt={2655}
        showBalance={false}
      />,
    );
    expect(screen.getByText("Суми приховано")).toBeInTheDocument();
  });

  it("renders assets/liabilities bar when both > 0 and showBalance", () => {
    const { container } = render(
      <AssetsNetworthCard
        networth={12345}
        totalAssets={15000}
        totalDebt={2655}
        showBalance={true}
      />,
    );
    const bar = container.querySelector('[role="img"]');
    expect(bar).toBeInTheDocument();
  });

  it("does not render bar when totalAssets + totalDebt = 0", () => {
    const { container } = render(
      <AssetsNetworthCard
        networth={0}
        totalAssets={0}
        totalDebt={0}
        showBalance={true}
      />,
    );
    expect(
      container.querySelector(
        '[aria-describedby="finyk-assets-liabilities-summary"]',
      ),
    ).toBeNull();
  });

  it("colours networth red when negative", () => {
    const { container } = render(
      <AssetsNetworthCard
        networth={-68499}
        totalAssets={12555}
        totalDebt={81054}
        showBalance={true}
      />,
    );
    const valueEl = container.querySelector(".text-danger-strong");
    expect(valueEl).not.toBeNull();
    // Сума тепер `Money`, тож розкладена на тири — матчер по `textContent`,
    // мінус U+2212, нерозривний у розрядах.
    expect(valueEl?.textContent).toMatch(/−68\u00a0499/);
  });

  it("colours networth in finyk tone when non-negative", () => {
    const { container } = render(
      <AssetsNetworthCard
        networth={12345}
        totalAssets={15000}
        totalDebt={2655}
        showBalance={true}
      />,
    );
    expect(container.querySelector(".text-finyk-strong")).not.toBeNull();
    expect(container.querySelector(".text-danger-strong")).toBeNull();
  });

  /**
   * Борг закрито 2026-08-06: hero мав ВЛАСНУ, саморобну обробку тирів —
   * одометр плюс окремий span із власним кеглем і кольором для ₴. Тобто
   * дубль `Money` на найпомітнішому числі застосунку. Тест перевіряв саме
   * той саморобний вузол; тепер перевіряє контракт `Money`.
   *
   * Роль `img` зникла разом з одометром і це не втрата: вона існувала
   * лише щоб ховати барабани, що крутяться, від скрінрідера. Каскад —
   * звичайний текст, і його читають як текст.
   */
  it("hero малює суму через Money — з тирами й вузьким нерозривним", () => {
    const { container } = render(
      <AssetsNetworthCard
        networth={-38839}
        totalAssets={3719}
        totalDebt={42558}
        showBalance={true}
      />,
    );

    const hero = container.querySelector(".text-style-display");
    expect(hero).not.toBeNull();
    // Знак, розряди й символ — рівно та розкладка, що в `Money`.
    expect(hero?.textContent).toMatch(/^−38\u00a0839\u202f₴$/);
    // Жодного саморобного вузла з власним кеглем символу.
    expect(hero?.querySelector(".leading-none")).toBeNull();
    expect(hero?.querySelector('[role="img"]')).toBeNull();
  });
});

type TableState = Parameters<typeof AssetsTable>[0]["state"];

function Harness({
  openOverrides,
  showBalance = true,
  openSubscriptionForm = vi.fn(),
  openAssetForm = vi.fn(),
  openReceivableForm = vi.fn(),
  openDebtForm = vi.fn(),
  addSubscriptionFromRecurring = vi.fn(),
  dismissRecurring = vi.fn(),
  subscriptions = [],
}: {
  openOverrides?: Partial<SectionOpenState>;
  showBalance?: boolean;
  openSubscriptionForm?: () => void;
  openAssetForm?: () => void;
  openReceivableForm?: () => void;
  openDebtForm?: () => void;
  addSubscriptionFromRecurring?: (candidate: unknown) => void;
  dismissRecurring?: (key: string) => void;
  subscriptions?: unknown[];
}) {
  const [open, setOpen] = useState<SectionOpenState>({
    subscriptions: false,
    assets: false,
    liabilities: false,
    ...openOverrides,
  });
  const state = {
    networth: 12345,
    totalAssets: 15000,
    totalDebt: 2655,
    showBalance,
    urgentLiability: null,
    todayStart: new Date("2026-07-01T00:00:00.000Z"),
    open,
    setOpen,
    subscriptions,
    transactions: [],
    dismissedRecurring: [],
    excludedTxIds: [],
    addSubscriptionFromRecurring,
    dismissRecurring,
    openSubscriptionForm,
    openAssetForm,
    openReceivableForm,
    openDebtForm,
  } as unknown as TableState;
  return <AssetsTable state={state} />;
}

describe("AssetsTable", () => {
  it("does not render collapsible sections when all sections are closed", () => {
    render(<Harness />);
    expect(screen.queryByTestId("subs-section")).toBeNull();
    expect(screen.queryByTestId("assets-section")).toBeNull();
    expect(screen.queryByTestId("liabilities-section")).toBeNull();
  });

  it("renders the subscriptions section only when open.subscriptions toggles on", () => {
    render(
      <Harness
        openOverrides={{ subscriptions: true }}
        subscriptions={[{ id: "s1" }]}
      />,
    );
    expect(screen.getByTestId("subs-section")).toHaveTextContent("subs:1");
    expect(screen.queryByTestId("assets-section")).toBeNull();
    expect(screen.queryByTestId("liabilities-section")).toBeNull();
  });

  it("toggles the subscriptions section open via the SectionBar click", () => {
    render(<Harness subscriptions={[{ id: "s1" }]} />);
    expect(screen.queryByTestId("subs-section")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { expanded: false, name: /Підписки/ }),
    );
    expect(screen.getByTestId("subs-section")).toHaveTextContent("subs:1");
  });

  it("opens liabilities from the stats strip", () => {
    render(<Harness />);
    expect(screen.queryByTestId("liabilities-section")).toBeNull();
    fireEvent.click(screen.getByText("stats-liabilities"));
    expect(screen.getByTestId("liabilities-section")).toBeInTheDocument();
  });

  it("passes recurring suggestion add and dismiss callbacks through", () => {
    const addSubscriptionFromRecurring = vi.fn();
    const dismissRecurring = vi.fn();
    render(
      <Harness
        addSubscriptionFromRecurring={addSubscriptionFromRecurring}
        dismissRecurring={dismissRecurring}
      />,
    );
    fireEvent.click(screen.getByText("add-recurring"));
    fireEvent.click(screen.getByText("dismiss-recurring"));
    expect(addSubscriptionFromRecurring).toHaveBeenCalledWith({
      key: "candidate-1",
    });
    expect(dismissRecurring).toHaveBeenCalledWith("candidate-1");
  });

  it("toggles the assets section open via the SectionBar click", () => {
    render(<Harness />);
    expect(screen.queryByTestId("assets-section")).toBeNull();
    const bar = screen.getByRole("button", { expanded: false, name: /Активи/ });
    fireEvent.click(bar);
    expect(screen.getByTestId("assets-section")).toBeInTheDocument();
  });

  it("toggles the liabilities section open via the SectionBar click", () => {
    render(<Harness />);
    expect(screen.queryByTestId("liabilities-section")).toBeNull();
    const bar = screen.getByRole("button", { expanded: false, name: /Пасиви/ });
    fireEvent.click(bar);
    expect(screen.getByTestId("liabilities-section")).toBeInTheDocument();
  });

  it("calls openSubscriptionForm / openDebtForm from the quick-action buttons", () => {
    const openSubscriptionForm = vi.fn();
    const openDebtForm = vi.fn();
    render(
      <Harness
        openSubscriptionForm={openSubscriptionForm}
        openDebtForm={openDebtForm}
      />,
    );
    fireEvent.click(screen.getByText("+ Підписка"));
    fireEvent.click(screen.getByText("+ Пасив"));
    expect(openSubscriptionForm).toHaveBeenCalledTimes(1);
    expect(openDebtForm).toHaveBeenCalledTimes(1);
  });

  it("'+ Актив' opens a picker between a plain asset and a receivable", () => {
    const openAssetForm = vi.fn();
    const openReceivableForm = vi.fn();
    render(
      <Harness
        openAssetForm={openAssetForm}
        openReceivableForm={openReceivableForm}
      />,
    );
    const trigger = screen.getByRole("button", { name: /\+ Актив/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    // Сам тап по «+ Актив» форми не відкриває — лише меню.
    fireEvent.click(trigger);
    expect(openAssetForm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: /Мені винні/ }));
    expect(openReceivableForm).toHaveBeenCalledTimes(1);
    expect(openAssetForm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /\+ Актив/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Актив/ }));
    expect(openAssetForm).toHaveBeenCalledTimes(1);
  });

  it("shows masked totals in section summaries when showBalance is false", () => {
    render(<Harness showBalance={false} />);
    const masked = screen.getAllByText("••••");
    // one for the assets summary, one for the liabilities summary
    expect(masked.length).toBe(2);
  });

  it("shows formatted totals in section summaries when showBalance is true", () => {
    render(<Harness showBalance={true} />);
    const assetsBar = screen.getByRole("button", { name: /Активи/ });
    const liabilitiesBar = screen.getByRole("button", { name: /Пасиви/ });
    expect(assetsBar.textContent).toMatch(/\+15\s?000\s?₴/);
    expect(liabilitiesBar.textContent).toMatch(/−2\s?655\s?₴/);
  });
});
