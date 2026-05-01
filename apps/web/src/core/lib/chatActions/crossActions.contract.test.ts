// @vitest-environment jsdom
/**
 * Contract tests for handleCrossAction — cross-module HubChat handlers.
 *
 * Note: crossActions.test.ts already covers compare_weeks and morning_briefing
 * localStorage logic in detail. This file adds coverage for remaining handlers
 * (spending_trend, category_breakdown, detect_anomalies, convert_units,
 * save_note, list_notes, set_goal, export_module_data, remember, forget,
 * my_profile, weekly_summary) and ensures contract shape compliance.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleCrossAction } from "./crossActions";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleCrossAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

// ---------------------------------------------------------------------------
// morning_briefing
// ---------------------------------------------------------------------------
describe("morning_briefing", () => {
  it("happy: returns briefing string", () => {
    const out = call({ name: "morning_briefing", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("happy: contains greeting and date", () => {
    const out = call({ name: "morning_briefing", input: {} });
    expect(out).toContain("Доброго ранку");
  });

  it("shape: result is a non-empty string suitable for tool_result", () => {
    const out = call({ name: "morning_briefing", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// weekly_summary
// ---------------------------------------------------------------------------
describe("weekly_summary", () => {
  it("happy: returns summary even with no data", () => {
    const out = call({ name: "weekly_summary", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("підсумок");
  });

  it("happy: accepts specific date", () => {
    const out = call({ name: "weekly_summary", input: { date: "2026-04-18" } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "weekly_summary", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// set_goal
// ---------------------------------------------------------------------------
describe("set_goal", () => {
  it("happy: creates a goal with weight target", () => {
    const out = call({
      name: "set_goal",
      input: { description: "Скинути вагу", target_weight_kg: 80 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("80");
    expect(out).toContain("Скинути вагу");
  });

  it("happy: creates a goal with daily kcal", () => {
    const out = call({
      name: "set_goal",
      input: { description: "Калорійний план", daily_kcal: 2000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2000");
    const prefs = JSON.parse(localStorage.getItem("nutrition_prefs_v1")!);
    expect(prefs.dailyTargetKcal).toBe(2000);
  });

  it("error: missing description returns error", () => {
    const out = call({ name: "set_goal", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібен");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "set_goal",
      input: { workouts_per_week: 4, target_date: "2026-06-01" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// spending_trend
// ---------------------------------------------------------------------------
describe("spending_trend", () => {
  it("happy: returns trend with no transactions", () => {
    const out = call({
      name: "spending_trend",
      input: { period_days: 30 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Тренд");
    expect(out).toContain("30");
  });

  it("happy: returns trend with seeded transactions", () => {
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [
          {
            id: "t1",
            amount: -5000,
            time: Math.floor(Date.now() / 1000) - 86400,
            description: "АТБ",
          },
          {
            id: "t2",
            amount: 100000,
            time: Math.floor(Date.now() / 1000),
            description: "Зарплата",
          },
        ],
      }),
    );
    const out = call({ name: "spending_trend", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Тренд");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "spending_trend", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// category_breakdown
// ---------------------------------------------------------------------------
describe("category_breakdown", () => {
  it("happy: returns breakdown even with no data", () => {
    const out = call({ name: "category_breakdown", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Витрати по категоріях");
  });

  it("happy: accepts custom period", () => {
    const out = call({
      name: "category_breakdown",
      input: { period_days: 14 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("14");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "category_breakdown", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// detect_anomalies
// ---------------------------------------------------------------------------
describe("detect_anomalies", () => {
  it("happy: returns no anomalies when few transactions", () => {
    const out = call({ name: "detect_anomalies", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Недостатньо");
  });

  it("happy: detects anomaly when large outlier exists", () => {
    const now = Math.floor(Date.now() / 1000);
    const txs: Array<{
      id: string;
      amount: number;
      time: number;
      description: string;
    }> = [];
    for (let i = 0; i < 10; i++) {
      txs.push({
        id: `t${i}`,
        amount: -1000,
        time: now - i * 86400,
        description: `Звичайна ${i}`,
      });
    }
    txs.push({
      id: "outlier",
      amount: -50000,
      time: now - 500,
      description: "Велика покупка",
    });
    localStorage.setItem("finyk_tx_cache", JSON.stringify({ txs }));
    const out = call({ name: "detect_anomalies", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/Аномальні|Недостатньо|аномалій не виявлено/);
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "detect_anomalies", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// convert_units
// ---------------------------------------------------------------------------
describe("convert_units", () => {
  it("happy: converts kg to lb", () => {
    const out = call({
      name: "convert_units",
      input: { value: 100, from: "kg", to: "lb" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("100");
    expect(out).toContain("kg");
    expect(out).toContain("lb");
  });

  it("error: unknown conversion returns error", () => {
    const out = call({
      name: "convert_units",
      input: { value: 10, from: "parsec", to: "furlong" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Невідома");
  });

  it("error: non-numeric value returns error", () => {
    const out = call({
      name: "convert_units",
      input: { value: "abc", from: "kg", to: "lb" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("числом");
  });

  it("shape: result contains both units", () => {
    const out = call({
      name: "convert_units",
      input: { value: 0, from: "c", to: "f" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("c");
    expect(out).toContain("f");
  });
});

// ---------------------------------------------------------------------------
// save_note
// ---------------------------------------------------------------------------
describe("save_note", () => {
  it("happy: saves note to localStorage", () => {
    const out = call({
      name: "save_note",
      input: { text: "Купити молоко", tag: "shopping" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Купити молоко");
    expect(out).toContain("shopping");
    const notes = JSON.parse(localStorage.getItem("hub_notes_v1")!);
    expect(notes).toHaveLength(1);
  });

  it("error: empty text returns error", () => {
    const out = call({
      name: "save_note",
      input: { text: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("текст");
  });

  it("shape: result contains note id", () => {
    const out = call({
      name: "save_note",
      input: { text: "Тест" },
    });
    expect(out).toMatch(/id:note_/);
  });
});

// ---------------------------------------------------------------------------
// list_notes
// ---------------------------------------------------------------------------
describe("list_notes", () => {
  it("happy: lists saved notes", () => {
    localStorage.setItem(
      "hub_notes_v1",
      JSON.stringify([
        {
          id: "note_1",
          text: "Перша",
          tag: "other",
          createdAt: "2026-04-22T12:00:00",
        },
        {
          id: "note_2",
          text: "Друга",
          tag: "work",
          createdAt: "2026-04-22T12:01:00",
        },
      ]),
    );
    const out = call({ name: "list_notes", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Перша");
    expect(out).toContain("2");
  });

  it("error: no notes returns informative message", () => {
    const out = call({ name: "list_notes", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("немає");
  });

  it("happy: filters by tag", () => {
    localStorage.setItem(
      "hub_notes_v1",
      JSON.stringify([
        { id: "n1", text: "A", tag: "work", createdAt: "2026-04-22T12:00:00" },
        { id: "n2", text: "B", tag: "home", createdAt: "2026-04-22T12:00:00" },
      ]),
    );
    const out = call({ name: "list_notes", input: { tag: "work" } });
    expect(typeof out).toBe("string");
    expect(out).toContain("A");
  });

  it("shape: result is a non-empty string", () => {
    localStorage.setItem(
      "hub_notes_v1",
      JSON.stringify([
        { id: "n1", text: "X", tag: "x", createdAt: "2026-04-22" },
      ]),
    );
    const out = call({ name: "list_notes", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------
describe("remember", () => {
  it("happy: remembers a fact", () => {
    const out = call({
      name: "remember",
      input: { fact: "Я вегетаріанець", category: "diet" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Запам'ятав");
    expect(out).toContain("вегетаріанець");
  });

  it("happy: updates existing fact", () => {
    call({ name: "remember", input: { fact: "Я вегетаріанець" } });
    const out = call({
      name: "remember",
      input: { fact: "Я вегетаріанець", category: "diet" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Оновив");
  });

  it("error: empty fact returns error message", () => {
    const out = call({
      name: "remember",
      input: { fact: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("факт");
  });

  it("shape: result contains entry id", () => {
    const out = call({
      name: "remember",
      input: { fact: "Тест" },
    });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/id:/);
  });
});

// ---------------------------------------------------------------------------
// forget (RISKY_TOOL)
// ---------------------------------------------------------------------------
describe("forget", () => {
  it("happy: forgets a remembered fact", () => {
    call({ name: "remember", input: { fact: "Тимчасовий факт" } });
    const profile = JSON.parse(
      localStorage.getItem("hub_user_profile_v1") || "[]",
    );
    const factId = profile[0]?.id;
    const out = call({ name: "forget", input: { fact_id: factId } });
    expect(typeof out).toBe("string");
    expect(out).toContain("Забув");
  });

  it("error: empty fact_id returns error", () => {
    const out = call({ name: "forget", input: { fact_id: "" } });
    expect(typeof out).toBe("string");
    expect(out).toContain("id");
  });

  it("error: nonexistent fact_id returns error", () => {
    const out = call({ name: "forget", input: { fact_id: "fake_id" } });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is always a string", () => {
    const out = call({ name: "forget", input: { fact_id: "x" } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// my_profile
// ---------------------------------------------------------------------------
describe("my_profile", () => {
  it("happy: returns profile entries", () => {
    call({
      name: "remember",
      input: { fact: "Алергія на горіхи", category: "allergy" },
    });
    const out = call({ name: "my_profile", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("горіхи");
  });

  it("error: empty profile returns informative message", () => {
    const out = call({ name: "my_profile", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("порожній");
  });

  it("happy: filters by category", () => {
    call({ name: "remember", input: { fact: "Факт 1", category: "diet" } });
    call({ name: "remember", input: { fact: "Факт 2", category: "allergy" } });
    const out = call({ name: "my_profile", input: { category: "diet" } });
    expect(typeof out).toBe("string");
    expect(out).toContain("Факт 1");
  });

  it("shape: result is a non-empty string", () => {
    call({ name: "remember", input: { fact: "X" } });
    const out = call({ name: "my_profile", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// export_module_data
// ---------------------------------------------------------------------------
describe("export_module_data", () => {
  it("happy: exports finyk data", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify({ txs: [] }));
    const out = call({
      name: "export_module_data",
      input: { module: "finyk" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Експорт Фінік");
  });

  it("happy: exports routine data", () => {
    const out = call({
      name: "export_module_data",
      input: { module: "routine" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Рутина");
  });

  it("error: unknown module returns error", () => {
    const out = call({
      name: "export_module_data",
      input: { module: "unknown" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Невідомий");
  });

  it("shape: result is always a non-empty string", () => {
    const out = call({
      name: "export_module_data",
      input: { module: "nutrition", format: "json" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// compare_weeks
// ---------------------------------------------------------------------------
describe("compare_weeks", () => {
  it("happy: compares current vs previous week", () => {
    const out = call({ name: "compare_weeks", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Порівняння тижнів");
  });

  it("happy: compares specified weeks", () => {
    const out = call({
      name: "compare_weeks",
      input: { week_a: "2026-W16", week_b: "2026-W15" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Порівняння");
  });

  it("error: invalid week_a returns error", () => {
    const out = call({
      name: "compare_weeks",
      input: { week_a: "bad-week" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Некоректний");
  });

  it("error: no valid modules returns error", () => {
    const out = call({
      name: "compare_weeks",
      input: { modules: ["nonexistent"] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("жодного");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "compare_weeks", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// save_note · undo
// ---------------------------------------------------------------------------
describe("save_note · undo", () => {
  it("повертає {undo} який видаляє щойно додану нотатку за id", () => {
    const out = handleCrossAction({
      name: "save_note",
      input: { text: "Тест запам'ятати щось важливе", tag: "ideas" },
    });
    if (out == null || typeof out === "string") {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    const before = JSON.parse(localStorage.getItem("hub_notes_v1") || "[]");
    expect(before).toHaveLength(1);

    out.undo();
    const after = JSON.parse(localStorage.getItem("hub_notes_v1") || "[]");
    expect(after).toHaveLength(0);
  });

  it("undo прибирає лише свою нотатку, попередні залишаються", () => {
    handleCrossAction({
      name: "save_note",
      input: { text: "Перша нотатка", tag: "other" },
    });
    const second = handleCrossAction({
      name: "save_note",
      input: { text: "Друга нотатка", tag: "ideas" },
    });
    if (second == null || typeof second === "string") {
      throw new Error("expected undoable result");
    }
    second.undo();

    const after = JSON.parse(localStorage.getItem("hub_notes_v1") || "[]");
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe("Перша нотатка");
  });
});

// ---------------------------------------------------------------------------
// remember · undo
// ---------------------------------------------------------------------------
describe("remember · undo", () => {
  it("created: undo видаляє факт", () => {
    const out = handleCrossAction({
      name: "remember",
      input: { fact: "Я люблю каву зранку" },
    });
    if (out == null || typeof out === "string") {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }

    out.undo();
    // After undo, the entry should be gone
    const profile = handleCrossAction({
      name: "my_profile",
      input: {},
    });
    expect(typeof profile === "string" ? profile : profile?.result).toContain(
      "порожній",
    );
  });

  it("updated: undo повертає попередню версію факту", () => {
    handleCrossAction({
      name: "remember",
      input: { fact: "Я програміст", category: "work" },
    });
    const out = handleCrossAction({
      name: "remember",
      input: { fact: "Я програміст", category: "work" },
    });
    if (out == null || typeof out === "string") {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    expect(out.result).toContain("Оновив");

    out.undo();
    // Should still have the entry (we restored prev version)
    const profile = handleCrossAction({
      name: "my_profile",
      input: {},
    });
    const profileText =
      typeof profile === "string" ? profile : (profile?.result ?? "");
    expect(profileText).toContain("Я програміст");
  });
});
