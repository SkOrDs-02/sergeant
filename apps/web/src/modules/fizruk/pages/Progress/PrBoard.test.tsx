// @vitest-environment jsdom
/**
 * Unit tests for the PrBoard sub-component extracted from Progress.tsx
 * (page-audit-07 F5 coverage + F20 decomposition).
 *
 * Asserts the muscle-group filter strip, the per-group / empty fallbacks,
 * the touch-target sizing on the filter pills (F7), and the select callback.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PrBoard, type PrEntry } from "./PrBoard";

const PRS: PrEntry[] = [
  {
    id: "bench",
    name: "Жим лежачи",
    muscleGroup: "chest",
    muscleGroupLabel: "Груди",
    best1rm: 120,
    weightKg: 100,
    reps: 5,
    at: "2026-05-14T18:00:00Z",
  },
  {
    id: "squat",
    name: "Присідання",
    muscleGroup: "legs",
    muscleGroupLabel: "Ноги",
    best1rm: 160,
    weightKg: 140,
    reps: 5,
    at: "2026-05-13T18:00:00Z",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrBoard", () => {
  it("renders all PR rows under the all filter", () => {
    render(
      <PrBoard
        prs={PRS}
        prFilter="all"
        onPrFilterChange={vi.fn()}
        musclesUk={{ chest: "Груди", legs: "Ноги" }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("Присідання")).toBeInTheDocument();
    expect(screen.getByText(/Рекорди \(PR\) · 2/)).toBeInTheDocument();
  });

  it("filters rows to the selected muscle group", () => {
    render(
      <PrBoard
        prs={PRS}
        prFilter="chest"
        onPrFilterChange={vi.fn()}
        musclesUk={{ chest: "Груди", legs: "Ноги" }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.queryByText("Присідання")).not.toBeInTheDocument();
  });

  it("filter pills meet the 44px touch-target floor (F7)", () => {
    render(
      <PrBoard
        prs={PRS}
        prFilter="all"
        onPrFilterChange={vi.fn()}
        musclesUk={{ chest: "Груди", legs: "Ноги" }}
        onSelect={vi.fn()}
      />,
    );
    const allPill = screen.getByRole("button", { name: "Всі" });
    expect(allPill.className).toContain("min-h-[44px]");
    expect(allPill).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onPrFilterChange when a group pill is pressed", () => {
    const onPrFilterChange = vi.fn();
    render(
      <PrBoard
        prs={PRS}
        prFilter="all"
        onPrFilterChange={onPrFilterChange}
        musclesUk={{ chest: "Груди", legs: "Ноги" }}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ноги" }));
    expect(onPrFilterChange).toHaveBeenCalledWith("legs");
  });

  it("calls onSelect with the PR id when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <PrBoard
        prs={PRS}
        prFilter="all"
        onPrFilterChange={vi.fn()}
        musclesUk={{}}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Присідання"));
    expect(onSelect).toHaveBeenCalledWith("squat");
  });

  it("shows the no-PR empty state when the list is empty", () => {
    render(
      <PrBoard
        prs={[]}
        prFilter="all"
        onPrFilterChange={vi.fn()}
        musclesUk={{}}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Поки немає силових PR")).toBeInTheDocument();
  });

  it("shows the per-group empty state when the active filter has no rows", () => {
    render(
      <PrBoard
        prs={PRS}
        prFilter="back"
        onPrFilterChange={vi.fn()}
        musclesUk={{ chest: "Груди", legs: "Ноги" }}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Немає PR для цієї групи мʼязів"),
    ).toBeInTheDocument();
  });
});
