// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GoalBudgetCard } from "./GoalBudgetCard";

const baseBudget = {
  id: "g-1",
  type: "goal" as const,
  emoji: "🏖",
  name: "Відпустка",
  targetAmount: 10000,
  savedAmount: 4000,
  targetDate: "2026-12-31",
};

describe("GoalBudgetCard", () => {
  it("renders the goal name, amounts and progress percent in read mode", () => {
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Відпустка/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it("shows 'Без дедлайну' when daysLeft is null", () => {
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={null}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Без дедлайну/)).toBeInTheDocument();
  });

  it("shows the expired marker when daysLeft is not positive", () => {
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={-2}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Термін минув/)).toBeInTheDocument();
  });

  it("renders a monthly label when provided", () => {
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        monthlyLabel="≈ 500 ₴ / міс"
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("≈ 500 ₴ / міс")).toBeInTheDocument();
  });

  it("fires onBeginEdit when the edit pencil is clicked", () => {
    const onBeginEdit = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing={false}
        onBeginEdit={onBeginEdit}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати ціль"));
    expect(onBeginEdit).toHaveBeenCalledTimes(1);
  });

  it("renders the edit form and fires save / delete / change handlers", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onChangeSaved = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing
        onBeginEdit={vi.fn()}
        onChangeSaved={onChangeSaved}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );
    const input = screen.getByPlaceholderText("Відкладено ₴");
    fireEvent.change(input, { target: { value: "5000" } });
    expect(onChangeSaved).toHaveBeenCalledWith(5000);
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Видалити"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("fires the goal-completed celebration when progress hits 100%", () => {
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={10000}
        pct={100}
        daysLeft={10}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // The celebration modal renders its "Ціль досягнуто!" description.
    expect(screen.getByText(/Ціль досягнуто/)).toBeInTheDocument();
  });
});
