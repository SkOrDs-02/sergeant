// @vitest-environment jsdom
/**
 * Секція «Відкладення» в аркуші операції (спека
 * `docs/work/specs/finyk-savings-assets.md`) і рядок «Відкладено» на Огляді.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { OverviewTextRows } from "../pages/overview/OverviewTextRows";
import { AssetLinkSection } from "./AssetLinkSection";

const debit = {
  id: "t1",
  amount: -500_000,
  description: "Inzhur",
  time: 1_772_700_000,
} as unknown as Transaction;

const assets = [
  { id: "fund", name: "Інжур", amount: 0, currency: "UAH", kind: "fund" },
  {
    id: "usd",
    name: "ОВДП $",
    amount: 0,
    currency: "USD",
    kind: "ovdp",
    fxRate: { uahPerUnit: 40, asOf: "2026-03-01" },
  },
];

describe("AssetLinkSection", () => {
  it("списання: «Це внесок у…» → актив → сума з операції → onLink", () => {
    const onLink = vi.fn();
    render(
      <AssetLinkSection
        transaction={debit}
        api={{ assets, current: undefined, onLink, onUnlink: vi.fn() }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Дохід з…" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Це внесок у…" }));
    fireEvent.click(screen.getByRole("button", { name: "Привʼязати" }));
    expect(onLink).toHaveBeenCalledWith(
      "fund",
      "contribution",
      500_000,
      undefined,
    );
  });

  it("доларовий актив: сума перерахована за курсом активу", () => {
    const onLink = vi.fn();
    render(
      <AssetLinkSection
        transaction={debit}
        api={{ assets, current: undefined, onLink, onUnlink: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Це внесок у…" }));
    fireEvent.click(screen.getByText("ОВДП $ · USD"));
    fireEvent.click(screen.getByRole("button", { name: "Привʼязати" }));
    // 5 000 ₴ / 40 = 125 $
    expect(onLink).toHaveBeenCalledWith(
      "usd",
      "contribution",
      12_500,
      undefined,
    );
  });

  it("привʼязана операція показує актив і відвʼязується", () => {
    const onUnlink = vi.fn();
    render(
      <AssetLinkSection
        transaction={debit}
        api={{
          assets,
          current: { assetId: "fund", type: "contribution" },
          onLink: vi.fn(),
          onUnlink,
        }}
      />,
    );
    expect(screen.getByText("Внесок у «Інжур»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Відвʼязати" }));
    expect(onUnlink).toHaveBeenCalled();
  });
});

describe("OverviewTextRows: «Відкладено»", () => {
  const base = {
    income: 10_000,
    showMonthForecast: false,
    projectedSpend: 0,
    hasExpensePlan: false,
    recurringOutThisMonth: 0,
    recurringInThisMonth: 0,
    unknownOutCount: 0,
    showBalance: true,
  };

  it("показує суму, коли за місяць щось відкладено", () => {
    render(<OverviewTextRows {...base} savedThisMonth={4_700} />);
    expect(screen.getByText(/Відкладено/)).toBeInTheDocument();
  });

  it("без відкладеного рядка немає", () => {
    render(<OverviewTextRows {...base} savedThisMonth={0} />);
    expect(screen.queryByText(/Відкладено/)).not.toBeInTheDocument();
  });
});
