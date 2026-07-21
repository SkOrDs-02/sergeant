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
    rightLabel,
    rightColor,
    showHint,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSwipeLeft?: () => void;
    rightLabel?: ReactNode;
    rightColor?: string;
    showHint?: boolean;
  }) => (
    <div
      data-testid="swipe"
      data-color={rightColor}
      data-disabled={String(Boolean(disabled))}
      data-show-hint={String(Boolean(showHint))}
    >
      <span>{rightLabel}</span>
      <button type="button" onClick={onSwipeLeft}>
        swipe-left
      </button>
      {children}
    </div>
  ),
}));

vi.mock("./TxRow", () => ({
  TxRow: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
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
});
