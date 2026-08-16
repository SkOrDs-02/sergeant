// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { FINYK_TX_CATEGORIZED: "finyk_tx_categorized" },
}));

import { BankTransactionDetailsSheet } from "./BankTransactionDetailsSheet";

const TRANSACTION: Transaction = {
  id: "bank-1",
  amount: -25000,
  date: "2026-07-28",
  categoryId: "food",
  type: "expense",
  source: "mono",
  time: Math.floor(new Date("2026-07-28T09:30:00+03:00").getTime() / 1000),
  description: "Сільпо",
  mcc: 5411,
  accountId: "account-1",
  manual: false,
  _source: "mono",
  _accountId: "account-1",
  _manual: false,
};

function renderSheet(
  overrides: Partial<Parameters<typeof BankTransactionDetailsSheet>[0]> = {},
) {
  const handlers = {
    onCategoryChange: vi.fn(),
    onNoteChange: vi.fn(),
    onSplitChange: vi.fn(),
    onToggleHidden: vi.fn(),
    onToggleExcludedFromStats: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <BankTransactionDetailsSheet
      transaction={TRANSACTION}
      accounts={[{ id: "account-1", type: "black" }]}
      hidden={false}
      excludedFromStats={false}
      txSplits={{}}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe("BankTransactionDetailsSheet", () => {
  it("shows immutable bank facts and all user-owned overlays in one dialog", () => {
    renderSheet();

    expect(
      screen.getByRole("dialog", { name: "Деталі операції" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("Чорна картка")).toBeInTheDocument();
    expect(
      screen.getByText(/Monobank · дані банку не змінюються/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "Тип запису" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Нотатка до транзакції")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Не враховувати у статистиці/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Приховати зі списку/ }),
    ).toBeInTheDocument();
  });

  it("wires category, note and visibility edits to transaction overlays", () => {
    const handlers = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Транспорт" }));
    expect(handlers.onCategoryChange).toHaveBeenCalledWith(
      "bank-1",
      "transport",
    );

    const note = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.change(note, { target: { value: "Оплата за друга" } });
    fireEvent.blur(note);
    expect(handlers.onNoteChange).toHaveBeenCalledWith(
      "bank-1",
      "Оплата за друга",
    );

    fireEvent.click(
      screen.getByRole("switch", { name: /Не враховувати у статистиці/ }),
    );
    expect(handlers.onToggleExcludedFromStats).toHaveBeenCalledWith("bank-1");

    fireEvent.click(
      screen.getByRole("switch", { name: /Приховати зі списку/ }),
    );
    expect(handlers.onToggleHidden).toHaveBeenCalledWith("bank-1");
  });

  it("edits and saves a balanced category split inside the same dialog", () => {
    const handlers = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Розділити/ }));
    // `getAllByLabelText`, а не роль `spinbutton`: поля сум перейшли на
    // `type="text"` + `inputMode="decimal"`, щоб приймати кому — під
    // `type="number"` «150,50» приходило порожнім рядком і частка ставала 0.
    const amounts = screen.getAllByLabelText("Сума частки");
    fireEvent.change(amounts[0]!, { target: { value: "150" } });
    fireEvent.change(amounts[1]!, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(handlers.onSplitChange).toHaveBeenCalledWith(
      "bank-1",
      expect.arrayContaining([
        expect.objectContaining({ amount: 150 }),
        expect.objectContaining({ amount: 100 }),
      ]),
    );
  });

  it("closes from the explicit footer action", () => {
    const handlers = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});
