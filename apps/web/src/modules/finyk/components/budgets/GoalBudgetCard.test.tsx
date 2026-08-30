// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GoalBudgetCard } from "./GoalBudgetCard";

const baseBudget = {
  id: "g-1",
  type: "goal" as const,
  emoji: "🏖",
  name: "Відпустка",
  targetAmount: 10000,
  targetDate: "2026-12-31",
};

describe("GoalBudgetCard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("shows the jar/manual breakdown only when both sources contributed", () => {
    const { rerender } = render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        fromJar={3000}
        fromContributions={1000}
        linkedJarLabel="На відпустку"
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/з банки/)).toBeInTheDocument();
    expect(screen.getByText(/вручну/)).toBeInTheDocument();

    rerender(
      <GoalBudgetCard
        budget={baseBudget}
        saved={3000}
        pct={30}
        daysLeft={120}
        fromJar={3000}
        fromContributions={0}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/з банки/)).not.toBeInTheDocument();
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

  it("renders the edit form (no more editable saved-amount field) and fires save / delete", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onChangeTarget = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing
        onBeginEdit={vi.fn()}
        onChangeTarget={onChangeTarget}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );
    expect(screen.queryByLabelText("Відкладено")).not.toBeInTheDocument();
    const target = screen.getByLabelText("Сума цілі");
    fireEvent.change(target, { target: { value: "12000" } });
    expect(onChangeTarget).toHaveBeenCalledWith(12000);
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Видалити"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows a jar dropdown in edit mode only when jars are available", () => {
    const onChangeLinkedJar = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing
        jars={[{ id: "jar-1", label: "На відпустку" }]}
        linkedJarId=""
        onBeginEdit={vi.fn()}
        onChangeLinkedJar={onChangeLinkedJar}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Банка Monobank");
    fireEvent.change(select, { target: { value: "jar-1" } });
    expect(onChangeLinkedJar).toHaveBeenCalledWith("jar-1");
  });

  it("adds a contribution via the + Поповнити inline form", () => {
    const onAddContribution = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onAddContribution={onAddContribution}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+ Поповнити"));
    fireEvent.change(screen.getByLabelText("Сума поповнення"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText("Нотатка (необовʼязково)"), {
      target: { value: "Готівка" },
    });
    fireEvent.click(screen.getByText("Додати"));
    expect(onAddContribution).toHaveBeenCalledWith(500, "Готівка");
  });

  it("does not add a contribution with a non-positive amount", () => {
    const onAddContribution = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={4000}
        pct={40}
        daysLeft={120}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onAddContribution={onAddContribution}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+ Поповнити"));
    fireEvent.click(screen.getByText("Додати"));
    expect(onAddContribution).not.toHaveBeenCalled();
  });

  it("shows a collapsed-by-default history list with a delete action per entry", () => {
    const onDeleteContribution = vi.fn();
    render(
      <GoalBudgetCard
        budget={baseBudget}
        saved={1500}
        pct={15}
        daysLeft={120}
        contributions={[
          { id: "c1", amountUah: 1000, date: "2026-07-01", note: "Аванс" },
          { id: "c2", amountUah: 500, date: "2026-07-15" },
        ]}
        isEditing={false}
        onBeginEdit={vi.fn()}
        onDeleteContribution={onDeleteContribution}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Аванс/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Історія (2)"));
    expect(screen.getByText(/Аванс/)).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", {
      name: /Видалити поповнення/,
    });
    fireEvent.click(deleteButtons[0]!);
    expect(onDeleteContribution).toHaveBeenCalledTimes(1);
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

  it("does not repeat a completed-goal celebration after the card remounts", () => {
    const props = {
      budget: baseBudget,
      saved: 10000,
      pct: 100,
      daysLeft: 10,
      isEditing: false,
      onBeginEdit: vi.fn(),
      onSave: vi.fn(),
      onDelete: vi.fn(),
    };
    const firstRender = render(<GoalBudgetCard {...props} />);

    expect(screen.getByText(/Ціль досягнуто/)).toBeInTheDocument();
    firstRender.unmount();
    render(<GoalBudgetCard {...props} />);

    expect(screen.queryByText(/Ціль досягнуто/)).not.toBeInTheDocument();
  });
});
