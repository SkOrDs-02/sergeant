/** @vitest-environment jsdom */
/**
 * Coverage tests for BudgetsGoalsSection.
 *
 * The section at 4.76% coverage needs: collapse toggle, empty-state when open,
 * goal list rendering, and the edit/save/delete/changeSaved handler wiring.
 * We mock GoalBudgetCard so only the section's own branches are exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Budget, GoalBudget } from "@sergeant/finyk-domain/domain/types";
import type { BudgetsGoalsSectionProps } from "./BudgetsGoalsSection";

// Mock GoalBudgetCard — the card has its own coverage and heavy deps.
vi.mock("../../components/budgets/GoalBudgetCard", () => ({
  GoalBudgetCard: ({
    budget,
    isEditing,
    onBeginEdit,
    onChangeSaved,
    onSave,
    onDelete,
  }: {
    budget: { id: string; name?: string };
    isEditing: boolean;
    onBeginEdit: () => void;
    onChangeSaved: (n: number) => void;
    onSave: () => void;
    onDelete: () => void;
  }) => (
    <div
      data-testid={`goal-card-${budget.id}`}
      data-editing={String(isEditing)}
    >
      <span>{budget.name ?? budget.id}</span>
      <button onClick={onBeginEdit}>begin-edit-{budget.id}</button>
      <button onClick={() => onChangeSaved(999)}>
        change-saved-{budget.id}
      </button>
      <button onClick={onSave}>save-{budget.id}</button>
      <button onClick={onDelete}>delete-{budget.id}</button>
    </div>
  ),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn((_toast, opts) => {
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", "undo-goal-btn");
    btn.textContent = "undo-goal";
    btn.addEventListener("click", opts.onUndo);
    document.body.appendChild(btn);
  }),
}));

import { BudgetsGoalsSection } from "./BudgetsGoalsSection";

function makeGoal(id: string): GoalBudget {
  return {
    id,
    type: "goal",
    name: `Goal ${id}`,
    emoji: "🎯",
    targetAmount: 10000,
    savedAmount: 2000,
    targetDate: "2027-01-01",
    // satisfy Budget base
    categoryId: id,
  } as unknown as GoalBudget;
}

const NOW = new Date("2026-06-15T09:00:00Z");
const TOAST = vi.fn() as unknown as ReturnType<
  typeof import("@shared/hooks/useToast").useToast
>;

function buildProps(
  overrides: Partial<BudgetsGoalsSectionProps> = {},
): BudgetsGoalsSectionProps {
  return {
    goalsOpen: false,
    toggleGoals: vi.fn(),
    goalBudgets: [],
    budgets: [] as Budget[],
    setBudgets: vi.fn(),
    editIdx: null,
    setEditIdx: vi.fn(),
    now: NOW,
    toast: TOAST as ReturnType<
      typeof import("@shared/hooks/useToast").useToast
    >,
    ...overrides,
  };
}

describe("BudgetsGoalsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document
      .querySelectorAll('[data-testid="undo-goal-btn"]')
      .forEach((el) => el.remove());
  });

  it("renders the collapse toggle button with correct aria-expanded=false", () => {
    render(<BudgetsGoalsSection {...buildProps()} />);
    const btn = screen.getByRole("button", { name: /Цілі накопичення/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("renders aria-expanded=true when open", () => {
    render(<BudgetsGoalsSection {...buildProps({ goalsOpen: true })} />);
    const btn = screen.getByRole("button", { name: /Цілі накопичення/i });
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("calls toggleGoals when the header is clicked", () => {
    const props = buildProps();
    render(<BudgetsGoalsSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Цілі накопичення/i }));
    expect(props.toggleGoals).toHaveBeenCalledTimes(1);
  });

  it("does NOT show the empty state when the section is closed", () => {
    render(<BudgetsGoalsSection {...buildProps({ goalsOpen: false })} />);
    expect(screen.queryByText("Поки немає цілей")).toBeNull();
  });

  it("shows the empty state when open with no goals", () => {
    render(
      <BudgetsGoalsSection
        {...buildProps({ goalsOpen: true, goalBudgets: [] })}
      />,
    );
    expect(screen.getByText("Поки немає цілей")).toBeInTheDocument();
  });

  it("shows goal count badge when there are goals", () => {
    const goals = [makeGoal("g1"), makeGoal("g2")];
    render(<BudgetsGoalsSection {...buildProps({ goalBudgets: goals })} />);
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("renders GoalBudgetCards when open with goals", () => {
    const goals = [makeGoal("g1"), makeGoal("g2")];
    const budgets = goals as unknown as Budget[];
    render(
      <BudgetsGoalsSection
        {...buildProps({ goalsOpen: true, goalBudgets: goals, budgets })}
      />,
    );
    expect(screen.getByTestId("goal-card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("goal-card-g2")).toBeInTheDocument();
  });

  it("does NOT render cards when closed even if goals exist", () => {
    const goals = [makeGoal("g1")];
    const budgets = goals as unknown as Budget[];
    render(
      <BudgetsGoalsSection
        {...buildProps({ goalsOpen: false, goalBudgets: goals, budgets })}
      />,
    );
    expect(screen.queryByTestId("goal-card-g1")).toBeNull();
  });

  it("onBeginEdit sets editIdx to the goal's global index", () => {
    const goal = makeGoal("g1");
    const budgets = [goal] as unknown as Budget[];
    const setEditIdx = vi.fn();
    render(
      <BudgetsGoalsSection
        {...buildProps({
          goalsOpen: true,
          goalBudgets: [goal],
          budgets,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("begin-edit-g1"));
    expect(setEditIdx).toHaveBeenCalledWith(0);
  });

  it("onSave sets editIdx to null", () => {
    const goal = makeGoal("g1");
    const budgets = [goal] as unknown as Budget[];
    const setEditIdx = vi.fn();
    render(
      <BudgetsGoalsSection
        {...buildProps({
          goalsOpen: true,
          goalBudgets: [goal],
          budgets,
          editIdx: 0,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("save-g1"));
    expect(setEditIdx).toHaveBeenCalledWith(null);
  });

  it("onChangeSaved updates savedAmount in the budgets array", () => {
    const goal = makeGoal("g1");
    const budgets = [goal] as unknown as Budget[];
    const setBudgets = vi.fn();
    render(
      <BudgetsGoalsSection
        {...buildProps({
          goalsOpen: true,
          goalBudgets: [goal],
          budgets,
          setBudgets,
        })}
      />,
    );
    fireEvent.click(screen.getByText("change-saved-g1"));
    expect(setBudgets).toHaveBeenCalled();
    // Verify the updater produces the correct savedAmount
    const updater = setBudgets.mock.calls[0]![0] as (bs: Budget[]) => Budget[];
    const result = updater(budgets);

    expect(result[0]!).toMatchObject({ savedAmount: 999 });
  });

  it("onDelete removes the goal and shows an undo toast", () => {
    const goal = makeGoal("g1");
    const budgets = [goal] as unknown as Budget[];
    const setBudgets = vi.fn();
    const setEditIdx = vi.fn();
    render(
      <BudgetsGoalsSection
        {...buildProps({
          goalsOpen: true,
          goalBudgets: [goal],
          budgets,
          setBudgets,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("delete-g1"));
    expect(setBudgets).toHaveBeenCalled();
    expect(setEditIdx).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("undo-goal-btn")).toBeInTheDocument();
  });

  it("undo after delete restores the goal at the original index", () => {
    const goal = makeGoal("g1");
    const budgets = [goal] as unknown as Budget[];
    const setBudgets = vi.fn();
    render(
      <BudgetsGoalsSection
        {...buildProps({
          goalsOpen: true,
          goalBudgets: [goal],
          budgets,
          setBudgets,
        })}
      />,
    );
    fireEvent.click(screen.getByText("delete-g1"));
    fireEvent.click(screen.getByTestId("undo-goal-btn"));
    // Second setBudgets call is the undo-splice; updater must restore the goal
    expect(setBudgets).toHaveBeenCalledTimes(2);
    const undoUpdater = setBudgets.mock.calls[1]![0] as (
      bs: Budget[],
    ) => Budget[];
    const restored = undoUpdater([]);

    expect(restored[0]!).toBe(goal);
  });
});
