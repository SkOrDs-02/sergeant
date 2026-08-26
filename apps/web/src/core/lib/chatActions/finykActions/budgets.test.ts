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
import type {
  ChatActionResult,
  ChatActionUndoableResult,
  UpdateBudgetAction,
} from "../types";

// updateBudget defensively validates inputs the static type forbids
// (missing fields, unknown scopes); cast through this helper to exercise
// those runtime guards.
const ub = (input: Record<string, unknown>): UpdateBudgetAction =>
  ({ name: "update_budget", input }) as unknown as UpdateBudgetAction;

/**
 * B39: `setBudgetLimit`/`setMonthlyPlan`/`updateBudget` overwrite existing
 * data, so — per the founder's #8 decision — they're `reversible`, not
 * `destructive`: no confirm modal, but a working `undo`. Every success
 * path below now returns `{ result, undo }` instead of a bare string;
 * this helper asserts the shape and narrows the type for the caller.
 */
function assertUndoable(
  out: ChatActionResult,
): asserts out is ChatActionUndoableResult {
  expect(typeof out).toBe("object");
  expect(typeof (out as ChatActionUndoableResult).undo).toBe("function");
}

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
    assertUndoable(out);
    expect(out.result).toContain("5000 грн");
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
    const out = setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 2000 },
    });
    assertUndoable(out);
    const saved = writes.get("finyk_budgets") as Array<{ limit: number }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.limit).toBe(2000);
  });

  it("B39: undo restores the previous limit on an existing budget", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        {
          id: "b1",
          type: "limit",
          categoryId: "food",
          limit: 1000,
          period: "month",
        },
      ]),
    );
    const out = setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 9000 },
    });
    assertUndoable(out);
    expect(
      (writes.get("finyk_budgets") as Array<{ limit: number }>)[0]!.limit,
    ).toBe(9000);

    out.undo?.();

    const restored = writes.get("finyk_budgets") as Array<{
      id: string;
      limit: number;
    }>;
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: "b1", limit: 1000 });
  });

  it("B39: undo on a NEW limit removes it (no prior entry to restore)", () => {
    const out = setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 5000 },
    });
    assertUndoable(out);
    expect(writes.get("finyk_budgets")).toHaveLength(1);

    out.undo?.();

    expect(writes.get("finyk_budgets")).toEqual([]);
  });
});

describe("setMonthlyPlan", () => {
  it("stores income/expense/savings as strings", () => {
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: 50000, expense: 30000, savings: 10000 },
    });
    assertUndoable(out);
    expect(out.result).toContain("дохід 50000");
    expect(out.result).toContain("витрати 30000");
    expect(out.result).toContain("заощадження 10000");
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
    assertUndoable(out);
    expect(out.result).toContain("дохід 40000");
    expect(out.result).toContain("заощадження 5000");
    const saved = writes.get("finyk_monthly_plan") as Record<string, string>;
    expect(saved["income"]).toBe("40000");
    expect(saved["savings"]).toBe("5000");
  });

  it("renders an em-dash for missing fields", () => {
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: "" },
    });
    assertUndoable(out);
    // empty string is skipped, so all three render the "—" fallback.
    expect(out.result).toContain("дохід — / витрати — / заощадження —");
  });

  it("B39: undo restores the previous plan verbatim", () => {
    localStorage.setItem(
      "finyk_monthly_plan",
      JSON.stringify({ income: "40000", expense: "20000" }),
    );
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: 999999, expense: 999999, savings: 999999 },
    });
    assertUndoable(out);
    expect(writes.get("finyk_monthly_plan")).toEqual({
      income: "999999",
      expense: "999999",
      savings: "999999",
    });

    out.undo?.();

    expect(writes.get("finyk_monthly_plan")).toEqual({
      income: "40000",
      expense: "20000",
    });
  });

  it("B39: undo on a first-ever plan restores the empty state", () => {
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: 30000 },
    });
    assertUndoable(out);
    expect(writes.get("finyk_monthly_plan")).toEqual({ income: "30000" });

    out.undo?.();

    expect(writes.get("finyk_monthly_plan")).toEqual({});
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
    assertUndoable(out);
    expect(out.result).toContain("1500 грн");
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
    assertUndoable(out);
    expect(out.result).toContain('"Авто"');
    expect(out.result).toContain("0/100000 грн");
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

  it("updates an existing goal case-insensitively by name, writing a single AI contribution", () => {
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
    assertUndoable(out);
    expect(out.result).toContain("20000/80000 грн");
    const saved = writes.get("finyk_budgets") as Array<{
      targetAmount: number;
      contributions: Array<{ amountUah: number; note?: string }>;
    }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.targetAmount).toBe(80000);
    // Прогрес більше не пишеться в `savedAmount` — AI-екшн замінює лог
    // поповнень одним записом на всю задану суму (goal-progress-auto-sync).
    expect(saved[0]!.contributions).toHaveLength(1);
    expect(saved[0]!.contributions[0]).toMatchObject({
      amountUah: 20000,
      note: "Через AI-асистента",
    });
  });

  it("rejects an unknown scope", () => {
    expect(updateBudget(ub({ scope: "weird" }))).toContain("Невідомий scope");
  });

  it("B39: undo (scope='limit') restores the previous limit", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        { id: "b1", type: "limit", categoryId: "food", limit: 3000 },
      ]),
    );
    const out = updateBudget(
      ub({ scope: "limit", category_id: "food", limit: 8000 }),
    );
    assertUndoable(out);
    expect(
      (writes.get("finyk_budgets") as Array<{ limit: number }>)[0]!.limit,
    ).toBe(8000);

    out.undo?.();

    const restored = writes.get("finyk_budgets") as Array<{
      id: string;
      limit: number;
    }>;
    expect(restored[0]).toMatchObject({ id: "b1", limit: 3000 });
  });

  it("B39: undo (scope='goal') restores the previous target and contributions", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        {
          id: "g1",
          type: "goal",
          name: "Авто",
          targetAmount: 50000,
          savedAmount: 10000,
          contributions: [],
        },
      ]),
    );
    const out = updateBudget(
      ub({
        scope: "goal",
        name: "Авто",
        target_amount: 999999,
        saved_amount: 999999,
      }),
    );
    assertUndoable(out);
    expect(
      (writes.get("finyk_budgets") as Array<{ targetAmount: number }>)[0]!
        .targetAmount,
    ).toBe(999999);

    out.undo?.();

    const restored = writes.get("finyk_budgets") as Array<{
      targetAmount: number;
      contributions: unknown[];
    }>;
    expect(restored[0]!.targetAmount).toBe(50000);
    expect(restored[0]!.contributions).toEqual([]);
  });

  it("B39: undo on a brand-new goal removes it", () => {
    const out = updateBudget(
      ub({ scope: "goal", name: "Нова ціль", target_amount: 1000 }),
    );
    assertUndoable(out);
    expect(writes.get("finyk_budgets")).toHaveLength(1);

    out.undo?.();

    expect(writes.get("finyk_budgets")).toEqual([]);
  });
});
