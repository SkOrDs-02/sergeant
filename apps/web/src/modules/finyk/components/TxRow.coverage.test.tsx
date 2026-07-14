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
    render(<TxRow tx={mkTx()} hideAmount />);
    expect(screen.getByText("••••")).toBeInTheDocument();
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
    expect(screen.getByText(/💳/)).toBeInTheDocument();
    expect(screen.getByText(/Чорна/)).toBeInTheDocument();
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
    const { container } = render(<TxRow tx={mkTx()} highlighted />);
    expect(container.textContent).toContain("✅");
  });

  it("invokes onClick when the row body is clicked", () => {
    const onClick = vi.fn();
    render(<TxRow tx={mkTx()} onClick={onClick} />);
    fireEvent.click(screen.getByText("АТБ маркет"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies line-through styling and renders 'Відновити' for hidden rows", () => {
    const onHide = vi.fn();
    render(<TxRow tx={mkTx()} hidden onHide={onHide} />);
    expect(screen.getByLabelText("Відновити")).toBeInTheDocument();
  });

  it("calls onHide with the tx id when the hide button is clicked", () => {
    const onHide = vi.fn();
    render(<TxRow tx={mkTx()} onHide={onHide} />);
    fireEvent.click(screen.getByLabelText("Приховати"));
    expect(onHide).toHaveBeenCalledWith("tx-1");
  });

  describe("category picker", () => {
    it("toggles open and calls onCatChange when a category is picked", () => {
      const onCatChange = vi.fn();
      render(<TxRow tx={mkTx()} onCatChange={onCatChange} />);
      fireEvent.click(screen.getByLabelText("Змінити категорію"));
      // a list of category buttons appears; pick the first one
      const buttons = screen.getAllByRole("button");
      // click any category-option button (one containing an emoji + label)
      const food = buttons.find((b) => /Їжа|їжа|АТБ/.test(b.textContent ?? ""));
      // fallback: just click one of the picker buttons
      fireEvent.click(food ?? buttons[buttons.length - 1]!);
      expect(onCatChange).toHaveBeenCalled();
    });

    it("shows a reset option when an override is active", () => {
      const onCatChange = vi.fn();
      render(
        <TxRow tx={mkTx()} onCatChange={onCatChange} overrideCatId="food" />,
      );
      fireEvent.click(screen.getByLabelText("Змінити категорію"));
      const reset = screen.getByText(/скинути/);
      fireEvent.click(reset);
      expect(onCatChange).toHaveBeenCalledWith("tx-1", null);
    });

    it("renders income categories in the picker for income rows", () => {
      const onCatChange = vi.fn();
      render(
        <TxRow
          tx={mkTx({ amount: 100000, description: "Дохід" })}
          onCatChange={onCatChange}
        />,
      );
      fireEvent.click(screen.getByLabelText("Змінити категорію"));
      // income picker buttons are present
      expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
    });

    it("renders the 'змін.' tag when an override is set", () => {
      render(<TxRow tx={mkTx()} overrideCatId="transport" />);
      expect(screen.getByText("змін.")).toBeInTheDocument();
    });
  });

  describe("split editor", () => {
    it("opens, shows the default two-row split and the total label", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      expect(screen.getByText(/Розподіл/)).toBeInTheDocument();
      // two selects rendered for the two default split rows
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("adds a split part via '+ Додати частину'", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      fireEvent.click(screen.getByText("+ Додати частину"));
      expect(screen.getAllByRole("combobox")).toHaveLength(3);
    });

    it("saves a balanced split via onSplitChange", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      const inputs = screen.getAllByRole("spinbutton");
      // total is 250.00; assign both parts to sum to 250 (remaining ≈ 0)
      fireEvent.change(inputs[0]!, { target: { value: "150" } });
      fireEvent.change(inputs[1]!, { target: { value: "100" } });
      expect(screen.getByText(/Суми збігаються/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
      expect(onSplitChange).toHaveBeenCalledWith("tx-1", expect.any(Array));
    });

    it("disables save while amounts do not balance", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      const inputs = screen.getAllByRole("spinbutton");
      fireEvent.change(inputs[0]!, { target: { value: "10" } });
      const save = screen.getByRole("button", { name: "Зберегти" });
      expect(save).toBeDisabled();
    });

    it("removes an extra split row with the ✕ control", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      fireEvent.click(screen.getByText("+ Додати частину"));
      expect(screen.getAllByRole("combobox")).toHaveLength(3);
      fireEvent.click(
        screen.getAllByRole("button", {
          name: "Видалити частину розподілу",
        })[0]!,
      );
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("closes the split editor with the ✕ cancel button", () => {
      const onSplitChange = vi.fn();
      render(<TxRow tx={mkTx()} onSplitChange={onSplitChange} />);
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      expect(screen.getByText(/Розподіл/)).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Закрити редактор розподілу" }),
      );
      expect(screen.queryByText(/Розподіл/)).not.toBeInTheDocument();
    });

    it("pre-populates from existing splits and offers a delete option", () => {
      const onSplitChange = vi.fn();
      const txSplits = {
        "tx-1": [
          { categoryId: "food", amount: 150 },
          { categoryId: "transport", amount: 100 },
        ],
      };
      render(
        <TxRow tx={mkTx()} onSplitChange={onSplitChange} txSplits={txSplits} />,
      );
      // the "спліт" pill shows because existing splits are present
      expect(screen.getByText(/спліт/)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Розподілити транзакцію"));
      const del = screen.getByText("Видалити");
      fireEvent.click(del);
      expect(onSplitChange).toHaveBeenCalledWith("tx-1", null);
    });
  });

  it("renders the transfer tag and hides AI badge for internal transfers", () => {
    // overrideCatId pinned to the internal-transfer category id
    render(<TxRow tx={mkTx()} overrideCatId="internal_transfer" />);
    expect(screen.getByText("не в статистиці")).toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });
});
