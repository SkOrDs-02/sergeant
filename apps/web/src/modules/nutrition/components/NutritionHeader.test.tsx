// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for the nutrition module header shell.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NutritionHeader } from "./NutritionHeader";

describe("NutritionHeader", () => {
  it("shows the module title and subtitle", () => {
    render(<NutritionHeader />);
    expect(screen.getByText("ХАРЧУВАННЯ")).toBeInTheDocument();
    expect(screen.getByText("Мій раціон")).toBeInTheDocument();
  });

  it("renders a back button when onBackToHub is provided", () => {
    const onBackToHub = vi.fn();
    render(<NutritionHeader onBackToHub={onBackToHub} />);
    const back = screen.getByRole("button", { name: "До хабу" });
    fireEvent.click(back);
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("renders settings when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    render(<NutritionHeader onOpenSettings={onOpenSettings} />);
    const settings = screen.getByRole("button", {
      name: "Налаштування модуля",
    });
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
