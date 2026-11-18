// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BudgetAlertsList } from "./BudgetAlertsList";
import { calcLimitUsages } from "@sergeant/finyk-domain/domain/budget";
import type {
  LimitBudget,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";

const CATEGORY = "food";

function makeTx(id: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(Date.now() / 1000),
    description: "",
  } as unknown as Transaction;
}

function makeBudget(limit: number): LimitBudget {
  return {
    id: `b-${CATEGORY}`,
    type: "limit",
    categoryId: CATEGORY,
    limit,
  } as unknown as LimitBudget;
}

/** Стан лімітів так, як його дає `useOverviewData.budgetAlerts`. */
function usages(
  budgets: LimitBudget[],
  txs: Transaction[],
  txCategories: Record<string, string> = {},
) {
  return calcLimitUsages(budgets, txs, { txCategories });
}

describe("BudgetAlertsList", () => {
  it("renders nothing when there are no alerts", () => {
    const { container } = render(
      <BudgetAlertsList budgetAlerts={[]} onOpenLimit={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a warning row when spend is past the warn threshold but under the limit", () => {
    const tx = makeTx("t1", -85000); // 850 ₴ із 1000 ₴ = 85%
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={usages([makeBudget(1000)], [tx], { t1: CATEGORY })}
        onOpenLimit={vi.fn()}
      />,
    );
    expect(screen.getByText(/ліміт майже вичерпано/)).toBeInTheDocument();
    expect(container.textContent).toContain("85");
    // Число порогу в підписі протухло б при наступній зміні шкали (PR-F8).
    expect(container.textContent).not.toMatch(/понад \d+%/);
  });

  it("renders an over-limit row marked перевищено when spend exceeds the limit", () => {
    const tx = makeTx("t1", -150000); // 1500 ₴
    const onOpenLimit = vi.fn();
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={usages([makeBudget(1000)], [tx], { t1: CATEGORY })}
        onOpenLimit={onOpenLimit}
      />,
    );
    expect(screen.getByText(/150% використано/)).toBeInTheDocument();
    expect(container.textContent).toContain("150");
    fireEvent.click(
      screen.getByRole("button", { name: /Відкрити ліміт у плануванні/ }),
    );
    expect(onOpenLimit).toHaveBeenCalledWith(CATEGORY);
  });

  it("falls back to the raw categoryId and 0% when no label resolves and limit is 0", () => {
    const unknownId = "totally-unknown-cat";
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={[
          {
            ...usages([makeBudget(1000)], [])[0]!,
            budget: {
              id: "b-unknown",
              type: "limit",
              categoryId: unknownId,
              limit: 0,
            } as unknown as LimitBudget,
            pctRaw: 0,
            overLimit: false,
          },
        ]}
        onOpenLimit={vi.fn()}
      />,
    );
    // No category meta resolves for an unknown id → shows the raw categoryId.
    expect(screen.getByText(unknownId)).toBeInTheDocument();
    expect(container.textContent).toContain("0");
  });
});
