// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `WaterTrackerCard` rendering + interactions.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
const subtract = vi.fn();
const reset = vi.fn();
let todayMl = 0;
vi.mock("../hooks/useWaterTracker", () => ({
  useWaterTracker: () => ({ todayMl, add, subtract, reset }),
}));

import { WaterTrackerCard } from "./WaterTrackerCard";

beforeEach(() => {
  todayMl = 0;
  add.mockReset();
  subtract.mockReset();
  reset.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("WaterTrackerCard", () => {
  it("renders the goal progress text", () => {
    todayMl = 500;
    render(<WaterTrackerCard goalMl={2000} />);
    expect(screen.getByText(/500 мл/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 л/)).toBeInTheDocument();
  });

  it("adds water on a quick-add tap", () => {
    render(<WaterTrackerCard goalMl={2000} />);
    fireEvent.click(screen.getByText("+200"));
    expect(add).toHaveBeenCalledWith(200);
  });

  it("adds a custom amount and shows undo", () => {
    render(<WaterTrackerCard goalMl={2000} />);
    const input = screen.getByLabelText("Свій об'єм у мл");
    fireEvent.change(input, { target: { value: "350" } });
    fireEvent.click(screen.getByText("+ Додати"));
    expect(add).toHaveBeenCalledWith(350);
    // After a custom add, the undo button surfaces with the last amount.
    expect(
      screen.getByLabelText(/Відмінити останнє додавання/),
    ).toBeInTheDocument();
  });

  it("adds a custom amount on Enter", () => {
    render(<WaterTrackerCard goalMl={2000} />);
    const input = screen.getByLabelText("Свій об'єм у мл");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(add).toHaveBeenCalledWith(250);
  });

  it("undoes the last addition", () => {
    render(<WaterTrackerCard goalMl={2000} />);
    fireEvent.click(screen.getByText("+300"));
    fireEvent.click(screen.getByLabelText(/Відмінити останнє додавання/));
    expect(subtract).toHaveBeenCalledWith(300);
  });

  it("ignores a non-positive custom amount", () => {
    render(<WaterTrackerCard goalMl={2000} />);
    const input = screen.getByLabelText("Свій об'єм у мл");
    fireEvent.change(input, { target: { value: "0" } });
    // Button disabled → click does nothing.
    fireEvent.click(screen.getByText("+ Додати"));
    expect(add).not.toHaveBeenCalled();
  });

  it("requires a two-tap confirm to reset", () => {
    todayMl = 800;
    render(<WaterTrackerCard goalMl={2000} />);
    const resetBtn = screen.getByLabelText("Скинути воду за сьогодні");
    fireEvent.click(resetBtn);
    // First tap arms the confirm state, does not reset yet.
    expect(reset).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByLabelText("Підтвердити скидання води за сьогодні"),
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("clears the pending confirm after the timeout", () => {
    todayMl = 800;
    render(<WaterTrackerCard goalMl={2000} />);
    fireEvent.click(screen.getByLabelText("Скинути воду за сьогодні"));
    expect(
      screen.getByLabelText("Підтвердити скидання води за сьогодні"),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.getByLabelText("Скинути воду за сьогодні"),
    ).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it("hides the reset button when no water logged", () => {
    todayMl = 0;
    render(<WaterTrackerCard goalMl={2000} />);
    expect(
      screen.queryByLabelText("Скинути воду за сьогодні"),
    ).not.toBeInTheDocument();
  });
});
