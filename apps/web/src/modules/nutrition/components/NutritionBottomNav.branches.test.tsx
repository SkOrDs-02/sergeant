// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NutritionBottomNav } from "./NutritionBottomNav";

describe("NutritionBottomNav", () => {
  it("highlights active page and calls setActivePage on nav tap", () => {
    const setActivePage = vi.fn();
    render(
      <NutritionBottomNav activePage="log" setActivePage={setActivePage} />,
    );
    expect(screen.getByRole("button", { name: "Журнал" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(setActivePage).toHaveBeenCalledWith("menu");
  });
});
