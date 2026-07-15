// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebtCard } from "./DebtCard";

describe("DebtCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T09:00:00+03:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a debt with a negative-signed remaining amount", () => {
    render(
      <DebtCard
        name="Кредит"
        emoji="💳"
        remaining={5000}
        paid={5000}
        total={10000}
      />,
    );
    expect(screen.getByText("Кредит")).toBeInTheDocument();
    expect(screen.getByText(/−5,?000\s*₴|−5 000 ₴/)).toBeInTheDocument();
    expect(screen.getByText(/Сплачено/)).toBeInTheDocument();
  });

  it("renders a receivable with a positive sign and 'Отримано' label", () => {
    render(
      <DebtCard
        name="Позика другу"
        emoji=""
        remaining={3000}
        paid={1000}
        total={4000}
        isReceivable
      />,
    );
    expect(screen.getByText(/Отримано/)).toBeInTheDocument();
    expect(screen.getByText(/\+3/)).toBeInTheDocument();
  });

  it("masks amounts when showBalance is false", () => {
    render(
      <DebtCard
        name="Кредит"
        emoji=""
        remaining={5000}
        paid={5000}
        total={10000}
        showBalance={false}
      />,
    );
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });

  it("renders a future due date as 'Через N дн'", () => {
    render(
      <DebtCard
        name="Кредит"
        emoji=""
        remaining={5000}
        paid={0}
        total={5000}
        dueDate="2026-06-15"
      />,
    );
    expect(screen.getByText(/Через 5 дн/)).toBeInTheDocument();
  });

  it("flags an overdue due date", () => {
    render(
      <DebtCard
        name="Кредит"
        emoji=""
        remaining={5000}
        paid={0}
        total={5000}
        dueDate="2026-06-01"
      />,
    );
    expect(screen.getByText(/Прострочено на 9 дн/)).toBeInTheDocument();
  });

  it("fires onDelete and onLink handlers", () => {
    const onDelete = vi.fn();
    const onLink = vi.fn();
    render(
      <DebtCard
        name="Кредит"
        emoji=""
        remaining={5000}
        paid={0}
        total={5000}
        onDelete={onDelete}
        onLink={onLink}
        linkedCount={2}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Видалити Кредит" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(/Прив.язати транзакції \(2\)/));
    expect(onLink).toHaveBeenCalledTimes(1);
  });
});
