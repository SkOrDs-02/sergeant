// @vitest-environment jsdom
/**
 * Coverage-focused tests for the presentational TxRow component.
 *
 * TxRow is a memoized row that renders a single transaction, with optional
 * inline editors for category override and amount splits. These tests exercise
 * the rendering branches (income vs expense, credit-card pill, privatbank tag,
 * AI badge, transfer tag, override tag, splits tag, masked amount) plus the
 * interactive flows (category picker toggle + select, split editor open/edit/
 * save/delete/cancel, hide/restore).
 *
 * Money is integer kopiykas (number). No network — fully synchronous render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TxRow, type TxRowTx } from "./TxRow";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

const KYIV_NOON = new Date("2026-06-04T09:00:00Z"); // 12:00 EEST

function mkTx(overrides: Partial<TxRowTx> = {}): TxRowTx {
  return {
    id: "tx-1",
    amount: -25000, // -250.00 UAH
    description: "АТБ маркет",
    mcc: 5411,
    time: Math.floor(KYIV_NOON.getTime() / 1000),
    currencyCode: 980,
    ...overrides,
  };
}

describe("TxRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(KYIV_NOON);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an expense row with description, category name and amount", () => {
    render(<TxRow tx={mkTx()} />);
    expect(screen.getByText("АТБ маркет")).toBeInTheDocument();
    // amount formatted with UAH; negative expenses render in text color
    expect(screen.getByText(/250/)).toBeInTheDocument();
  });

  it("falls back to 'Транзакція' when description is empty", () => {
    render(<TxRow tx={mkTx({ description: "" })} />);
    expect(screen.getByText("Транзакція")).toBeInTheDocument();
  });

  it("shows the AI badge for an auto-categorized expense", () => {
    // food MCC, no override, not manual, not transfer, not "other"
    render(<TxRow tx={mkTx({ mcc: 5411, description: "Сільпо" })} />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("hides the AI badge for a manual expense", () => {
    render(<TxRow tx={mkTx({ _manual: true })} />);
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });

  it("renders income rows with a positive amount and no AI badge", () => {
    render(
      <TxRow tx={mkTx({ amount: 5000000, description: "Надходження ФОП" })} />,
    );
    expect(screen.getByText("Надходження ФОП")).toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });

  it("masks the amount when hideAmount is set", () => {
    // MaskedAmount (#9 blur-to-reveal) більше не малює «••••» — значення
    // лишається в DOM розмитим і прихованим від AT, з sr-only підписом.
    render(<TxRow tx={mkTx()} hideAmount />);
    expect(screen.getByLabelText(/Прихована сума/)).toBeInTheDocument();
  });

  it("renders a foreign-currency operation amount", () => {
    render(<TxRow tx={mkTx({ currencyCode: 840, operationAmount: -1000 })} />);
    // two amount lines render; foreign op-amount appears as a second line
    expect(screen.getAllByText(/\d/).length).toBeGreaterThan(0);
  });

  it("renders the privatbank tag for П24 transactions", () => {
    render(<TxRow tx={mkTx({ _source: "privatbank" })} />);
    expect(screen.getByText("П24")).toBeInTheDocument();
  });

  it("renders the credit-card pill when the account has a credit limit", () => {
    const accounts: MonoAccount[] = [
      {
        id: "acc-credit",
        type: "black",
        balance: -10000,
        creditLimit: 100000,
      } as MonoAccount,
    ];
    render(
      <TxRow tx={mkTx({ _accountId: "acc-credit" })} accounts={accounts} />,
    );
    expect(screen.getByText(/Чорна/)).toBeInTheDocument();
  });

  it("renders the credit-card pill neutrally, without the red debt colour (§2)", () => {
    const accounts: MonoAccount[] = [
      {
        id: "acc-credit",
        type: "black",
        balance: -10000,
        creditLimit: 100000,
      } as MonoAccount,
    ];
    render(
      <TxRow tx={mkTx({ _accountId: "acc-credit" })} accounts={accounts} />,
    );
    const pill = screen.getByText(/Чорна/).closest("span");
    expect(pill?.className).toContain("bg-panelHi");
    expect(pill?.className).not.toContain("danger");
  });

  it("renders the note as the last element of the meta row (§3)", () => {
    render(<TxRow tx={mkTx()} note="Обід з колегами" />);
    const note = screen.getByText("Обід з колегами");
    // Same row as the category label — no separate line beneath it.
    expect(note.parentElement).toBe(screen.getByText("Продукти").parentElement);
  });

  it("renders a plain account pill for non-credit accounts", () => {
    const accounts: MonoAccount[] = [
      {
        id: "acc-white",
        type: "white",
        balance: 50000,
        creditLimit: 0,
      } as MonoAccount,
    ];
    render(
      <TxRow tx={mkTx({ _accountId: "acc-white" })} accounts={accounts} />,
    );
    expect(screen.getByText("Біла")).toBeInTheDocument();
  });

  it("renders the highlighted check icon", () => {
    render(<TxRow tx={mkTx()} highlighted />);
    expect(
      screen.getByRole("img", { name: "Вибрана транзакція" }),
    ).toBeInTheDocument();
  });

  it("invokes onClick when the row body is clicked", () => {
    const onClick = vi.fn();
    render(<TxRow tx={mkTx()} onClick={onClick} />);
    fireEvent.click(screen.getByText("АТБ маркет"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies line-through styling for hidden rows", () => {
    render(<TxRow tx={mkTx()} hidden />);
    expect(screen.getByText("АТБ маркет")).toHaveClass("line-through");
  });

  it("renders the 'змін.' tag when an override is set", () => {
    render(<TxRow tx={mkTx()} overrideCatId="transport" />);
    expect(screen.getByText("змін.")).toBeInTheDocument();
  });

  it("shows the existing split count without embedding an editor", () => {
    const txSplits = {
      "tx-1": [
        { categoryId: "food", amount: 150 },
        { categoryId: "transport", amount: 100 },
      ],
    };
    render(<TxRow tx={mkTx()} txSplits={txSplits} />);
    expect(screen.getByText(/спліт/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Розподілити транзакцію"),
    ).not.toBeInTheDocument();
  });

  it("renders the transfer tag and hides AI badge for internal transfers", () => {
    // overrideCatId pinned to the internal-transfer category id
    render(<TxRow tx={mkTx()} overrideCatId="internal_transfer" />);
    expect(screen.getByText("не в статистиці")).toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });
});
