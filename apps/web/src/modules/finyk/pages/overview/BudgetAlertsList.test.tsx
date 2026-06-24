// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetAlertsList } from "./BudgetAlertsList";
import type {
  LimitBudget,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";

const CATEGORY = "food";

function makeTx(id: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Date.now(),
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

describe("BudgetAlertsList", () => {
  it("renders nothing when there are no alerts", () => {
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={[]}
        statTx={[]}
        txCategories={{}}
        txSplits={{}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a warning row when spend is over 60% but under the limit", () => {
    // -50000 kopiykas → 500 ₴ spent against a 1000 ₴ limit = 50%? Use 700/1000.
    const tx = makeTx("t1", -70000); // 700 ₴
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={[makeBudget(1000)]}
        statTx={[tx]}
        txCategories={{ t1: CATEGORY }}
        txSplits={{}}
      />,
    );
    expect(screen.getByText(/понад 60% ліміту/)).toBeInTheDocument();
    expect(container.textContent).toContain("70");
  });

  it("renders an over-limit row marked перевищено when spend exceeds the limit", () => {
    const tx = makeTx("t1", -150000); // 1500 ₴
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={[makeBudget(1000)]}
        statTx={[tx]}
        txCategories={{ t1: CATEGORY }}
        txSplits={{}}
      />,
    );
    expect(screen.getByText(/перевищено/)).toBeInTheDocument();
    expect(container.textContent).toContain("150");
  });

  it("falls back to the raw categoryId and 0% when no label resolves and limit is 0", () => {
    const unknownId = "totally-unknown-cat";
    const { container } = render(
      <BudgetAlertsList
        budgetAlerts={[
          {
            id: "b-unknown",
            type: "limit",
            categoryId: unknownId,
            limit: 0,
          } as unknown as LimitBudget,
        ]}
        statTx={[]}
        txCategories={{}}
        txSplits={{}}
      />,
    );
    // No category meta resolves for an unknown id → shows the raw categoryId.
    expect(screen.getByText(unknownId)).toBeInTheDocument();
    expect(container.textContent).toContain("0");
  });
});
