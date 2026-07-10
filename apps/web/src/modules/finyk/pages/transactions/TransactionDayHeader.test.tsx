// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionDayHeader } from "./TransactionDayHeader";

const KYIV = new Date("2026-06-15T09:00:00Z");

describe("TransactionDayHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const summary = { count: 3, total: -15000, statCount: 2 };

  it("labels today and toggles collapse on click", () => {
    const onToggle = vi.fn();
    render(
      <TransactionDayHeader
        dayKey="2026-06-15"
        collapsed={false}
        summary={summary}
        showTotal
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText(/Сьогодні/)).toBeInTheDocument();
    expect(screen.getByText("· 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("2026-06-15");
  });

  it("uses expand aria-label when collapsed", () => {
    render(
      <TransactionDayHeader
        dayKey="2026-06-14"
        collapsed
        summary={summary}
        showTotal={false}
        onToggle={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Розгорнути/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/₴/)).not.toBeInTheDocument();
  });

  it("colours positive day total as success", () => {
    const { container } = render(
      <TransactionDayHeader
        dayKey="2026-06-10"
        collapsed={false}
        summary={{ count: 1, total: 50000, statCount: 1 }}
        showTotal
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector(".text-success-strong")).not.toBeNull();
  });
});
