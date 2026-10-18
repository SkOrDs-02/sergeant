import { describe, it, expect } from "vitest";
import { Recommendations } from "@sergeant/insights";
import type { Rec } from "../../lib/recommendationEngine";
import type { Insight } from "@shared/lib/insights/types";
import {
  HUB_REPORTS_PATH,
  INSIGHT_PRIORITY,
  REC_INSIGHT_TWINS,
  UNKNOWN_INSIGHT_PRIORITY,
  insightPriority,
  mergeNowItems,
  withoutWeekReportTarget,
} from "./nowItems";

function rec(over: Partial<Rec> & { id: string; priority: number }): Rec {
  return {
    module: "nutrition",
    icon: "leaf",
    title: `rec ${over.id}`,
    body: `body ${over.id}`,
    action: "nutrition",
    ...over,
  };
}

function insight(over: Partial<Insight> & { id: string }): Insight {
  return {
    module: "nutrition",
    title: `insight ${over.id}`,
    subtitle: `subtitle ${over.id}`,
    askAiPrompt: `ask ${over.id}`,
    action: { type: "navigate", path: "/nutrition/log" },
    showOn: "both",
    ...over,
  };
}

describe("mergeNowItems — близнюки", () => {
  it("близнюк дає ОДИН рядок: дія з Rec, чип AI з Insight, обидва id походження", () => {
    const items = mergeNowItems(
      [
        rec({
          id: "nutrition_protein_low",
          priority: 68,
          pwaAction: "add_meal",
        }),
      ],
      [insight({ id: "nutrition-protein-low" })],
    );
    expect(items).toHaveLength(1);
    const [only] = items;
    expect(only).toMatchObject({
      id: "nutrition_protein_low",
      priority: 68,
      title: "rec nutrition_protein_low",
      action: {
        kind: "module_action",
        module: "nutrition",
        action: "add_meal",
      },
      askAiPrompt: "ask nutrition-protein-low",
      recId: "nutrition_protein_low",
      insightId: "nutrition-protein-low",
    });
  });

  it("параметричний близнюк бюджету звіряється по ключу категорії, включно з кількома через «+»", () => {
    const items = mergeNowItems(
      [rec({ id: "budget_over_food+coffee", priority: 90, module: "finyk" })],
      [
        insight({ id: "finyk-budget-overrun-coffee", module: "finyk" }),
        insight({ id: "finyk-budget-overrun-taxi", module: "finyk" }),
      ],
    );
    expect(items.map((i) => i.id)).toEqual([
      "budget_over_food+coffee",
      "finyk-budget-overrun-taxi",
    ]);
    expect(items[0]?.insightId).toBe("finyk-budget-overrun-coffee");
  });

  it("кожен близнюк із мапи має число в INSIGHT_PRIORITY, що дорівнює двійнику з коду", () => {
    // Числа двійників — з `recommendationEngine.ts` і `budgetLimits.ts`.
    const twinPriority: Record<string, number> = {
      "nutrition-protein-low": 68,
      "routine-todo-evening": 65,
      "fizruk-rest-day-overdue": 85,
      "finyk-budget-overrun-": 90,
      "finyk-budget-pace-": 60,
    };
    for (const twin of REC_INSIGHT_TWINS) {
      expect(insightPriority(twin.insight + "x")).toBe(
        twinPriority[twin.insight],
      );
    }
  });

  it("дедуп не змінює позицію рядка: близнюк стоїть там, де стояв би сам Rec", () => {
    const withTwin = mergeNowItems(
      [
        rec({ id: "routine_streak_at_risk", priority: 95, module: "routine" }),
        rec({ id: "fizruk_long_break", priority: 85, module: "fizruk" }),
        rec({ id: "nutrition_kcal_low", priority: 70 }),
      ],
      [insight({ id: "fizruk-rest-day-overdue", module: "fizruk" })],
    );
    const withoutTwin = mergeNowItems(
      [
        rec({ id: "routine_streak_at_risk", priority: 95, module: "routine" }),
        rec({ id: "fizruk_long_break", priority: 85, module: "fizruk" }),
        rec({ id: "nutrition_kcal_low", priority: 70 }),
      ],
      [],
    );
    expect(withTwin.map((i) => i.id)).toEqual(withoutTwin.map((i) => i.id));
  });
});

describe("mergeNowItems — шкала і порядок", () => {
  it("інсайт без двійника отримує число з таблиці і сортується разом із Rec", () => {
    const items = mergeNowItems(
      [
        rec({ id: "nutrition_no_meals_today", priority: 75 }),
        rec({
          id: "routine_evening_reminder",
          priority: 65,
          module: "routine",
        }),
      ],
      [
        insight({ id: "fizruk-pr-pending", module: "fizruk" }),
        insight({ id: "routine-streak-record-pending", module: "routine" }),
      ],
    );
    expect(items.map((i) => [i.id, i.priority])).toEqual([
      ["fizruk-pr-pending", 90],
      ["nutrition_no_meals_today", 75],
      ["routine-streak-record-pending", 72],
      ["routine_evening_reminder", 65],
    ]);
  });

  it("невідомий префікс — 50, нижче за все відоме", () => {
    expect(insightPriority("finyk-something-new")).toBe(
      UNKNOWN_INSIGHT_PRIORITY,
    );
    const min = Math.min(...INSIGHT_PRIORITY.map(([, p]) => p));
    expect(UNKNOWN_INSIGHT_PRIORITY).toBeLessThan(min);
  });

  it("рівні пріоритети зберігають порядок джерела: спершу Rec, потім Insight", () => {
    const items = mergeNowItems(
      [rec({ id: "budget_over_food", priority: 90, module: "finyk" })],
      [insight({ id: "fizruk-pr-pending", module: "fizruk" })],
    );
    expect(items.map((i) => i.id)).toEqual([
      "budget_over_food",
      "fizruk-pr-pending",
    ]);
  });

  it("дублікат id у межах одного джерела — перший виграє", () => {
    const items = mergeNowItems(
      [
        rec({ id: "a", priority: 60, title: "first" }),
        rec({ id: "a", priority: 99, title: "second" }),
      ],
      [insight({ id: "b" }), insight({ id: "b", title: "dup" })],
    );
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["a", "first"],
      ["b", "insight b"],
    ]);
  });
});

describe("mergeNowItems — форма рядка", () => {
  it("Rec без pwaAction веде у модуль, з actionHash — глибоко", () => {
    const items = mergeNowItems(
      [
        rec({
          id: "x",
          priority: 50,
          action: "finyk",
          actionHash: "budgets?cat=smoking",
        }),
        rec({ id: "y", priority: 40, action: "reports" }),
      ],
      [],
    );
    expect(items[0]?.action).toEqual({
      kind: "open_module",
      module: "finyk",
      hash: "budgets?cat=smoking",
    });
    expect(items[1]?.action).toEqual({
      kind: "open_module",
      module: "reports",
    });
  });

  it("Insight переносить свою дію (навігація / чат / колбек) і модуль null → hub", () => {
    const fn = () => {};
    const items = mergeNowItems(
      [],
      [
        insight({ id: "n", action: { type: "navigate", path: "/fizruk" } }),
        insight({ id: "c", action: { type: "open-chat", prompt: "?" } }),
        insight({ id: "k", module: null, action: { type: "callback", fn } }),
      ],
    );
    expect(items.map((i) => i.action)).toEqual([
      { kind: "navigate", path: "/fizruk" },
      { kind: "open_chat", prompt: "?" },
      { kind: "callback", fn },
    ]);
    expect(items[2]?.module).toBe("hub");
    expect(items[2]?.recId).toBeUndefined();
  });

  it("порожні джерела — порожній список", () => {
    expect(mergeNowItems([], [])).toEqual([]);
  });
});

// f3 (рішення власника 2026-10-01): тижнева картка про темп веде в «Звіт
// тижня» на хабі, і ця ціль має власний вид дії, а не модуль.
describe("mergeNowItems — ціль «Звіт тижня»", () => {
  const weekRec = rec({
    id: "spending_velocity_high",
    module: "finyk",
    priority: 75,
    action: Recommendations.WEEK_REPORT_ACTION,
  });

  it("Rec із дією week_report дає open_week_report, а не відкриття модуля", () => {
    const [item] = mergeNowItems([weekRec], []);
    expect(item?.action).toEqual({ kind: "open_week_report" });
  });

  it("звичайна навігація в модуль не зачеплена", () => {
    const [item] = mergeNowItems(
      [rec({ id: "x", module: "finyk", priority: 60, action: "finyk" })],
      [],
    );
    expect(item?.action).toEqual({ kind: "open_module", module: "finyk" });
  });

  it("коли блоку «Порада й тиждень» немає, дія повертається в модуль", () => {
    const [item] = mergeNowItems([weekRec], []);
    expect(withoutWeekReportTarget(item!).action).toEqual({
      kind: "open_module",
      module: "finyk",
    });
  });

  it("інші дії fallback не чіпає", () => {
    const [item] = mergeNowItems(
      [rec({ id: "a", priority: 70, pwaAction: "add_meal" })],
      [],
    );
    expect(withoutWeekReportTarget(item!)).toBe(item);
  });

  // Понеділкова картка «Підсумок минулого тижня» крос-модульна: `module:
  // "hub"`. «Повернути в модуль» для неї означало б `openModule("hub")`, який
  // проковтує клік, — тобто той самий дефект, що й був з `action: "reports"`.
  describe("крос-модульна картка (понеділковий підсумок)", () => {
    const digestRec = rec({
      id: "weekly_digest_2026-04-20",
      module: "hub",
      priority: 92,
      action: Recommendations.WEEK_REPORT_ACTION,
    });

    it("зі звітом тижня на екрані дає open_week_report, а не відкриття модуля", () => {
      const [item] = mergeNowItems([digestRec], []);
      expect(item?.action).toEqual({ kind: "open_week_report" });
    });

    it("коли блоку «Порада й тиждень» немає, веде у вкладку «Звіти», а не в неіснуючий модуль", () => {
      const [item] = mergeNowItems([digestRec], []);
      expect(withoutWeekReportTarget(item!).action).toEqual({
        kind: "navigate",
        path: HUB_REPORTS_PATH,
      });
      expect(HUB_REPORTS_PATH).toBe("/?tab=reports");
    });
  });
});
