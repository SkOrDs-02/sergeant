import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import { deriveChecklistSignals } from "./moduleChecklistSignals";
import { STORAGE_KEYS } from "./storageKeys";

describe("deriveChecklistSignals — finyk", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("proves nothing on an empty store", () => {
    const signals = deriveChecklistSignals(store, "finyk");
    expect(signals["add_expense"]).toBe(false);
    expect(signals["set_budget"]).toBe(false);
  });

  it("proves add_expense from a zero-spend day", () => {
    // 0 грн spent today is real data, not an empty state — the quick-stats
    // selector makes the same distinction.
    store.setString(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 0, budgetLeft: null }),
    );
    expect(deriveChecklistSignals(store, "finyk")["add_expense"]).toBe(true);
  });

  it("proves set_budget from an overspent plan (budgetLeft ≤ 0)", () => {
    // `budgetLeft` is null without a plan and a real number with one, so
    // presence — not truthiness — is the signal. A negative value still
    // means a plan exists.
    store.setString(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 500, budgetLeft: -1200 }),
    );
    expect(deriveChecklistSignals(store, "finyk")["set_budget"]).toBe(true);
  });

  it("leaves set_budget unproven when no plan exists", () => {
    store.setString(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 500, budgetLeft: null }),
    );
    expect(deriveChecklistSignals(store, "finyk")["set_budget"]).toBe(false);
  });

  it("never claims connect_bank — that fact lives on the server", () => {
    expect(
      deriveChecklistSignals(store, "finyk")["connect_bank"],
    ).toBeUndefined();
  });

  it("survives a malformed snapshot without throwing", () => {
    store.setString(STORAGE_KEYS.FINYK_QUICK_STATS, "{not json");
    expect(() => deriveChecklistSignals(store, "finyk")).not.toThrow();
    expect(deriveChecklistSignals(store, "finyk")["add_expense"]).toBe(false);
  });
});

describe("deriveChecklistSignals — routine", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("maps today's counters and the streak onto the three steps", () => {
    store.setString(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ todayDone: 2, todayTotal: 3, streak: 5 }),
    );
    const signals = deriveChecklistSignals(store, "routine");
    expect(signals["create_habit"]).toBe(true);
    expect(signals["complete_habit"]).toBe(true);
    expect(signals["three_day_streak"]).toBe(true);
  });

  it("keeps the streak step unproven below 3 days", () => {
    store.setString(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ todayDone: 1, todayTotal: 2, streak: 2 }),
    );
    expect(deriveChecklistSignals(store, "routine")["three_day_streak"]).toBe(
      false,
    );
  });

  it("still proves habits exist on a day with nothing done yet", () => {
    store.setString(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ todayDone: 0, todayTotal: 4, streak: 0 }),
    );
    const signals = deriveChecklistSignals(store, "routine");
    expect(signals["create_habit"]).toBe(true);
    expect(signals["complete_habit"]).toBe(false);
  });
});

describe("deriveChecklistSignals — fizruk & nutrition", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("separates a started workout from a completed one", () => {
    store.setString(
      STORAGE_KEYS.FIZRUK_QUICK_STATS,
      JSON.stringify({ weekWorkouts: 1, streak: 0 }),
    );
    const signals = deriveChecklistSignals(store, "fizruk");
    expect(signals["start_workout"]).toBe(true);
    // `streak` counts completed weeks; one logged workout does not yet
    // prove a finished session.
    expect(signals["complete_workout"]).toBe(false);
  });

  it("proves set_program from the selected template slot", () => {
    expect(deriveChecklistSignals(store, "fizruk")["set_program"]).toBe(false);
    store.setString(STORAGE_KEYS.FIZRUK_SELECTED_TEMPLATE, "tpl_123");
    expect(deriveChecklistSignals(store, "fizruk")["set_program"]).toBe(true);
  });

  it("proves log_meal and daily_plan from the nutrition snapshot", () => {
    store.setString(
      STORAGE_KEYS.NUTRITION_QUICK_STATS,
      JSON.stringify({ todayCal: 1450, calGoal: 2100 }),
    );
    const signals = deriveChecklistSignals(store, "nutrition");
    expect(signals["log_meal"]).toBe(true);
    expect(signals["daily_plan"]).toBe(true);
  });

  it("leaves daily_plan unproven when no calorie goal is set", () => {
    store.setString(
      STORAGE_KEYS.NUTRITION_QUICK_STATS,
      JSON.stringify({ todayCal: 800, calGoal: 0 }),
    );
    expect(deriveChecklistSignals(store, "nutrition")["daily_plan"]).toBe(
      false,
    );
  });
});
