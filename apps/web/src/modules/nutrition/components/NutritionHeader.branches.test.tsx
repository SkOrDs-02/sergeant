// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NutritionHeader } from "./NutritionHeader";

describe("NutritionHeader", () => {
  it("shows apple badge when onBackToHub is omitted", () => {
    render(<NutritionHeader />);
    expect(screen.queryByLabelText("Назад")).not.toBeInTheDocument();
  });

  it("shows back button when onBackToHub is provided", () => {
    const onBack = vi.fn();
    render(<NutritionHeader onBackToHub={onBack} />);
    fireEvent.click(screen.getByLabelText("Назад"));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a dedicated hub button when onGoToHub is provided", () => {
    const onGoToHub = vi.fn();
    render(<NutritionHeader onBackToHub={vi.fn()} onGoToHub={onGoToHub} />);
    fireEvent.click(screen.getByLabelText("На хаб"));
    expect(onGoToHub).toHaveBeenCalled();
  });

  it("shows settings button only when onOpenSettings is provided", () => {
    const onSettings = vi.fn();
    const { rerender } = render(<NutritionHeader />);
    expect(
      screen.queryByLabelText("Налаштування модуля"),
    ).not.toBeInTheDocument();
    rerender(<NutritionHeader onOpenSettings={onSettings} />);
    fireEvent.click(screen.getByLabelText("Налаштування модуля"));
    expect(onSettings).toHaveBeenCalled();
  });
});
