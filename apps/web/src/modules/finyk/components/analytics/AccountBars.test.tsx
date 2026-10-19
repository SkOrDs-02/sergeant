// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  manualExpenseToTransaction,
  normalizeTransaction,
} from "@sergeant/finyk-domain/domain/transactions";
import { CASH_ACCOUNT_ID } from "@sergeant/finyk-domain/constants";
import { AccountBars } from "./AccountBars";

const at = new Date("2026-10-12T10:00:00Z").toISOString();
const txs = [
  manualExpenseToTransaction({
    id: "c",
    date: at,
    amount: 200,
    category: "food",
    account: "cash",
  }),
  manualExpenseToTransaction({
    id: "n",
    date: at,
    amount: 50,
    category: "food",
  }),
  normalizeTransaction(
    { id: "w", amount: -30_000, time: 1_760_263_200, mcc: 6011 },
    { source: "mono", accountId: "black-1" },
  ),
];

function renderBars(selected: string | null, onSelect = vi.fn()) {
  render(
    <AccountBars
      title="За рахунками"
      transactions={txs}
      previousTransactions={null}
      excludedTxIds={new Set(["w"])}
      txSplits={{}}
      accounts={[{ id: "black-1", type: "black" }]}
      selected={selected}
      onSelect={onSelect}
      showBalance
    />,
  );
  return onSelect;
}

describe("AccountBars", () => {
  it("показує готівку й «Без рахунку», виключене зняття не потрапляє в рядки", () => {
    renderBars(null);
    expect(screen.getByText("Готівка на руках")).toBeTruthy();
    expect(screen.getByText("Без рахунку")).toBeTruthy();
    expect(screen.queryByText("Чорна картка")).toBeNull();
  });

  it("тап по рахунку вмикає фільтр, «Усі рахунки» знімає", () => {
    const onSelect = renderBars(null);
    fireEvent.click(screen.getByRole("button", { name: /Готівка на руках/ }));
    expect(onSelect).toHaveBeenCalledWith(CASH_ACCOUNT_ID);
  });

  it("активний фільтр підписаний і знімається", () => {
    const onSelect = renderBars(CASH_ACCOUNT_ID);
    expect(screen.getByText("Лише «Готівка на руках»")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Усі рахунки" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
