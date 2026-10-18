// @vitest-environment jsdom
/**
 * Last validated: 2026-10-18
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NutritionHeader } from "./NutritionHeader";

describe("NutritionHeader", () => {
  it("shows apple badge without a hub exit when onGoToHub is omitted", () => {
    render(<NutritionHeader />);
    expect(screen.queryByLabelText("На хаб")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Назад")).not.toBeInTheDocument();
  });

  it("shows only the hub button on the left when onGoToHub is provided", () => {
    const onGoToHub = vi.fn();
    render(<NutritionHeader onGoToHub={onGoToHub} />);
    fireEvent.click(screen.getByLabelText("На хаб"));
    expect(onGoToHub).toHaveBeenCalled();
    expect(screen.queryByLabelText("Назад")).not.toBeInTheDocument();
  });

  it("moves settings from the header gear into the «Модулі» sheet", () => {
    const onSettings = vi.fn();
    render(<NutritionHeader onOpenSettings={onSettings} />);
    expect(
      screen.queryByLabelText("Налаштування модуля"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("module-header-title"));
    fireEvent.click(
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );
    expect(onSettings).toHaveBeenCalled();
  });

  // v3.1 (В2): мітка активної вкладки дублювала нижню навігацію.
  it("renders no subtitle under the module name", () => {
    render(<NutritionHeader />);
    const title = screen.getByTestId("module-header-title");
    expect(title.parentElement?.children).toHaveLength(1);
  });
});
