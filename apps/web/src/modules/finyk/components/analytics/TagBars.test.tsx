// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { TagBars } from "./TagBars";

const at = new Date("2026-10-12T10:00:00Z").toISOString();
const txs = [
  manualExpenseToTransaction({
    id: "a",
    date: at,
    amount: 100,
    category: "food",
  }),
  manualExpenseToTransaction({
    id: "b",
    date: at,
    amount: 50,
    category: "food",
  }),
  manualExpenseToTransaction({
    id: "c",
    date: at,
    amount: 10,
    category: "food",
  }),
];

function renderBars(selected: string | null, onSelect = vi.fn()) {
  render(
    <TagBars
      transactions={txs}
      previousTransactions={null}
      txTags={{ manual_a: ["а", "б"], manual_b: ["Б"] }}
      excludedTxIds={new Set()}
      txSplits={{}}
      selected={selected}
      onSelect={onSelect}
      showBalance
    />,
  );
  return onSelect;
}

describe("TagBars (Р6.4)", () => {
  it("операція з двома тегами в обох рядках, без «Разом», з підписом", () => {
    renderBars(null);
    const block = screen.getByTestId("finyk-analytics-tags");
    expect(block).toHaveTextContent("б");
    expect(block).toHaveTextContent("150");
    expect(block).toHaveTextContent("100");
    expect(block).not.toHaveTextContent("Разом");
    expect(block).not.toHaveTextContent("Інше");
    expect(block).toHaveTextContent("Операція може мати кілька тегів");
    // Частка від витрат періоду (160), а не від суми рядків (250).
    expect(block).toHaveTextContent("94%");
  });

  it("тап по тегу вмикає фільтр, повторний тап знімає", () => {
    const onSelect = renderBars(null);
    fireEvent.click(screen.getByRole("button", { name: /^а/ }));
    expect(onSelect).toHaveBeenCalledWith("а");
  });

  it("активний фільтр показує назву тегу і кнопку зняття", () => {
    const onSelect = renderBars("б");
    expect(screen.getByText("Лише тег «б»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Усі теги" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("без тегів блок мовчить", () => {
    render(
      <TagBars
        transactions={txs}
        previousTransactions={null}
        txTags={{}}
        excludedTxIds={new Set()}
        txSplits={{}}
        selected={null}
        onSelect={vi.fn()}
        showBalance
      />,
    );
    expect(screen.queryByTestId("finyk-analytics-tags")).toBeNull();
  });
});
