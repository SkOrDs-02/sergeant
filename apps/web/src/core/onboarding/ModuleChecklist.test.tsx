/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@shared/hooks/useToast";
import { ModuleChecklist } from "./ModuleChecklist";

vi.mock("@shared/lib/haptic", () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
}));

describe("ModuleChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps earlier checklist steps checked when another checkbox is selected", () => {
    render(
      <ToastProvider>
        <ModuleChecklist moduleId="finyk" />
      </ToastProvider>,
    );

    const addExpense = screen.getByRole("checkbox", {
      name: "Додати першу витрату",
    });
    const setBudget = screen.getByRole("checkbox", {
      name: "Встановити бюджет",
    });

    fireEvent.click(addExpense);
    fireEvent.click(setBudget);

    expect(addExpense).toHaveAttribute("aria-checked", "true");
    expect(setBudget).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2/4 виконано")).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("finyk_checklist_v1") ?? "{}"),
    ).toMatchObject({
      completedSteps: ["add_expense", "set_budget"],
    });
  });
});
