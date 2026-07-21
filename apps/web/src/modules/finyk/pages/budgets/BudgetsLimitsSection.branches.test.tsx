/** @vitest-environment jsdom */
/**
 * Branch-focused coverage for BudgetsLimitsSection — collapse toggle,
 * empty state, limit cards, proactive-advice dismiss, edit/delete wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Budget, LimitBudget } from "@sergeant/finyk-domain/domain/types";
import type { BudgetsLimitsSectionProps } from "./BudgetsLimitsSection";

vi.mock("../../components/budgets/LimitBudgetCard", () => ({
  LimitBudgetCard: ({
    budget,
    isEditing,
    proactiveText,
    onDismissAdvice,
    onBeginEdit,
    onChangeLimit,
    onChangePeriod,
    onSave,
    onDelete,
  }: {
    budget: { id: string; categoryId?: string };
    isEditing: boolean;
    proactiveText?: string | null;
    onDismissAdvice?: (() => void) | null;
    onBeginEdit: () => void;
    onChangeLimit?: (n: number) => void;
    onChangePeriod?: (period: "month" | "one_time") => void;
    onSave: () => void;
    onDelete: () => void;
  }) => (
    <div
      data-testid={`limit-card-${budget.categoryId ?? budget.id}`}
      data-editing={String(isEditing)}
    >
      {proactiveText ? (
        <span data-testid="proactive-text">{proactiveText}</span>
      ) : null}
      {proactiveText && onDismissAdvice ? (
        <button type="button" onClick={onDismissAdvice}>
          dismiss-advice
        </button>
      ) : null}
      <button type="button" onClick={onBeginEdit}>
        begin-edit-{budget.categoryId ?? budget.id}
      </button>
      <button type="button" onClick={() => onChangeLimit?.(4500)}>
        change-limit-{budget.categoryId ?? budget.id}
      </button>
      <button type="button" onClick={() => onChangePeriod?.("one_time")}>
        change-period-{budget.categoryId ?? budget.id}
      </button>
      <button type="button" onClick={onSave}>
        save-{budget.categoryId ?? budget.id}
      </button>
      <button type="button" onClick={onDelete}>
        delete-{budget.categoryId ?? budget.id}
      </button>
    </div>
  ),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn((_toast, opts) => {
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", "undo-limit-btn");
    btn.textContent = "undo-limit";
    btn.addEventListener("click", opts.onUndo);
    document.body.appendChild(btn);
  }),
}));

import { BudgetsLimitsSection } from "./BudgetsLimitsSection";

const MONTH_START = new Date("2026-06-01T00:00:00Z");
const TOAST = vi.fn() as unknown as ReturnType<
  typeof import("@shared/hooks/useToast").useToast
>;

function makeLimit(id: string, categoryId: string): LimitBudget {
  return {
    id,
    type: "limit",
    categoryId,
    limit: 5000,
  } as unknown as LimitBudget;
}

function buildProps(
  overrides: Partial<BudgetsLimitsSectionProps> = {},
): BudgetsLimitsSectionProps {
  return {
    limitsOpen: false,
    toggleLimits: vi.fn(),
    monthStart: MONTH_START,
    limitBudgets: [],
    budgets: [] as Budget[],
    setBudgets: vi.fn(),
    editIdx: null,
    setEditIdx: vi.fn(),
    customCategories: [],
    calcSpent: () => 1200,
    proactiveItems: [],
    proactiveAdvice: {},
    proactiveLoading: {},
    dismissedAdvice: {},
    dismissAdvice: vi.fn(),
    highlightedCategoryId: null,
    limitCardRefs: { current: new Map() },
    toast: TOAST,
    ...overrides,
  };
}

function makeProactiveItem(
  categoryId: string,
): import("./budgetsLib").ProactiveItem {
  return {
    categoryId,
    monthKey: "2026-06",
    catLabel: "Продукти",
    spent: 1200,
    limit: 5000,
    remaining: 3800,
    pct: 24,
    daysRemaining: 15,
  };
}

describe("BudgetsLimitsSection (branches)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document
      .querySelectorAll('[data-testid="undo-limit-btn"]')
      .forEach((el) => el.remove());
  });

  it("renders collapsed header with aria-expanded=false", () => {
    render(<BudgetsLimitsSection {...buildProps()} />);
    const btn = screen.getByRole("button", { name: /Ліміти/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("calls toggleLimits when the header is clicked", () => {
    const props = buildProps();
    render(<BudgetsLimitsSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Ліміти/i }));
    expect(props.toggleLimits).toHaveBeenCalledTimes(1);
  });

  it("shows limit count badge when limits exist", () => {
    const limits = [makeLimit("b1", "food"), makeLimit("b2", "transport")];
    render(
      <BudgetsLimitsSection
        {...buildProps({ limitBudgets: limits, budgets: limits as Budget[] })}
      />,
    );
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows empty state when open with no limits", () => {
    render(<BudgetsLimitsSection {...buildProps({ limitsOpen: true })} />);
    expect(screen.getByText("Поки немає лімітів")).toBeInTheDocument();
  });

  it("does not show empty state when section is closed", () => {
    render(<BudgetsLimitsSection {...buildProps({ limitsOpen: false })} />);
    expect(screen.queryByText("Поки немає лімітів")).toBeNull();
  });

  it("renders limit cards when open", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
        })}
      />,
    );
    expect(screen.getByTestId("limit-card-food")).toBeInTheDocument();
  });

  it("onBeginEdit sets editIdx to the limit global index", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const setEditIdx = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("begin-edit-food"));
    expect(setEditIdx).toHaveBeenCalledWith(0);
  });

  it("onChangeLimit updates the limit amount", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const setBudgets = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          setBudgets,
        })}
      />,
    );
    fireEvent.click(screen.getByText("change-limit-food"));
    expect(setBudgets).toHaveBeenCalled();
    const updater = setBudgets.mock.calls[0]![0] as (bs: Budget[]) => Budget[];
    expect(updater(budgets)[0]).toMatchObject({ limit: 4500 });
  });

  it("onChangePeriod stores one-time limits with a creation timestamp", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const setBudgets = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          setBudgets,
        })}
      />,
    );
    fireEvent.click(screen.getByText("change-period-food"));
    const updater = setBudgets.mock.calls[0]![0] as (bs: Budget[]) => Budget[];
    const updated = updater(budgets)[0] as LimitBudget;
    expect(updated).toMatchObject({ period: "one_time" });
    expect(updated.createdAt).toEqual(expect.any(String));
  });

  it("onSave clears edit mode", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const setEditIdx = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("save-food"));
    expect(setEditIdx).toHaveBeenCalledWith(null);
  });

  it("onDelete removes the limit and exposes undo", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const setBudgets = vi.fn();
    const setEditIdx = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          setBudgets,
          setEditIdx,
        })}
      />,
    );
    fireEvent.click(screen.getByText("delete-food"));
    expect(setBudgets).toHaveBeenCalled();
    expect(setEditIdx).toHaveBeenCalledWith(null);
    const deleteUpdater = setBudgets.mock.calls[0]![0] as (
      bs: Budget[],
    ) => Budget[];
    expect(deleteUpdater(budgets)).toEqual([]);
    expect(screen.getByTestId("undo-limit-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("undo-limit-btn"));
    const undoUpdater = setBudgets.mock.calls[1]![0] as (
      bs: Budget[],
    ) => Budget[];
    expect(undoUpdater([])).toEqual([limit]);
  });

  it("dismisses proactive advice when monthKey and advice text exist", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const dismissAdvice = vi.fn();
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          proactiveItems: [makeProactiveItem("food")],
          proactiveAdvice: { food: "Зменши витрати" },
          dismissAdvice,
        })}
      />,
    );
    fireEvent.click(screen.getByText("dismiss-advice"));
    expect(dismissAdvice).toHaveBeenCalledWith(
      "food",
      "2026-06",
      "Зменши витрати",
    );
  });

  it("hides proactive text when advice was dismissed", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          proactiveItems: [makeProactiveItem("food")],
          proactiveAdvice: { food: "Зменши витрати" },
          dismissedAdvice: { "2026-06_food": "Зменши витрати" },
        })}
      />,
    );
    expect(screen.queryByTestId("proactive-text")).toBeNull();
    expect(screen.queryByText("dismiss-advice")).toBeNull();
  });

  it("registers limit card refs for deep-link scroll targets", () => {
    const limit = makeLimit("b1", "food");
    const budgets = [limit] as unknown as Budget[];
    const limitCardRefs = { current: new Map<string, HTMLDivElement | null>() };
    render(
      <BudgetsLimitsSection
        {...buildProps({
          limitsOpen: true,
          limitBudgets: [limit],
          budgets,
          highlightedCategoryId: "food",
          limitCardRefs,
        })}
      />,
    );
    expect(limitCardRefs.current.get("food")).toBeInstanceOf(HTMLDivElement);
  });
});
