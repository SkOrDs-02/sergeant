// @vitest-environment jsdom
/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TxRowTx } from "./TxRow";

vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    rightLabel,
    rightColor,
  }: {
    children: ReactNode;
    rightLabel?: ReactNode;
    rightColor?: string;
  }) => (
    <div data-testid="swipe" data-color={rightColor}>
      <span>{rightLabel}</span>
      {children}
    </div>
  ),
}));

vi.mock("./TxRow", () => ({
  TxRow: () => <div>transaction</div>,
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
});
