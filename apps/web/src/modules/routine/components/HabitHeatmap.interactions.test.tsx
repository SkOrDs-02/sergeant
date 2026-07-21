/** @vitest-environment jsdom */
/**
 * Interaction + branch coverage for HabitHeatmap (selection, roving
 * keyboard navigation and the persistent aria-live details region).
 * The label / off-by-year regression is covered separately in
 * HabitHeatmap.test.tsx; this file drives the stateful behaviour.
 *
 * "Today" is pinned to 2026-06-16 (12:00 Europe/Kyiv) so the grid is
 * deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HabitHeatmap } from "./HabitHeatmap";
import type { Habit } from "../lib/types";

const FIXED_NOW = new Date("2026-06-16T09:00:00Z");

const habits: Habit[] = [{ id: "h1", name: "Випити воду" }];
const completions: Record<string, string[]> = {
  h1: ["2026-06-16", "2026-06-15"],
};

describe("HabitHeatmap interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows today's details by default and selects the cell on click", () => {
    render(<HabitHeatmap habits={habits} completions={completions} />);
    expect(screen.getByText(/1 з 1 звички виконано/)).toBeInTheDocument();

    const todayCell = screen.getByLabelText("2026-06-16: 1 з 1 звички");
    fireEvent.click(todayCell);
    expect(todayCell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1 з 1 звички виконано/)).toBeInTheDocument();
  });

  it("toggles selection off when the same cell is clicked twice", () => {
    render(<HabitHeatmap habits={habits} completions={completions} />);
    const cell = screen.getByLabelText("2026-06-16: 1 з 1 звички");
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/1 з 1 звички виконано/)).toBeInTheDocument();
  });

  it("reports 'немає звичок' for a selected cell when there are no habits", () => {
    render(<HabitHeatmap habits={[]} completions={{}} />);
    // With zero habits each cell reads "0 з 0 звичок"; select today.
    const cell = screen.getByLabelText("2026-06-16: 0 з 0 звичок");
    fireEvent.click(cell);
    expect(screen.getByText("немає звичок")).toBeInTheDocument();
  });

  it("moves the roving tab stop left into the previous week", () => {
    render(<HabitHeatmap habits={habits} completions={completions} />);
    const today = screen.getByLabelText("2026-06-16: 1 з 1 звички");
    // Today is the default tab stop.
    expect(today).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(today, { key: "ArrowLeft" });
    // One week back = 2026-06-09; it becomes the focused/roving cell.
    const prevWeek = screen.getByLabelText("2026-06-09: 0 з 1 звички");
    expect(prevWeek).toHaveAttribute("tabindex", "0");
    expect(today).toHaveAttribute("tabindex", "-1");
  });

  it("ignores non-arrow keydown without changing the roving cell", () => {
    render(<HabitHeatmap habits={habits} completions={completions} />);
    const today = screen.getByLabelText("2026-06-16: 1 з 1 звички");
    fireEvent.keyDown(today, { key: "Enter" });
    expect(today).toHaveAttribute("tabindex", "0");
  });

  it("excludes archived habits from the activity counts", () => {
    const withArchived: Habit[] = [
      { id: "h1", name: "Випити воду" },
      { id: "h2", name: "Старе", archived: true },
    ];
    const comps: Record<string, string[]> = {
      h1: ["2026-06-16"],
      h2: ["2026-06-16"],
    };
    render(<HabitHeatmap habits={withArchived} completions={comps} />);
    // Only the single active habit counts → "1 з 1", not "2 з 2".
    expect(
      screen.getByLabelText("2026-06-16: 1 з 1 звички"),
    ).toBeInTheDocument();
  });

  it("handles null habits/completions without crashing", () => {
    render(<HabitHeatmap habits={null} completions={null} />);
    expect(
      screen.getByText("Активність: сьогодні та історія"),
    ).toBeInTheDocument();
    // No habits → today's cell reads "0 з 0 звичок".
    expect(
      screen.getByLabelText("2026-06-16: 0 з 0 звичок"),
    ).toBeInTheDocument();
  });
});
