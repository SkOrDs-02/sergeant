// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodaySummaryCard } from "./TodaySummaryCard";

describe("TodaySummaryCard", () => {
  it("shows today's facts, daily plan, and remaining pace", () => {
    render(
      <TodaySummaryCard
        spent={320}
        income={500}
        dailyPlan={400}
        showBalance
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
    expect(screen.getByText("320 ₴")).toBeInTheDocument();
    expect(screen.getByText("500 ₴")).toBeInTheDocument();
    expect(screen.getByText("400 ₴")).toBeInTheDocument();
    expect(screen.getByText(/80 ₴ до темпу/)).toBeInTheDocument();
  });

  it("shows overspend and does not invent a plan when none exists", () => {
    const { rerender } = render(
      <TodaySummaryCard
        spent={450}
        income={0}
        dailyPlan={400}
        showBalance
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/50 ₴ понад темп/)).toBeInTheDocument();

    rerender(
      <TodaySummaryCard
        spent={450}
        income={0}
        dailyPlan={null}
        showBalance
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Не задано")).toBeInTheDocument();
    expect(screen.queryByText(/темп/)).not.toBeInTheDocument();
  });

  it("masks amounts and opens today's transactions", () => {
    const onOpen = vi.fn();
    render(
      <TodaySummaryCard
        spent={320}
        income={500}
        dailyPlan={400}
        showBalance={false}
        onOpen={onOpen}
      />,
    );

    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити операції за сьогодні" }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
