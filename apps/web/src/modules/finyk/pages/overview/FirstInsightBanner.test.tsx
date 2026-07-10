// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FirstInsightBanner } from "./FirstInsightBanner";

describe("FirstInsightBanner", () => {
  it("renders copy and wires set-budget + dismiss actions", () => {
    const onSetBudget = vi.fn();
    const onDismiss = vi.fn();
    render(
      <FirstInsightBanner onSetBudget={onSetBudget} onDismiss={onDismiss} />,
    );
    expect(screen.getByText("Ось куди йдуть твої гроші")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Поставити бюджет" }));
    expect(onSetBudget).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Пізніше" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрити підказку" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
