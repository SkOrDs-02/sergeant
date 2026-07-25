// @vitest-environment jsdom
/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TxRowTx } from "./TxRow";

vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    disabled,
    onSwipeLeft,
    onSwipeRight,
    leftLabel,
    leftColor,
    rightLabel,
    rightColor,
    showHint,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    leftLabel?: ReactNode;
    leftColor?: string;
    rightLabel?: ReactNode;
    rightColor?: string;
    showHint?: boolean;
  }) => (
    <div
      data-testid="swipe"
      data-color={rightColor}
      data-left-color={leftColor}
      data-has-right={String(typeof onSwipeRight === "function")}
      data-disabled={String(Boolean(disabled))}
      data-show-hint={String(Boolean(showHint))}
    >
      <span>{rightLabel}</span>
      <span>{leftLabel}</span>
      <button type="button" onClick={onSwipeLeft}>
        swipe-left
      </button>
      <button type="button" onClick={onSwipeRight}>
        swipe-right
      </button>
      {children}
    </div>
  ),
}));

vi.mock("./TxRow", () => ({
  TxRow: ({
    onClick,
    catPickerRequest,
  }: {
    onClick?: () => void;
    catPickerRequest?: number;
  }) => (
    <button type="button" onClick={onClick} data-cat-request={catPickerRequest}>
      transaction
    </button>
  ),
}));

import { TxListItem } from "./TxListItem";

const baseProps = {
  rowIndex: 0,
  selectMode: false,
  selected: false,
  hidden: false,
  txSplits: {},
  accounts: [],
  hideAmount: false,
  onToggleSelect: vi.fn(),
};

afterEach(cleanup);

describe("TxListItem swipe label", () => {
  it("labels a manual transaction swipe as delete", () => {
    const tx = {
      id: "manual-1",
      amount: -100,
      description: "Кава",
      _manual: true,
      _manualId: "manual-1",
    } as TxRowTx;

    render(<TxListItem {...baseProps} tx={tx} onSwipeDeleteManual={vi.fn()} />);

    expect(screen.getByText("Видалити")).toBeInTheDocument();
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-color",
      "bg-danger",
    );
  });

  it("keeps the hide label for an imported transaction", () => {
    const tx = {
      id: "bank-1",
      amount: -100,
      description: "Кава",
    } as TxRowTx;

    render(<TxListItem {...baseProps} tx={tx} onSwipeHideTx={vi.fn()} />);

    expect(screen.getByText("Приховати")).toBeInTheDocument();
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-color",
      "bg-warning/80",
    );
  });

  it("toggles row selection and disables swipe while select mode is active", () => {
    const onToggleSelect = vi.fn();
    const tx = {
      id: "bank-2",
      amount: -100,
      description: "Кава",
    } as TxRowTx;

    render(
      <TxListItem
        {...baseProps}
        tx={tx}
        selectMode
        selected
        onToggleSelect={onToggleSelect}
        onSwipeHideTx={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Зняти вибір" }));
    expect(onToggleSelect).toHaveBeenCalledWith("bank-2");
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("routes swipe callbacks for manual and imported transactions", () => {
    const onSwipeDeleteManual = vi.fn();
    const onSwipeHideTx = vi.fn();
    const manualTx = {
      id: "manual-2",
      amount: -100,
      description: "Кава",
      _manual: true,
      _manualId: "manual-2",
    } as TxRowTx;
    const importedTx = {
      id: "bank-3",
      amount: -100,
      description: "Кава",
    } as TxRowTx;

    const { rerender } = render(
      <TxListItem
        {...baseProps}
        tx={manualTx}
        onSwipeDeleteManual={onSwipeDeleteManual}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "swipe-left" }));
    expect(onSwipeDeleteManual).toHaveBeenCalledWith(manualTx);

    rerender(
      <TxListItem
        {...baseProps}
        tx={importedTx}
        onSwipeHideTx={onSwipeHideTx}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "swipe-left" }));
    expect(onSwipeHideTx).toHaveBeenCalledWith("bank-3");
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-show-hint",
      "true",
    );
  });

  it("opens the manual editor from the row click", () => {
    const onEditManual = vi.fn();
    const tx = {
      id: "manual-3",
      amount: -100,
      description: "Кава",
      _manual: true,
      _manualId: "manual-3",
    } as TxRowTx;

    render(<TxListItem {...baseProps} tx={tx} onEditManual={onEditManual} />);

    fireEvent.click(screen.getByRole("button", { name: "transaction" }));
    expect(onEditManual).toHaveBeenCalledWith("manual-3");
  });

  // #7 — swipe-right quick action.
  it("swipe-right on an imported tx bumps the category-picker trigger", () => {
    const tx = {
      id: "bank-9",
      amount: -100,
      description: "Кава",
    } as TxRowTx;

    render(
      <TxListItem {...baseProps} tx={tx} onCatChange={vi.fn()} />,
    );

    const row = screen.getByRole("button", { name: "transaction" });
    // Starts unset (no swipe yet).
    expect(row).toHaveAttribute("data-cat-request", "0");
    // The left action (revealed by a right-swipe) is the finyk-accent
    // "Категорія" affordance, and onSwipeRight must be wired.
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-left-color",
      "bg-finyk",
    );
    expect(screen.getByTestId("swipe")).toHaveAttribute("data-has-right", "true");

    fireEvent.click(screen.getByRole("button", { name: "swipe-right" }));
    expect(row).toHaveAttribute("data-cat-request", "1");
  });

  it("swipe-right on a manual tx opens its editor instead of the picker", () => {
    const onEditManual = vi.fn();
    const tx = {
      id: "manual-9",
      amount: -100,
      description: "Кава",
      _manual: true,
      _manualId: "manual-9",
    } as TxRowTx;

    render(<TxListItem {...baseProps} tx={tx} onEditManual={onEditManual} />);

    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-left-color",
      "bg-primary",
    );
    fireEvent.click(screen.getByRole("button", { name: "swipe-right" }));
    expect(onEditManual).toHaveBeenCalledWith("manual-9");
  });

  it("omits the swipe-right action when no quick handler is available", () => {
    const tx = {
      id: "bank-10",
      amount: -100,
      description: "Кава",
    } as TxRowTx;

    // No onCatChange → nothing to categorize into → no right action.
    render(<TxListItem {...baseProps} tx={tx} onSwipeHideTx={vi.fn()} />);
    expect(screen.getByTestId("swipe")).toHaveAttribute(
      "data-has-right",
      "false",
    );
  });
});
