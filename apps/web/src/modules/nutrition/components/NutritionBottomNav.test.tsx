// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for nutrition bottom navigation.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NutritionBottomNav } from "./NutritionBottomNav";

describe("NutritionBottomNav", () => {
  it("highlights the active page and forwards tab changes", () => {
    const setActivePage = vi.fn();
    render(
      <NutritionBottomNav activePage="log" setActivePage={setActivePage} />,
    );

    const menu = screen.getByRole("button", { name: "Меню" });
    fireEvent.click(menu);
    expect(setActivePage).toHaveBeenCalledWith("menu");
  });
});
