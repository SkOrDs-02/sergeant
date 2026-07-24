/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  resetVisualKeyboardInsetAdapter,
  setVisualKeyboardInsetAdapter,
} from "@sergeant/shared";
import { RoutineBottomNav } from "./RoutineBottomNav";

describe("RoutineBottomNav", () => {
  afterEach(() => {
    resetVisualKeyboardInsetAdapter();
  });

  it("renders tablist and switches tab", () => {
    const onSelectTab = vi.fn();
    render(<RoutineBottomNav mainTab="calendar" onSelectTab={onSelectTab} />);

    expect(
      screen.getByRole("navigation", { name: "Розділи Рутини" }),
    ).toBeInTheDocument();
    const statsTab = screen.getByRole("tab", { name: /Статистика/i });
    fireEvent.click(statsTab);
    expect(onSelectTab).toHaveBeenCalledWith("stats");
  });

  it("uses unified «Огляд» label for the landing tab (UX roast 2026-Q2 C1)", () => {
    render(<RoutineBottomNav mainTab="calendar" onSelectTab={() => {}} />);
    expect(screen.getByRole("tab", { name: /Огляд/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /^Календар$/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render a Settings tab (settings moved to Hub Settings)", () => {
    render(<RoutineBottomNav mainTab="calendar" onSelectTab={() => {}} />);
    expect(
      screen.queryByRole("tab", { name: /Налаштування/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the add-habit FAB alongside the nav while the keyboard is open (spec § design decision 2)", () => {
    setVisualKeyboardInsetAdapter((active) => (active ? 320 : 0));
    render(
      <RoutineBottomNav
        mainTab="calendar"
        onSelectTab={() => {}}
        onAddHabit={vi.fn()}
      />,
    );

    // `aria-hidden` removes the button from the accessibility tree, and
    // it also zeroes the accessible name computed from its own
    // `aria-label` — even with `{ hidden: true }` — so this reaches
    // straight into the DOM by attribute instead of `getByRole`.
    const fab = document.querySelector('[aria-label="Додати звичку"]')!;
    expect(fab).toHaveAttribute("aria-hidden", "true");
    expect(fab).toHaveAttribute("tabindex", "-1");
    expect(fab.className).toContain("translate-y-full");
  });

  it("keeps the add-habit FAB reachable when the keyboard is closed", () => {
    setVisualKeyboardInsetAdapter(() => 0);
    render(
      <RoutineBottomNav
        mainTab="calendar"
        onSelectTab={() => {}}
        onAddHabit={vi.fn()}
      />,
    );

    const fab = screen.getByRole("button", { name: "Додати звичку" });
    expect(fab).not.toHaveAttribute("aria-hidden");
    expect(fab.className).not.toContain("translate-y-full");
  });
});
