/** @vitest-environment jsdom */
/**
 * Branch coverage for BentoCard — inactive copy, adaptive reason chip,
 * and edit-mode drag handle.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ModuleConfig } from "./moduleConfigs";
import { BentoCard } from "./BentoCard";

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span data-testid="grip-icon" />,
}));

function makeConfig(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
  return {
    icon: <span>icon</span>,
    label: "Фінік",
    emoji: "💰",
    module: "finyk",
    iconClass: "bg-finyk-soft",
    accentClass: "bg-finyk",
    cardBg: "bg-panel",
    description: "Транзакції",
    hasGoal: false,
    emptyLabel: "Почни тут",
    getPreview: () => ({ main: "100 ₴", sub: "сьогодні" }),
    ...overrides,
  };
}

describe("BentoCard", () => {
  afterEach(() => cleanup());

  it("uses inactive aria-label and suppresses module description", () => {
    render(<BentoCard config={makeConfig()} onClick={vi.fn()} inactive />);

    expect(
      screen.getByRole("button", {
        name: /неактивний модуль/i,
      }),
    ).toHaveAttribute("data-inactive", "true");
    expect(screen.queryByText("Транзакції")).not.toBeInTheDocument();
  });

  it("shows the adaptive reason chip for lifted cards", () => {
    render(
      <BentoCard
        config={makeConfig()}
        onClick={vi.fn()}
        adaptiveReason="ранкова кава"
      />,
    );
    expect(screen.getByText("ранкова кава")).toBeInTheDocument();
  });

  it("renders the edit-mode drag handle as a sibling control", () => {
    render(
      <BentoCard
        config={makeConfig()}
        onClick={vi.fn()}
        editMode
        handleRef={vi.fn()}
        handleProps={{ "data-testid": "drag-handle" }}
      />,
    );
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("calls onClick when the primary card button is activated", () => {
    const onClick = vi.fn();
    render(<BentoCard config={makeConfig()} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    expect(onClick).toHaveBeenCalled();
  });
});
