// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// finykChatWrite normally mirrors into the SQLite dual-write store (a
// fire-and-forget async side effect that needs a warm DB). For these unit
// tests we replace it with a synchronous LS write so the budget reducers'
// pure logic is what we assert on — a regression away from persisting would
// leave `mem` empty and fail.
const writes = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./dualWriteBridge", () => ({
  finykChatWrite: vi.fn((key: string, value: unknown) => {
    writes.set(key, value);
    localStorage.setItem(key, JSON.stringify(value));
  }),
}));

import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../../modules/finyk/lib/sqliteReader";
import { setBudgetLimit, setMonthlyPlan, updateBudget } from "./budgets";
import { finykChatWrite } from "./dualWriteBridge";
import type { UpdateBudgetAction } from "../types";

// updateBudget defensively validates inputs the static type forbids
// (missing fields, unknown scopes); cast through this helper to exercise
// those runtime guards.
const ub = (input: Record<string, unknown>): UpdateBudgetAction =>
  ({ name: "update_budget", input }) as unknown as UpdateBudgetAction;

beforeEach(() => {
  localStorage.clear();
  writes.clear();
  clearFinykSqliteCache();
  __setFinykSqliteStateCacheForTests({});
  vi.clearAllMocks();
});
afterEach(() => {
  localStorage.clear();
  writes.clear();
  clearFinykSqliteCache();
});

describe("setBudgetLimit", () => {
  it("creates a new limit budget and persists it", () => {
    const out = setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 5000 },
    });
    expect(out).toContain("5000 грн");
    expect(finykChatWrite).toHaveBeenCalledWith(
      "finyk_budgets",
      expect.any(Array),
    );
    const saved = writes.get("finyk_budgets") as Array<{
      type: string;
      categoryId: string;
      limit: number;
    }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      type: "limit",
      categoryId: "food",
      limit: 5000,
    });
  });

  it("updates an existing limit in place rather than duplicating", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        { id: "b1", type: "limit", categoryId: "food", limit: 1000 },
      ]),
    );
    setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 2000 },
    });
    const saved = writes.get("finyk_budgets") as Array<{ limit: number }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.limit).toBe(2000);
  });
});

describe("setMonthlyPlan", () => {
  it("stores income/expense/savings as strings", () => {
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: 50000, expense: 30000, savings: 10000 },
    });
    expect(out).toContain("дохід 50000");
    expect(out).toContain("витрати 30000");
    expect(out).toContain("заощадження 10000");
    const saved = writes.get("finyk_monthly_plan") as {
      income: string;
      expense: string;
      savings: string;
    };
    expect(saved).toEqual({
      income: "50000",
      expense: "30000",
      savings: "10000",
    });
  });

  it("merges into a previous plan, leaving unset fields untouched", () => {
    localStorage.setItem(
      "finyk_monthly_plan",
      JSON.stringify({ income: "40000", expense: "20000" }),
    );
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { savings: 5000 },
    });
    expect(out).toContain("дохід 40000");
    expect(out).toContain("заощадження 5000");
    const saved = writes.get("finyk_monthly_plan") as Record<string, string>;
    expect(saved["income"]).toBe("40000");
    expect(saved["savings"]).toBe("5000");
  });

  it("renders an em-dash for missing fields", () => {
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: "" },
    });
    // empty string is skipped, so all three render the "—" fallback.
    expect(out).toContain("дохід — / витрати — / заощадження —");
  });
});

describe("updateBudget", () => {
  it("rejects scope='limit' without a category_id", () => {
    expect(updateBudget(ub({ scope: "limit", limit: 100 }))).toContain(
      "потрібен category_id",
    );
  });

  it("rejects scope='limit' with a non-positive limit", () => {
    expect(
      updateBudget(ub({ scope: "limit", category_id: "food", limit: 0 })),
    ).toContain("додатний limit");
  });

  it("creates a new limit under scope='limit'", () => {
    const out = updateBudget(
      ub({ scope: "limit", category_id: "transport", limit: 1500 }),
    );
    expect(out).toContain("1500 грн");
    const saved = writes.get("finyk_budgets") as Array<{
      categoryId: string;
      limit: number;
    }>;
    expect(saved[0]).toMatchObject({ categoryId: "transport", limit: 1500 });
  });

  it("rejects scope='goal' without a name", () => {
    expect(updateBudget(ub({ scope: "goal", target_amount: 1000 }))).toContain(
      "потрібне name",
    );
  });

  it("rejects scope='goal' with a non-positive target_amount", () => {
    expect(
      updateBudget(ub({ scope: "goal", name: "Авто", target_amount: -5 })),
    ).toContain("додатний target_amount");
  });

  it("creates a goal with default saved=0 when saved_amount omitted", () => {
    const out = updateBudget(
      ub({ scope: "goal", name: "Авто", target_amount: 100000 }),
    );
    expect(out).toContain('"Авто"');
    expect(out).toContain("0/100000 грн");
    const saved = writes.get("finyk_budgets") as Array<{
      type: string;
      name: string;
      savedAmount: number;
    }>;
    expect(saved[0]).toMatchObject({
      type: "goal",
      name: "Авто",
      savedAmount: 0,
    });
  });

  it("updates an existing goal case-insensitively by name", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        {
          id: "g1",
          type: "goal",
          name: "Авто",
          targetAmount: 50000,
          savedAmount: 10000,
        },
      ]),
    );
    const out = updateBudget(
      ub({
        scope: "goal",
        name: "авто",
        target_amount: 80000,
        saved_amount: 20000,
      }),
    );
    expect(out).toContain("20000/80000 грн");
    const saved = writes.get("finyk_budgets") as Array<{
      targetAmount: number;
      savedAmount: number;
    }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ targetAmount: 80000, savedAmount: 20000 });
  });

  it("rejects an unknown scope", () => {
    expect(updateBudget(ub({ scope: "weird" }))).toContain("Невідомий scope");
  });
});
