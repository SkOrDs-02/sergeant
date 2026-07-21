/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BentoCard } from "./BentoCard";
import type { ModuleConfig } from "./moduleConfigs";

function makeConfig(
  preview: ReturnType<ModuleConfig["getPreview"]>,
  overrides: Partial<ModuleConfig> = {},
): ModuleConfig {
  return {
    icon: "✓",
    label: "Рутина",
    emoji: "✓",
    module: "routine",
    iconClass: "bg-routine-soft text-routine",
    accentClass: "bg-routine",
    cardBg: "bg-routine-soft/40",
    description: "Звички та щоденні цілі",
    hasGoal: true,
    emptyLabel: "Почни тут →",
    getPreview: () => preview,
    ...overrides,
  };
}

describe("BentoCard", () => {
  afterEach(() => cleanup());

  it("summarizes live preview data in the button label and caps progress width", () => {
    const onClick = vi.fn();
    const primaryRef = vi.fn();
    const { container } = render(
      <BentoCard
        config={makeConfig({ main: "4/5", sub: "Серія: 3 дні", progress: 125 })}
        onClick={onClick}
        primaryRef={primaryRef}
        primaryProps={{ "data-testid": "primary-card" }}
      />,
    );

    const card = screen.getByRole("button", {
      name: "Рутина: 4/5, Серія: 3 дні",
    });
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(primaryRef).toHaveBeenCalledWith(screen.getByTestId("primary-card"));
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Серія: 3 дні")).toBeInTheDocument();
    expect(container.querySelector('[style="width: 100%;"]')).toBeTruthy();
  });

  it("renders empty and inactive states with distinct accessible labels", () => {
    const { rerender } = render(
      <BentoCard
        config={makeConfig({ main: null, sub: null, progress: 0 })}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Рутина: Почни тут →" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Звички та щоденні цілі")).toBeInTheDocument();

    rerender(
      <BentoCard
        config={makeConfig({ main: "4/5", sub: "Серія: 3 дні", progress: 80 })}
        inactive
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Рутина — неактивний модуль. Увімкнути в налаштуваннях Hub.",
      }),
    ).toHaveAttribute("data-inactive", "true");
    expect(
      screen.getByText("Неактивний — увімкнути в налаштуваннях"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Серія: 3 дні")).not.toBeInTheDocument();
  });

  it("shows edit-mode drag handle and explainable adaptive lift reason", () => {
    const handleRef = vi.fn();
    const onPointerDown = vi.fn();

    render(
      <BentoCard
        config={makeConfig({ main: "2/5", sub: null, progress: 40 })}
        onClick={vi.fn()}
        editMode
        handleRef={handleRef}
        handleProps={{ onPointerDown }}
        adaptiveReason="ранкова кава"
      />,
    );

    const handle = screen.getByRole("button", { name: "Перетягнути Рутина" });
    fireEvent.pointerDown(handle);

    expect(screen.getByText("ранкова кава")).toBeInTheDocument();
    expect(handleRef).toHaveBeenCalledWith(handle);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
