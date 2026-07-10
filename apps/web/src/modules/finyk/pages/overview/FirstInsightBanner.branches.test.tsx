// @vitest-environment jsdom
/**
 * Branch coverage for FirstInsightBanner — CTA and dismiss affordances.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FirstInsightBanner } from "./FirstInsightBanner";

afterEach(() => cleanup());

describe("FirstInsightBanner (branches)", () => {
  it("calls onSetBudget when primary CTA is clicked", () => {
    const onSetBudget = vi.fn();
    const onDismiss = vi.fn();
    render(
      <FirstInsightBanner onSetBudget={onSetBudget} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Поставити бюджет" }));
    expect(onSetBudget).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss when 'Пізніше' is clicked", () => {
    const onDismiss = vi.fn();
    render(<FirstInsightBanner onSetBudget={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Пізніше" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when icon close button is clicked", () => {
    const onDismiss = vi.fn();
    render(<FirstInsightBanner onSetBudget={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Закрити підказку" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders headline and helper copy", () => {
    render(<FirstInsightBanner onSetBudget={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Ось куди йдуть твої гроші")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Поставити бюджет" }),
    ).toBeInTheDocument();
  });
});
