// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsNetworthCard, AssetsTable } from "./AssetsTable";
import type { SectionOpenState } from "./useAssetsState";

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
    expect(screen.getByText("Загальний нетворс")).toBeInTheDocument();
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
    const bars = container.querySelectorAll('[role="img"]');
    const nonLucideBars = Array.from(bars).filter((el) => !el.closest("svg"));
    expect(nonLucideBars.length).toBe(0);
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
    expect(valueEl?.textContent).toContain("-68");
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
});

type TableState = Parameters<typeof AssetsTable>[0]["state"];

function Harness({
  openOverrides,
  showBalance = true,
  openSubscriptionForm = vi.fn(),
  openAssetForm = vi.fn(),
  openDebtForm = vi.fn(),
  addSubscriptionFromRecurring = vi.fn(),
  dismissRecurring = vi.fn(),
  subscriptions = [],
}: {
  openOverrides?: Partial<SectionOpenState>;
  showBalance?: boolean;
  openSubscriptionForm?: () => void;
  openAssetForm?: () => void;
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

  it("calls openSubscriptionForm / openAssetForm / openDebtForm from the quick-action buttons", () => {
    const openSubscriptionForm = vi.fn();
    const openAssetForm = vi.fn();
    const openDebtForm = vi.fn();
    render(
      <Harness
        openSubscriptionForm={openSubscriptionForm}
        openAssetForm={openAssetForm}
        openDebtForm={openDebtForm}
      />,
    );
    fireEvent.click(screen.getByText("+ Підписка"));
    fireEvent.click(screen.getByText("+ Актив"));
    fireEvent.click(screen.getByText("+ Пасив"));
    expect(openSubscriptionForm).toHaveBeenCalledTimes(1);
    expect(openAssetForm).toHaveBeenCalledTimes(1);
    expect(openDebtForm).toHaveBeenCalledTimes(1);
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
