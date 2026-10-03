// @vitest-environment jsdom
/**
 * Branch coverage for TransactionDayHeader — collapse toggle, totals, colours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { TransactionDayHeader } from "./TransactionDayHeader";

const KYIV = new Date("2026-06-15T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(KYIV);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("TransactionDayHeader (branches)", () => {
  const todayKey = () => getKyivDayKey(KYIV);

  it("renders 'Сьогодні' for today's day key", () => {
    render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed={false}
        summary={{ total: -5000, count: 2, statCount: 2 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(/Сьогодні/)).toBeInTheDocument();
  });

  it("calls onToggle with dayKey when header is clicked", () => {
    const onToggle = vi.fn();
    const key = todayKey();
    render(
      <TransactionDayHeader
        dayKey={key}
        collapsed={false}
        summary={{ total: 0, count: 0, statCount: 0 }}
        showTotal={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(key);
  });

  it("sets aria-expanded=false when collapsed", () => {
    render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed
        summary={{ total: 10000, count: 1, statCount: 1 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("sets aria-expanded=true when expanded", () => {
    render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed={false}
        summary={{ total: 10000, count: 1, statCount: 1 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("hides day total when showTotal is false", () => {
    render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed={false}
        summary={{ total: 50000, count: 3, statCount: 3 }}
        showTotal={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\+/)).toBeNull();
    expect(screen.getByText(/· 3/)).toBeInTheDocument();
  });

  it("colours positive totals with success tone", () => {
    const { container } = render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed={false}
        summary={{ total: 25000, count: 1, statCount: 1 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector(".text-success-strong")).not.toBeNull();
  });

  it("uses neutral text colour for non-positive totals", () => {
    const { container } = render(
      <TransactionDayHeader
        dayKey={todayKey()}
        collapsed={false}
        summary={{ total: -12000, count: 2, statCount: 2 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector(".text-text")).not.toBeNull();
    expect(container.querySelector(".text-success-strong")).toBeNull();
  });
});
