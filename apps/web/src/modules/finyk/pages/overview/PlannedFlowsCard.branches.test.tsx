// @vitest-environment jsdom
/**
 * Branch coverage for PlannedFlowsCard — empty early return, slice limit, navigate.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PlannedFlowsCard } from "./PlannedFlowsCard";
import type { FlowItem } from "./FlowRow";

afterEach(() => cleanup());

function mkFlow(
  id: string,
  overrides: Partial<FlowItem> = {},
): FlowItem & { id: string } {
  return {
    id,
    title: `Flow ${id}`,
    amount: 100,
    sign: "−",
    currency: "₴",
    ...overrides,
  };
}

describe("PlannedFlowsCard (branches)", () => {
  it("returns null when plannedFlows is empty", () => {
    const { container } = render(
      <PlannedFlowsCard plannedFlows={[]} onNavigate={vi.fn()} showBalance />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders up to five flow rows and header", () => {
    const flows = Array.from({ length: 7 }, (_, i) => mkFlow(`f${i}`));
    render(
      <PlannedFlowsCard
        plannedFlows={flows}
        onNavigate={vi.fn()}
        showBalance
      />,
    );
    expect(screen.getByText("Найближчі платежі")).toBeInTheDocument();
    expect(screen.getByText("Flow f0")).toBeInTheDocument();
    expect(screen.getByText("Flow f4")).toBeInTheDocument();
    expect(screen.queryByText("Flow f5")).toBeNull();
  });

  it("navigates to budgets when 'Усі →' is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <PlannedFlowsCard
        plannedFlows={[mkFlow("sub-1")]}
        onNavigate={onNavigate}
        showBalance
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Усі →" }));
    expect(onNavigate).toHaveBeenCalledWith("budgets");
  });

  it("masks amounts when showBalance is false", () => {
    render(
      <PlannedFlowsCard
        plannedFlows={[mkFlow("sub-1")]}
        onNavigate={vi.fn()}
        showBalance={false}
      />,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
  });
});
