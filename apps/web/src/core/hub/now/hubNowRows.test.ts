import { describe, expect, it } from "vitest";
import type { DueCharge } from "@finyk/hooks/useFinykDueCharges";
import { HIDDEN_AMOUNT_MASK } from "@finyk/lib/balanceVisibility";
import type { NowItem } from "./nowItems";
import {
  countNowItems,
  DUE_CHARGES_ROW_ID,
  DUE_CHARGES_ROW_PRIORITY,
  dueChargesNowItem,
  HABIT_ROW_PRIORITY,
  habitNowItems,
  HABITS_MORE_ROW_ID,
  withModuleRows,
} from "./hubNowRows";

function charge(over: Partial<DueCharge> & { id: string }): DueCharge {
  return {
    kind: "subscription",
    title: "Netflix",
    amountMinor: 29_900,
    currency: "₴",
    daysLeft: 1,
    dueDate: new Date("2026-11-19T00:00:00Z"),
    ...over,
  };
}

function ranked(id: string, priority: number, over: Partial<NowItem> = {}) {
  return {
    id,
    module: "nutrition",
    priority,
    title: id,
    action: { kind: "open_module", module: "nutrition" },
    ...over,
  } as NowItem;
}

describe("habitNowItems", () => {
  it("дві звички і рядок «ще N звичок» без чекбокса (П-15 (А))", () => {
    const rows = habitNowItems({
      items: [
        { habitId: "h1", name: "Вода", timeOfDay: "08:00" },
        { habitId: "h2", name: "Читання", timeOfDay: "" },
      ],
      moreCount: 3,
      totalOpen: 5,
    });
    expect(rows.map((r) => r.title)).toEqual([
      "Вода",
      "Читання",
      "Ще 3 звички на сьогодні",
    ]);
    expect(rows[0]?.checkbox).toEqual({ kind: "habit", habitId: "h1" });
    expect(rows[0]?.body).toBe("08:00");
    expect(rows[1]?.body).toBeUndefined();
    expect(rows[2]).toMatchObject({
      id: HABITS_MORE_ROW_ID,
      checkbox: { kind: "none" },
      represents: 3,
      action: { kind: "open_module", module: "routine" },
    });
    expect(rows.every((r) => r.priority === HABIT_ROW_PRIORITY)).toBe(true);
    expect(countNowItems(rows)).toBe(5);
  });

  it("немає відкритих звичок: рядків немає", () => {
    expect(habitNowItems({ items: [], moreCount: 0, totalOpen: 0 })).toEqual(
      [],
    );
  });
});

describe("dueChargesNowItem", () => {
  it("порожній список: рядка немає", () => {
    expect(dueChargesNowItem([], false)).toBeNull();
  });

  it("завтра: назва, сума, «ще N платежів», веде в «Планування»", () => {
    const row = dueChargesNowItem(
      [
        charge({ id: "sub-1" }),
        charge({ id: "debt-1", title: "Борг", amountMinor: 100_000 }),
        charge({ id: "sub-2", amountMinor: null }),
      ],
      false,
    );
    expect(row).toMatchObject({
      id: DUE_CHARGES_ROW_ID,
      recId: DUE_CHARGES_ROW_ID,
      module: "finyk",
      priority: DUE_CHARGES_ROW_PRIORITY,
      title: "Завтра спишеться «Netflix»",
      action: { kind: "open_module", module: "finyk", hash: "budgets" },
    });
    expect(row?.body).toMatch(/^299\s₴ · ще 2 платежі$/u);
    expect(row?.checkbox).toBeUndefined();
  });

  it("сьогодні, невідома сума", () => {
    const row = dueChargesNowItem(
      [charge({ id: "sub-1", daysLeft: 0, amountMinor: null })],
      false,
    );
    expect(row?.title).toBe("Сьогодні спишеться «Netflix»");
    expect(row?.body).toBe("Сума поки невідома");
  });

  it("прихований баланс Фініка маскує суму", () => {
    const row = dueChargesNowItem([charge({ id: "sub-1" })], true);
    expect(row?.body).toBe(HIDDEN_AMOUNT_MASK);
    expect(row?.body).not.toMatch(/299/);
  });
});

describe("withModuleRows", () => {
  const habits = habitNowItems({
    items: [{ habitId: "h1", name: "Вода", timeOfDay: "" }],
    moreCount: 0,
    totalOpen: 1,
  });

  it("рядки звичок замінюють близнюка «Сьогодні ще не виконано»", () => {
    const merged = withModuleRows(
      [
        ranked("routine_evening_reminder", 65, {
          recId: "routine_evening_reminder",
          insightId: "routine-todo-evening",
        }),
        ranked("budget_over_food", 90),
      ],
      habits,
      null,
    );
    expect(merged.map((i) => i.id)).toEqual([
      "budget_over_food",
      "routine_habit_now_h1",
    ]);
  });

  it("без відкритих звичок близнюк лишається", () => {
    const merged = withModuleRows(
      [ranked("routine_evening_reminder", 65)],
      [],
      null,
    );
    expect(merged.map((i) => i.id)).toEqual(["routine_evening_reminder"]);
  });

  it("одна шкала: звички 65 над «спишеться» 60, рівне число — ранкер першим", () => {
    const due = dueChargesNowItem([charge({ id: "sub-1" })], false);
    const merged = withModuleRows(
      [ranked("budget_warn_food", 60), ranked("nutrition_kcal_low", 70)],
      habits,
      due,
    );
    expect(merged.map((i) => i.id)).toEqual([
      "nutrition_kcal_low",
      "routine_habit_now_h1",
      "budget_warn_food",
      DUE_CHARGES_ROW_ID,
    ]);
  });
});
