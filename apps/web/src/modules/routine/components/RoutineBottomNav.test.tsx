/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { resetVisualKeyboardInsetAdapter } from "@sergeant/shared";
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
});
