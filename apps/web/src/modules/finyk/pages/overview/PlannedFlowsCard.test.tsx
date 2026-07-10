// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
import { PlannedFlowsCard } from "./PlannedFlowsCard";

describe("PlannedFlowsCard", () => {
  const flows = [
    {
      id: "sub-1",
      title: "Netflix",
      hint: "завтра",
      amount: 299,
      sign: "-",
      currency: "₴",
      color: THEME_HEX.danger,
    },
    {
      id: "sub-2",
      title: "Spotify",
      hint: "через 3 дн",
      amount: 99,
      sign: "-",
      currency: "₴",
      color: THEME_HEX.danger,
    },
  ];

  it("returns null when plannedFlows is empty", () => {
    const { container } = render(
      <PlannedFlowsCard plannedFlows={[]} onNavigate={vi.fn()} showBalance />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders up to five flows and navigates to budgets", () => {
    const onNavigate = vi.fn();
    render(
      <PlannedFlowsCard
        plannedFlows={flows}
        onNavigate={onNavigate}
        showBalance
      />,
    );
    expect(screen.getByText("Найближчі платежі")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Усі →" }));
    expect(onNavigate).toHaveBeenCalledWith("budgets");
  });

  it("masks amounts when showBalance=false", () => {
    render(
      <PlannedFlowsCard
        plannedFlows={flows}
        onNavigate={vi.fn()}
        showBalance={false}
      />,
    );
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });
});
