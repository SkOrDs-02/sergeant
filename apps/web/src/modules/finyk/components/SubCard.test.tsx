// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubCard } from "./SubCard";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const baseSub = {
  id: "sub-1",
  name: "Netflix",
  emoji: "🎬",
  keyword: "netflix",
  billingDay: 15,
  currency: "UAH",
};

describe("SubCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T09:00:00+03:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the subscription name without action emoji in read mode", () => {
    render(<SubCard sub={baseSub} transactions={[]} onDelete={vi.fn()} />);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.queryByText("🎬")).not.toBeInTheDocument();
  });

  it("shows 'ще не списувалось' when there is no matching transaction", () => {
    render(<SubCard sub={baseSub} transactions={[]} onDelete={vi.fn()} />);
    expect(screen.getByText("ще не списувалось")).toBeInTheDocument();
  });

  it("masks the amount when showBalance is false", () => {
    const tx = {
      id: "tx-1",
      amount: -29900,
      time: new Date("2026-06-05T12:00:00+03:00").getTime(),
      description: "netflix.com",
      currencyCode: 980,
    } as unknown as Transaction;
    render(
      <SubCard
        sub={baseSub}
        transactions={[tx]}
        onDelete={vi.fn()}
        showBalance={false}
      />,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
  });

  it("fires onDelete from the trash button", () => {
    const onDelete = vi.fn();
    render(<SubCard sub={baseSub} transactions={[]} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Видалити підписку"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("fires onLinkTransactions and shows the bind label", () => {
    const onLink = vi.fn();
    render(
      <SubCard
        sub={baseSub}
        transactions={[]}
        onDelete={vi.fn()}
        onLinkTransactions={onLink}
      />,
    );
    fireEvent.click(screen.getByText(/Привʼязати транзакцію/));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("enters edit mode and saves a valid patch", () => {
    const onEdit = vi.fn();
    render(
      <SubCard
        sub={baseSub}
        transactions={[]}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати підписку"));
    // Now in edit mode — change the name and save.
    const nameInput = screen.getByPlaceholderText("Назва");
    fireEvent.change(nameInput, { target: { value: "Netflix Premium" } });
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]![0]).toMatchObject({
      name: "Netflix Premium",
      billingDay: 15,
    });
  });

  it("does not save when the billing day is out of range", () => {
    const onEdit = vi.fn();
    render(
      <SubCard
        sub={baseSub}
        transactions={[]}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати підписку"));
    const dayInput = screen.getByPlaceholderText("День (1-31)");
    fireEvent.change(dayInput, { target: { value: "99" } });
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("cancels edit mode and restores the original values", () => {
    render(
      <SubCard
        sub={baseSub}
        transactions={[]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати підписку"));
    expect(screen.getByPlaceholderText("Назва")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Скасувати"));
    // Back to read mode.
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });
});
