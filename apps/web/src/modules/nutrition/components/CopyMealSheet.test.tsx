// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { todayISODate } from "@sergeant/nutrition-domain";
import { CopyMealSheet } from "./CopyMealSheet";

describe("CopyMealSheet", () => {
  it("за замовчуванням: сьогодні і той самий прийом", () => {
    const onCopy = vi.fn();
    render(
      <CopyMealSheet mealType="breakfast" onClose={vi.fn()} onCopy={onCopy} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Скопіювати" }));
    expect(onCopy).toHaveBeenCalledWith(todayISODate(), "breakfast");
  });

  it("віддає обрані дату й інший прийом", () => {
    const onCopy = vi.fn();
    render(
      <CopyMealSheet mealType="breakfast" onClose={vi.fn()} onCopy={onCopy} />,
    );
    fireEvent.change(screen.getByLabelText("Дата копії"), {
      target: { value: "2026-05-09" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Вечеря/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скопіювати" }));
    expect(onCopy).toHaveBeenCalledWith("2026-05-09", "dinner");
  });

  it("порожня дата блокує копію", () => {
    render(
      <CopyMealSheet mealType="lunch" onClose={vi.fn()} onCopy={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Дата копії"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Скопіювати" })).toBeDisabled();
  });
});
