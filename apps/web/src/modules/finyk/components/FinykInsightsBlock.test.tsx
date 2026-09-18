// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FinykInsightsBlock } from "./FinykInsightsBlock";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const NOW = new Date(2026, 5, 20, 12, 0, 0);

function tx(id: string, daysAgo: number, amountKop: number): Transaction {
  const ms = NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return {
    id,
    time: Math.floor(ms / 1000),
    date: new Date(ms).toISOString().slice(0, 10),
    amount: -Math.abs(amountKop),
    description: "Netflix",
    mcc: 4899,
  } as unknown as Transaction;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function renderBlock(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("FinykInsightsBlock", () => {
  it("renders nothing when no insight fires", () => {
    const { container } = renderBlock(
      <FinykInsightsBlock
        transactions={[]}
        budgets={[]}
        txCategories={{}}
        txSplits={{}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the recurring-detected insight card when a pattern is found", () => {
    const transactions = [
      tx("n1", 5, 39900),
      tx("n2", 35, 39900),
      tx("n3", 65, 39900),
    ];
    renderBlock(
      <FinykInsightsBlock
        transactions={transactions}
        budgets={[]}
        txCategories={{}}
        txSplits={{}}
      />,
    );
    // The recurring insight surfaces the merchant name in its title.
    expect(screen.getByText(/Netflix/)).toBeInTheDocument();
  });
});
