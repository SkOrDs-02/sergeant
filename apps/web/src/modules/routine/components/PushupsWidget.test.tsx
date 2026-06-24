/** @vitest-environment jsdom */
/**
 * Render + interaction tests for PushupsWidget.
 *
 * The widget is a thin shell over `useRoutinePushups`; we mock that hook
 * with a controllable fixture and assert the rendered count, the 7-day
 * mini-chart (only when there is history), and the add-reps flows
 * (quick-add chips, manual input + Enter, Add button enable/disable).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const addReps = vi.fn();
const pushupsFixture = vi.fn();

vi.mock("../hooks/useRoutinePushups", () => ({
  useRoutinePushups: () => pushupsFixture(),
}));

vi.mock("../lib/hubCalendarAggregate", () => ({
  dateKeyFromDate: (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`,
}));

import { PushupsWidget } from "./PushupsWidget";

function history(...totals: number[]) {
  return totals.map((total, i) => ({ date: `2026-06-${10 + i}`, total }));
}

beforeEach(() => {
  addReps.mockReset();
  pushupsFixture.mockReturnValue({
    todayCount: 0,
    addReps,
    recentHistory: history(0, 0, 0, 0, 0, 0, 0),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PushupsWidget", () => {
  it("renders today's count from the hook", () => {
    pushupsFixture.mockReturnValue({
      todayCount: 42,
      addReps,
      recentHistory: history(0, 0, 0, 0, 0, 0, 0),
    });
    render(<PushupsWidget />);
    expect(screen.getByText("Відтискання сьогодні")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("hides the 7-day chart when there is no history", () => {
    render(<PushupsWidget />);
    expect(screen.queryByText("Останні 7 днів")).not.toBeInTheDocument();
  });

  it("renders the 7-day chart when at least one day has reps", () => {
    pushupsFixture.mockReturnValue({
      todayCount: 0,
      addReps,
      recentHistory: history(5, 0, 10, 0, 0, 20, 0),
    });
    render(<PushupsWidget />);
    expect(screen.getByText("Останні 7 днів")).toBeInTheDocument();
    // Bars carry a title tooltip "date: total".
    expect(screen.getByTitle("2026-06-10: 5")).toBeInTheDocument();
    expect(screen.getByTitle("2026-06-15: 20")).toBeInTheDocument();
  });

  it("opens the add sheet and adds a preset rep count", () => {
    render(<PushupsWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Додати відтискання" }));
    fireEvent.click(screen.getByRole("button", { name: "+15" }));
    expect(addReps).toHaveBeenCalledWith(15);
  });

  it("adds a manually typed count via the Add button", () => {
    render(<PushupsWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Додати відтискання" }));
    const input = screen.getByPlaceholderText("Скільки?");
    fireEvent.change(input, { target: { value: "33" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(addReps).toHaveBeenCalledWith(33);
  });

  it("disables the Add button while the input is empty or non-positive", () => {
    render(<PushupsWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Додати відтискання" }));
    const add = screen.getByRole("button", { name: "Додати" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Скільки?"), {
      target: { value: "0" },
    });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Скільки?"), {
      target: { value: "7" },
    });
    expect(add).toBeEnabled();
  });

  it("submits the manual input on Enter", () => {
    render(<PushupsWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Додати відтискання" }));
    const input = screen.getByPlaceholderText("Скільки?");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(addReps).toHaveBeenCalledWith(12);
  });
});
