// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: {
    EXPENSE_ADDED: "expense_added",
    EXPENSE_DELETED: "expense_deleted",
    FIRST_EXPENSE_ADDED: "first_expense_added",
  },
}));

vi.mock("../hubRoutineSync", () => ({
  notifyFinykRoutineCalendarSync: vi.fn(),
}));

import { trackEvent } from "../../../core/observability/analytics";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { useFinykStorageMutations } from "./useFinykStorageMutations";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

/**
 * Build a fake slots bundle whose setters maintain a mutable `state`
 * object, mirroring `useState` semantics (supporting both value and
 * updater-fn forms). Returns the slots plus a `state` snapshot getter.
 */
function makeSlots(initial: Partial<Record<string, unknown>> = {}) {
  const state: Record<string, unknown> = {
    budgets: [],
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    hiddenTxIds: [],
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    customCategories: [],
    manualExpenses: [],
    excludedStatTxIds: [],
    dismissedRecurring: [],
    ...initial,
  };

  function makeSetter<T>(key: string): Dispatch<SetStateAction<T>> {
    return (next) => {
      const prev = state[key] as T;
      state[key] =
        typeof next === "function" ? (next as (p: T) => T)(prev) : (next as T);
    };
  }

  const slots = {
    budgets: state["budgets"],
    setBudgets: makeSetter("budgets"),
    subscriptions: state["subscriptions"],
    setSubscriptions: makeSetter("subscriptions"),
    manualDebts: state["manualDebts"],
    setManualDebts: makeSetter("manualDebts"),
    receivables: state["receivables"],
    setReceivables: makeSetter("receivables"),
    hiddenAccounts: state["hiddenAccounts"],
    setHiddenAccounts: makeSetter("hiddenAccounts"),
    hiddenTxIds: state["hiddenTxIds"],
    setHiddenTxIds: makeSetter("hiddenTxIds"),
    setTxCategories: makeSetter("txCategories"),
    setTxSplits: makeSetter("txSplits"),
    setMonoDebtLinkedTxIds: makeSetter("monoDebtLinkedTxIds"),
    setCustomCategories: makeSetter("customCategories"),
    setManualExpenses: makeSetter("manualExpenses"),
    setExcludedStatTxIds: makeSetter("excludedStatTxIds"),
    setDismissedRecurring: makeSetter("dismissedRecurring"),
  } as unknown as FinykStorageSlots;

  return { slots, state };
}

function renderMutations(slots: FinykStorageSlots) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useFinykStorageMutations(slots), {
    wrapper,
  });
  return { result, invalidateSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("addManualExpense", () => {
  it("creates an entry with defaults and prepends it", () => {
    const { slots, state } = makeSlots();
    const { result, invalidateSpy } = renderMutations(slots);

    const entry = result.current.addManualExpense({ amount: 1250 });

    expect(entry.amount).toBe(1250);
    expect(entry.category).toBe("інше");
    expect(typeof entry.id).toBe("string");
    expect(state["manualExpenses"]).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(
      "expense_added",
      expect.objectContaining({ category: "інше", source: "manual" }),
    );
  });

  it("fires the first-expense funnel event once, then never again", () => {
    const { slots } = makeSlots();
    const { result } = renderMutations(slots);

    result.current.addManualExpense({ amount: 1, category: "food" });
    expect(localStorage.getItem("finyk_first_expense_seen_v1")).toBe("1");
    const firstFired = (
      trackEvent as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c) => c[0] === "first_expense_added");
    expect(firstFired).toHaveLength(1);

    result.current.addManualExpense({ amount: 2 });
    const secondFired = (
      trackEvent as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c) => c[0] === "first_expense_added");
    expect(secondFired).toHaveLength(1);
  });

  it("coerces a provided id to string", () => {
    const { slots } = makeSlots();
    const { result } = renderMutations(slots);
    const entry = result.current.addManualExpense({
      id: 42 as unknown as string,
      amount: 0,
    });
    expect(entry.id).toBe("42");
  });
});

describe("removeManualExpense / editManualExpense", () => {
  it("removes by id and tracks deletion", () => {
    const { slots, state } = makeSlots({
      manualExpenses: [
        { id: "a", date: "", description: "", amount: 1, category: "x" },
        { id: "b", date: "", description: "", amount: 2, category: "y" },
      ],
    });
    const { result } = renderMutations(slots);

    result.current.removeManualExpense("a");
    expect(state["manualExpenses"]).toEqual([
      { id: "b", date: "", description: "", amount: 2, category: "y" },
    ]);
    expect(trackEvent).toHaveBeenCalledWith("expense_deleted", {
      source: "manual",
    });
  });

  it("patches selected fields only", () => {
    const { slots, state } = makeSlots({
      manualExpenses: [
        { id: "a", date: "d1", description: "old", amount: 1, category: "x" },
      ],
    });
    const { result } = renderMutations(slots);

    result.current.editManualExpense("a", {
      description: "new",
      amount: 999,
    });
    const arr = state["manualExpenses"] as Array<Record<string, unknown>>;
    expect(arr[0]!["description"]).toBe("new");
    expect(arr[0]!["amount"]).toBe(999);
    expect(arr[0]!["date"]).toBe("d1");
  });
});

describe("toggle helpers", () => {
  it("toggleHideAccount adds then removes", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.toggleHideAccount("acc1");
    expect(state["hiddenAccounts"]).toEqual(["acc1"]);
    result.current.toggleHideAccount("acc1");
    expect(state["hiddenAccounts"]).toEqual([]);
  });

  it("hideTx adds then removes", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.hideTx("t1");
    expect(state["hiddenTxIds"]).toEqual(["t1"]);
    result.current.hideTx("t1");
    expect(state["hiddenTxIds"]).toEqual([]);
  });

  it("toggleExcludeFromStats toggles", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.toggleExcludeFromStats("t1");
    expect(state["excludedStatTxIds"]).toEqual(["t1"]);
    result.current.toggleExcludeFromStats("t1");
    expect(state["excludedStatTxIds"]).toEqual([]);
  });

  it("toggleMonoDebtTx toggles a tx under an account", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.toggleMonoDebtTx("acc1", "tx1");
    expect(state["monoDebtLinkedTxIds"]).toEqual({ acc1: ["tx1"] });
    result.current.toggleMonoDebtTx("acc1", "tx1");
    expect(state["monoDebtLinkedTxIds"]).toEqual({ acc1: [] });
  });

  it("toggleLinkedTx links a tx on a debt and a receivable", () => {
    const { slots, state } = makeSlots({
      manualDebts: [{ id: "d1", linkedTxIds: [] }],
      receivables: [{ id: "r1", linkedTxIds: ["keep"] }],
    });
    const { result } = renderMutations(slots);

    result.current.toggleLinkedTx("d1", "tx1", "debt");
    expect((state["manualDebts"] as never[])[0]).toMatchObject({
      linkedTxIds: ["tx1"],
    });

    result.current.toggleLinkedTx("r1", "tx2", "receivable");
    expect((state["receivables"] as never[])[0]).toMatchObject({
      linkedTxIds: ["keep", "tx2"],
    });
  });
});

describe("setSplitTx", () => {
  it("stores splits when there are >=2", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.setSplitTx("tx1", [
      { categoryId: "a", amount: 1 },
      { categoryId: "b", amount: 2 },
    ]);
    expect((state["txSplits"] as Record<string, unknown>)["tx1"]).toHaveLength(
      2,
    );
  });

  it("removes the entry when fewer than 2 splits", () => {
    const { slots, state } = makeSlots({ txSplits: { tx1: [{}, {}] } });
    const { result } = renderMutations(slots);
    result.current.setSplitTx("tx1", [{ categoryId: "a", amount: 1 }]);
    expect(
      (state["txSplits"] as Record<string, unknown>)["tx1"],
    ).toBeUndefined();
  });
});

describe("dismissRecurring / restoreDismissedRecurring", () => {
  it("dismisses unique keys only and ignores blanks", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.dismissRecurring("netflix");
    result.current.dismissRecurring("netflix");
    result.current.dismissRecurring("  ");
    expect(state["dismissedRecurring"]).toEqual(["netflix"]);
  });

  it("restores a single key or clears all", () => {
    const { slots, state } = makeSlots({
      dismissedRecurring: ["a", "b"],
    });
    const { result } = renderMutations(slots);
    result.current.restoreDismissedRecurring("a");
    expect(state["dismissedRecurring"]).toEqual(["b"]);
    result.current.restoreDismissedRecurring(null);
    expect(state["dismissedRecurring"]).toEqual([]);
  });
});

describe("addSubscriptionFromRecurring", () => {
  it("returns null for invalid candidate", () => {
    const { slots } = makeSlots();
    const { result } = renderMutations(slots);
    expect(result.current.addSubscriptionFromRecurring(null)).toBeNull();
    expect(
      result.current.addSubscriptionFromRecurring({ key: "" } as never),
    ).toBeNull();
  });

  it("creates a subscription, dismisses the recurring key, notifies sync", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    const sub = result.current.addSubscriptionFromRecurring({
      key: "spotify",
      displayName: "Spotify",
      billingDay: 5,
      currency: "USD",
      sampleTxIds: ["tx9"],
    } as never);

    expect(sub).toMatchObject({
      name: "Spotify",
      keyword: "spotify",
      billingDay: 5,
      currency: "USD",
      linkedTxId: "tx9",
    });
    expect(state["subscriptions"]).toHaveLength(1);
    expect(state["dismissedRecurring"]).toEqual(["spotify"]);
    expect(notifyFinykRoutineCalendarSync).toHaveBeenCalled();
  });
});

describe("updateSubscription", () => {
  it("patches and deletes null fields, then notifies", () => {
    const { slots, state } = makeSlots({
      subscriptions: [{ id: "s1", name: "Old", emoji: "x" }],
    });
    const { result } = renderMutations(slots);
    result.current.updateSubscription("s1", { name: "New", emoji: null });
    const sub = (state["subscriptions"] as Array<Record<string, unknown>>)[0]!;
    expect(sub["name"]).toBe("New");
    expect("emoji" in sub).toBe(false);
    expect(notifyFinykRoutineCalendarSync).toHaveBeenCalled();
  });
});

describe("overrideCategory", () => {
  it("sets and clears a tx category override", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.overrideCategory("tx1", "food");
    expect((state["txCategories"] as Record<string, unknown>)["tx1"]).toBe(
      "food",
    );
    result.current.overrideCategory("tx1", null);
    expect(
      (state["txCategories"] as Record<string, unknown>)["tx1"],
    ).toBeUndefined();
  });
});

describe("custom categories", () => {
  it("adds a custom category with optional fields", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.addCustomCategory("Coffee", { color: "#fff", icon: "☕" });
    const cats = state["customCategories"] as Array<Record<string, unknown>>;
    expect(cats).toHaveLength(1);
    expect(cats[0]).toMatchObject({
      label: "Coffee",
      color: "#fff",
      icon: "☕",
    });
  });

  it("ignores blanks, over-long labels and duplicates", () => {
    const { slots, state } = makeSlots();
    const { result } = renderMutations(slots);
    result.current.addCustomCategory("");
    result.current.addCustomCategory("x".repeat(81));
    result.current.addCustomCategory("Food");
    result.current.addCustomCategory("food"); // case-insensitive dup
    expect(state["customCategories"]).toHaveLength(1);
  });

  it("edits an existing custom category", () => {
    const { slots, state } = makeSlots({
      customCategories: [{ id: "c1", label: "Old", color: "#000" }],
    });
    const { result } = renderMutations(slots);
    result.current.editCustomCategory("c1", { label: "New", color: "" });
    const cat = (
      state["customCategories"] as Array<Record<string, unknown>>
    )[0]!;
    expect(cat["label"]).toBe("New");
    expect(cat["color"]).toBeUndefined();
  });

  it("removeCustomCategory cleans up tx maps, splits and budgets", () => {
    const { slots, state } = makeSlots({
      customCategories: [{ id: "c1", label: "Gone" }],
      txCategories: { tx1: "c1", tx2: "other" },
      txSplits: {
        txA: [
          { categoryId: "c1", amount: 5 },
          { categoryId: "x", amount: 5 },
        ],
      },
      budgets: [
        { id: "b1", type: "limit", categoryId: "c1" },
        { id: "b2", type: "goal" },
      ],
    });
    const { result } = renderMutations(slots);

    result.current.removeCustomCategory("c1");

    expect(state["customCategories"]).toEqual([]);
    expect(
      (state["txCategories"] as Record<string, unknown>)["tx1"],
    ).toBeUndefined();
    expect((state["txCategories"] as Record<string, unknown>)["tx2"]).toBe(
      "other",
    );
    // c1 split reassigned to "other"
    const splits = (state["txSplits"] as Record<string, unknown>)[
      "txA"
    ] as Array<Record<string, unknown>>;
    expect(splits[0]!["categoryId"]).toBe("other");
    // limit budget on c1 dropped, goal budget kept
    expect(state["budgets"]).toEqual([{ id: "b2", type: "goal" }]);
  });
});
