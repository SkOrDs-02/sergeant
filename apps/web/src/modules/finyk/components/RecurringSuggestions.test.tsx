// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecurringSuggestions } from "./RecurringSuggestions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const NOW = new Date(2026, 5, 20, 12, 0, 0); // 2026-06-20

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

const recurringTxs = [
  tx("n1", 5, 39900),
  tx("n2", 35, 39900),
  tx("n3", 65, 39900),
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("RecurringSuggestions", () => {
  it("renders nothing when there are no transactions", () => {
    const { container } = render(<RecurringSuggestions transactions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no recurring candidates are detected", () => {
    const { container } = render(
      <RecurringSuggestions transactions={[tx("single", 1, 39900)]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a collapsed header with the candidate count", () => {
    render(<RecurringSuggestions transactions={recurringTxs} />);
    expect(screen.getByText("Можливі підписки")).toBeInTheDocument();
    expect(screen.getByText(/Розкласти/)).toBeInTheDocument();
  });

  it("expands the list and fires onAdd / onDismiss", () => {
    const onAdd = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RecurringSuggestions
        transactions={recurringTxs}
        onAdd={onAdd}
        onDismiss={onDismiss}
      />,
    );
    // Expand.
    fireEvent.click(screen.getByText("Можливі підписки"));
    expect(screen.getByText(/Згорнути/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Підписка"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Приховати"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("accepts excludedTxIds as a Set without throwing", () => {
    const { container } = render(
      <RecurringSuggestions
        transactions={recurringTxs}
        excludedTxIds={new Set(["n1", "n2", "n3"])}
      />,
    );
    // All charges excluded → no candidates → nothing rendered.
    expect(container.firstChild).toBeNull();
  });
});
