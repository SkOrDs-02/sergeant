// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateRecommendations } from "./recommendationEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLS(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearAll() {
  localStorage.clear();
}

// ---------------------------------------------------------------------------
// generateRecommendations – structural guarantees
// ---------------------------------------------------------------------------

describe("generateRecommendations", () => {
  beforeEach(clearAll);
  afterEach(() => {
    clearAll();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Basic contract
  // -----------------------------------------------------------------------

  it("повертає масив навіть при порожньому localStorage", () => {
    const result = generateRecommendations();
    expect(Array.isArray(result)).toBe(true);
  });

  it("кожна рекомендація має обовʼязкові поля", () => {
    const result = generateRecommendations();
    for (const r of result) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("module");
      expect(r).toHaveProperty("icon");
      expect(r).toHaveProperty("title");
      expect(r).toHaveProperty("body");
      expect(r).toHaveProperty("priority");
    }
  });

  it("не дублює id рекомендацій", () => {
    const result = generateRecommendations();
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("повертає рекомендації відсортовані за спаданням priority", () => {
    // Seed data for multiple modules to get several recs
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    setLS("finyk_tx_cache", {
      txs: [{ id: "tx1", amount: -100000, time: ts, description: "Продукти" }],
    });
    setLS("finyk_tx_cats", { tx1: "food" });
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: "food", limit: 500 },
    ]);

    const recs = generateRecommendations();
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1]!.priority).toBeGreaterThanOrEqual(recs[i]!.priority);
    }
  });

  it("дедуплікує id — перша зустріч лишається", () => {
    // This tests the deduplication filter in generateRecommendations
    const result = generateRecommendations();
    const ids = result.map((r) => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  // -----------------------------------------------------------------------
  // Finance (Finyk) — budget over/warn
  // -----------------------------------------------------------------------

  it("виявляє перевищення бюджету", () => {
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    setLS("finyk_tx_cache", {
      txs: [{ id: "tx1", amount: -100000, time: ts, description: "Продукти" }],
    });
    setLS("finyk_tx_cats", { tx1: "food" });
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: "food", limit: 500 },
    ]);

    const recs = generateRecommendations();
    const budgetRec = recs.find((r) => r.id === "budget_over_food");
    expect(budgetRec).toBeDefined();
    expect(budgetRec!.module).toBe("finyk");
    expect(budgetRec!.priority).toBeGreaterThanOrEqual(80);
    expect(budgetRec!.severity).toBe("danger");
  });

  it("показує попередження якщо бюджет майже вичерпано (90%+)", () => {
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    setLS("finyk_tx_cache", {
      txs: [{ id: "tx2", amount: -95000, time: ts, description: "Кафе" }],
    });
    setLS("finyk_tx_cats", { tx2: "cafe" });
    setLS("finyk_budgets", [
      { id: "b2", type: "limit", categoryId: "cafe", limit: 1000 },
    ]);

    const recs = generateRecommendations();
    const warnRec = recs.find(
      (r) => r.id === "budget_warn_cafe" || r.id === "budget_over_cafe",
    );
    expect(warnRec).toBeDefined();
    expect(warnRec!.severity).toBe("warning");
  });

  it("враховує txSplits при обчисленні бюджетних витрат", () => {
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    setLS("finyk_tx_cache", {
      txs: [{ id: "tx_s", amount: -20000, time: ts, description: "Магазин" }],
    });
    setLS("finyk_tx_cats", { tx_s: "food" });
    setLS("finyk_tx_splits", {
      tx_s: [
        { categoryId: "smoking", amount: 120 },
        { categoryId: "food", amount: 80 },
      ],
    });
    setLS("finyk_budgets", [
      { id: "b_s", type: "limit", categoryId: "smoking", limit: 100 },
    ]);

    const recs = generateRecommendations();
    const overRec = recs.find((r) => r.id === "budget_over_smoking");
    expect(overRec).toBeDefined();
    expect(overRec!.title).toContain("перевищено");
    expect(overRec!.severity).toBe("danger");
  });

  it("не генерує бюджетні рекомендації коли ліміт = 0 або відсутній categoryId", () => {
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: null, limit: 100 },
      { id: "b2", type: "limit", categoryId: "food", limit: 0 },
    ]);
    setLS("finyk_tx_cache", {
      txs: [
        {
          id: "tx1",
          amount: -50000,
          time: Math.floor(Date.now() / 1000),
          description: "Їжа",
        },
      ],
    });
    setLS("finyk_tx_cats", { tx1: "food" });

    const recs = generateRecommendations();
    const budgetRecs = recs.filter(
      (r) => r.id.startsWith("budget_over_") || r.id.startsWith("budget_warn_"),
    );
    expect(budgetRecs).toHaveLength(0);
  });

  it("не генерує бюджетних рекомендацій якщо витрати менші за 90% ліміту", () => {
    const ts = Math.floor(Date.now() / 1000);
    setLS("finyk_tx_cache", {
      txs: [{ id: "tx1", amount: -10000, time: ts, description: "Кафе" }],
    });
    setLS("finyk_tx_cats", { tx1: "cafe" });
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: "cafe", limit: 5000 },
    ]);

    const recs = generateRecommendations();
    const budgetRecs = recs.filter(
      (r) => r.id.startsWith("budget_over_") || r.id.startsWith("budget_warn_"),
    );
    expect(budgetRecs).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Fizruk — workout recs
  // -----------------------------------------------------------------------

  it("генерує рекомендацію про тренування якщо більше 5 днів без тренувань", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    setLS("fizruk_workouts_v1", {
      schemaVersion: 1,
      workouts: [
        {
          id: "w1",
          startedAt: oldDate.toISOString(),
          endedAt: new Date(oldDate.getTime() + 3600000).toISOString(),
          items: [],
        },
      ],
    });

    const recs = generateRecommendations();
    const fitnessRec = recs.find((r) => r.id === "fizruk_long_break");
    expect(fitnessRec).toBeDefined();
    expect(fitnessRec!.module).toBe("fizruk");
    expect(fitnessRec!.priority).toBe(85);
    expect(fitnessRec!.title).toContain("днів без тренування");
  });

  it("не показує fizruk_long_break якщо тренувались менше 5 днів тому", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 2);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: recent.toISOString(),
        endedAt: new Date(recent.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_long_break")).toBeUndefined();
  });

  it("визначає мʼязові групи за назвою вправи (regex)", () => {
    const old = new Date();
    old.setDate(old.getDate() - 12);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        endedAt: new Date(old.getTime() + 3600000).toISOString(),
        items: [{ nameUk: "Жим лежачи" }, { nameUk: "Присідання зі штангою" }],
      },
    ]);

    const recs = generateRecommendations();
    // 12 days ≥ STALE_DAYS(8) → muscle recs for chest and legs
    const chestRec = recs.find((r) => r.id === "fizruk_muscle_chest");
    const legsRec = recs.find((r) => r.id === "fizruk_muscle_legs");
    expect(chestRec).toBeDefined();
    expect(chestRec!.title).toContain("Груди");
    expect(legsRec).toBeDefined();
    expect(legsRec!.title).toContain("Ноги");
  });

  it("визначає мʼязи через muscleGroups поле вправи", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        endedAt: new Date(old.getTime() + 3600000).toISOString(),
        items: [{ name: "Custom Ex", muscleGroups: ["glutes", "hamstrings"] }],
      },
    ]);

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_muscle_glutes")).toBeDefined();
    expect(recs.find((r) => r.id === "fizruk_muscle_hamstrings")).toBeDefined();
  });

  it("не генерує мʼязові рекомендації для нещодавно тренованих мʼязів", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: recent.toISOString(),
        endedAt: new Date(recent.getTime() + 3600000).toISOString(),
        items: [{ nameUk: "Жим лежачи" }],
      },
    ]);

    const recs = generateRecommendations();
    // 3 days < STALE_DAYS(8) → no muscle stale rec
    expect(recs.find((r) => r.id === "fizruk_muscle_chest")).toBeUndefined();
  });

  it("генерує fizruk_no_week_workout у середині тижня без тренувань", () => {
    // Force a Wednesday or later date
    vi.useFakeTimers();
    // Wednesday 2026-04-29 15:00 UTC
    vi.setSystemTime(new Date("2026-04-29T15:00:00Z"));

    const old = new Date("2026-04-18T10:00:00Z"); // > 5 days ago
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        endedAt: new Date(old.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_no_week_workout")).toBeDefined();
  });

  it("НЕ генерує fizruk_no_week_workout на початку тижня (пн/вт)", () => {
    vi.useFakeTimers();
    // Monday 2026-04-27 10:00 UTC
    vi.setSystemTime(new Date("2026-04-27T10:00:00Z"));

    const old = new Date("2026-04-18T10:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        endedAt: new Date(old.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_no_week_workout")).toBeUndefined();
  });

  it("не генерує fizruk рекомендацій при порожніх тренуваннях", () => {
    setLS("fizruk_workouts_v1", []);
    const recs = generateRecommendations();
    const fizrukRecs = recs.filter((r) => r.module === "fizruk");
    expect(fizrukRecs).toHaveLength(0);
  });

  it("ігнорує незавершені тренування (без endedAt)", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        // no endedAt
        items: [{ nameUk: "Присідання" }],
      },
    ]);

    const recs = generateRecommendations();
    const fizrukRecs = recs.filter((r) => r.module === "fizruk");
    expect(fizrukRecs).toHaveLength(0);
  });

  it("parseFizrukWorkouts обробляє формат масиву напряму", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    // Direct array (not wrapped in { workouts: [...] })
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: old.toISOString(),
        endedAt: new Date(old.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_long_break")).toBeDefined();
  });

  it("parseFizrukWorkouts обробляє обгорнутий формат { workouts: […] }", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    setLS("fizruk_workouts_v1", {
      workouts: [
        {
          id: "w1",
          startedAt: old.toISOString(),
          endedAt: new Date(old.getTime() + 3600000).toISOString(),
          items: [],
        },
      ],
    });

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "fizruk_long_break")).toBeDefined();
  });

  it("parseFizrukWorkouts повертає [] при невалідному JSON", () => {
    localStorage.setItem("fizruk_workouts_v1", "not-json{");
    const recs = generateRecommendations();
    const fizrukRecs = recs.filter((r) => r.module === "fizruk");
    expect(fizrukRecs).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Routine — habits & streaks
  // -----------------------------------------------------------------------

  it("не генерує routine рекомендацій при порожньому стані", () => {
    const recs = generateRecommendations();
    const routineRecs = recs.filter((r) => r.module === "routine");
    expect(routineRecs).toHaveLength(0);
  });

  it("не генерує routine рекомендацій якщо немає звичок", () => {
    setLS("hub_routine_v1", { habits: [], completions: {} });
    const recs = generateRecommendations();
    const routineRecs = recs.filter((r) => r.module === "routine");
    expect(routineRecs).toHaveLength(0);
  });

  it("не рахує архівовані звички", () => {
    setLS("hub_routine_v1", {
      habits: [{ id: "h1", archived: true }],
      completions: {},
    });
    const recs = generateRecommendations();
    const routineRecs = recs.filter((r) => r.module === "routine");
    expect(routineRecs).toHaveLength(0);
  });

  it("генерує streak milestone рекомендацію для 7-денної серії", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    // 7 days streak: yesterday through 7 days ago (all complete)
    completions["h1"] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date("2026-04-27T12:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    const streakRec = recs.find((r) => r.id === "routine_streak_7");
    expect(streakRec).toBeDefined();
    expect(streakRec!.title).toContain("7 днів поспіль");
    expect(streakRec!.priority).toBe(80);
  });

  it("генерує milestone для 3-денної серії", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date("2026-04-27T12:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "routine_streak_3")).toBeDefined();
  });

  it("НЕ генерує milestone якщо серія не на спеціальному значенні (напр. 5)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date("2026-04-27T12:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    // 5 is not in MILESTONE_STREAKS [3,7,14,30,60,100]
    expect(recs.find((r) => r.id === "routine_streak_5")).toBeUndefined();
  });

  it("генерує вечірнє нагадування про незавершені звички після 18:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T19:00:00Z"));

    const today = "2026-04-27";
    setLS("hub_routine_v1", {
      habits: [{ id: "h1" }, { id: "h2" }],
      completions: { h1: [today] },
    });

    const recs = generateRecommendations();
    const eveningRec = recs.find((r) => r.id === "routine_evening_reminder");
    expect(eveningRec).toBeDefined();
    expect(eveningRec!.title).toContain("1 звичок ще не виконано");
    expect(eveningRec!.priority).toBe(65);
  });

  it("НЕ генерує вечірнє нагадування до 18:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T14:00:00Z"));

    const today = "2026-04-27";
    setLS("hub_routine_v1", {
      habits: [{ id: "h1" }, { id: "h2" }],
      completions: { h1: [today] },
    });

    const recs = generateRecommendations();
    expect(
      recs.find((r) => r.id === "routine_evening_reminder"),
    ).toBeUndefined();
  });

  it("генерує streak_at_risk після 21:00 при серії 7+ і незавершених звичках", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T22:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    // 7-day streak — today NOT completed → streak at risk
    for (let i = 1; i <= 7; i++) {
      const d = new Date("2026-04-27T22:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    const atRisk = recs.find((r) => r.id === "routine_streak_at_risk");
    expect(atRisk).toBeDefined();
    expect(atRisk!.priority).toBe(95);
    expect(atRisk!.title).toContain("під загрозою");
  });

  it("routine_streak_at_risk використовує правильну форму множини для 1 звички", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T22:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date("2026-04-27T22:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    const atRisk = recs.find((r) => r.id === "routine_streak_at_risk");
    expect(atRisk).toBeDefined();
    // remaining === 1 → "звичка" (singular)
    expect(atRisk!.body).toContain("1 звичка");
  });

  it("routine_streak_at_risk використовує множину для >1 звичок", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T22:00:00Z"));

    const habits = [{ id: "h1" }, { id: "h2" }, { id: "h3" }];
    const completions: Record<string, string[]> = {};
    for (const h of habits) {
      completions[h.id] = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date("2026-04-27T22:00:00Z");
        d.setDate(d.getDate() - i);
        const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        completions[h.id]!.push(dk);
      }
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    const atRisk = recs.find((r) => r.id === "routine_streak_at_risk");
    expect(atRisk).toBeDefined();
    // remaining === 3 → "звичок" (plural)
    expect(atRisk!.body).toContain("3 звичок");
  });

  it("НЕ генерує streak_at_risk якщо серія < 7 днів", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T22:00:00Z"));

    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date("2026-04-27T22:00:00Z");
      d.setDate(d.getDate() - i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }

    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "routine_streak_at_risk")).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Nutrition
  // -----------------------------------------------------------------------

  it("генерує nutrition_no_meals_today після 13:00 якщо немає записів", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T15:00:00Z"));

    setLS("nutrition_log_v1", {});

    const recs = generateRecommendations();
    const noMeals = recs.find((r) => r.id === "nutrition_no_meals_today");
    expect(noMeals).toBeDefined();
    expect(noMeals!.module).toBe("nutrition");
    expect(noMeals!.pwaAction).toBe("add_meal");
  });

  it("НЕ генерує nutrition_no_meals_today до 13:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:00:00Z"));

    setLS("nutrition_log_v1", {});

    const recs = generateRecommendations();
    expect(
      recs.find((r) => r.id === "nutrition_no_meals_today"),
    ).toBeUndefined();
  });

  it("генерує nutrition_kcal_low якщо калорії < 50% після 18:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T19:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 400, protein_g: 30 } }],
      },
    });
    setLS("nutrition_prefs_v1", { dailyTargetKcal: 2000 });

    const recs = generateRecommendations();
    const kcalLow = recs.find((r) => r.id === "nutrition_kcal_low");
    expect(kcalLow).toBeDefined();
    expect(kcalLow!.title).toContain("400");
    expect(kcalLow!.title).toContain("2000");
  });

  it("НЕ генерує nutrition_kcal_low до 18:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T14:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 400, protein_g: 30 } }],
      },
    });

    const recs = generateRecommendations();
    expect(recs.find((r) => r.id === "nutrition_kcal_low")).toBeUndefined();
  });

  it("генерує nutrition_protein_low якщо білок < 60% після 16:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T17:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 1500, protein_g: 40 } }],
      },
    });
    setLS("nutrition_prefs_v1", {
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
    });

    const recs = generateRecommendations();
    const proteinLow = recs.find((r) => r.id === "nutrition_protein_low");
    expect(proteinLow).toBeDefined();
    expect(proteinLow!.title).toContain("40г білка");
  });

  it("генерує nutrition_post_workout_protein після тренування з низьким білком", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T17:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 500, protein_g: 20 } }],
      },
    });
    setLS("nutrition_prefs_v1", {
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
    });
    // Recent workout (1 hour ago)
    const recentWorkout = new Date("2026-04-27T16:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: recentWorkout.toISOString(),
        endedAt: new Date(recentWorkout.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    const postWorkout = recs.find(
      (r) => r.id === "nutrition_post_workout_protein",
    );
    expect(postWorkout).toBeDefined();
    expect(postWorkout!.priority).toBe(88);
  });

  it("НЕ генерує nutrition_post_workout_protein якщо тренування було давно", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T17:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 500, protein_g: 20 } }],
      },
    });
    setLS("nutrition_prefs_v1", {
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
    });
    // Old workout (5 hours ago → > 2 threshold)
    const oldWorkout = new Date("2026-04-27T12:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: oldWorkout.toISOString(),
        endedAt: new Date(oldWorkout.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(
      recs.find((r) => r.id === "nutrition_post_workout_protein"),
    ).toBeUndefined();
  });

  it("використовує fallback значення при відсутності nutrition_prefs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T19:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 400, protein_g: 20 } }],
      },
    });
    // No prefs → fallback to 2000 kcal / 120g protein

    const recs = generateRecommendations();
    const kcalLow = recs.find((r) => r.id === "nutrition_kcal_low");
    expect(kcalLow).toBeDefined();
    expect(kcalLow!.title).toContain("2000"); // default target
  });

  it("підтримує dailyTargetProtein (без _g) як fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T17:00:00Z"));

    const today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 1500, protein_g: 30 } }],
      },
    });
    setLS("nutrition_prefs_v1", {
      dailyTargetKcal: 2000,
      dailyTargetProtein: 80,
    });

    const recs = generateRecommendations();
    const proteinLow = recs.find((r) => r.id === "nutrition_protein_low");
    expect(proteinLow).toBeDefined();
    expect(proteinLow!.title).toContain("80г"); // uses dailyTargetProtein
  });

  it("обробляє порожні/null macros", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T19:00:00Z"));

    const _today = "2026-04-27";
    setLS("nutrition_log_v1", {
      [_today]: {
        meals: [{ macros: null }, { macros: {} }, {}],
      },
    });

    const recs = generateRecommendations();
    // Should handle gracefully; kcal = 0, might show kcal_low or no_meals
    expect(Array.isArray(recs)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Weekly digest
  // -----------------------------------------------------------------------

  it("генерує weekly_digest у понеділок 7-12 якщо є дані за минулий тиждень", () => {
    vi.useFakeTimers();
    // Monday 2026-04-27 09:00 UTC
    vi.setSystemTime(new Date("2026-04-27T09:00:00Z"));

    // Workout last week (Monday-Sunday: Apr 20-26)
    const lastWeek = new Date("2026-04-23T10:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: lastWeek.toISOString(),
        endedAt: new Date(lastWeek.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    const digest = recs.find((r) => r.id?.startsWith("weekly_digest_"));
    expect(digest).toBeDefined();
    expect(digest!.title).toBe("Підсумок минулого тижня");
    expect(digest!.priority).toBe(92);
    expect(digest!.body).toContain("1 трен.");
  });

  it("НЕ генерує weekly_digest у вівторок", () => {
    vi.useFakeTimers();
    // Tuesday 2026-04-28 09:00 UTC
    vi.setSystemTime(new Date("2026-04-28T09:00:00Z"));

    const lastWeek = new Date("2026-04-23T10:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: lastWeek.toISOString(),
        endedAt: new Date(lastWeek.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(
      recs.find((r) => r.id?.startsWith("weekly_digest_")),
    ).toBeUndefined();
  });

  it("НЕ генерує weekly_digest у понеділок після 12:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T14:00:00Z"));

    const lastWeek = new Date("2026-04-23T10:00:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: lastWeek.toISOString(),
        endedAt: new Date(lastWeek.getTime() + 3600000).toISOString(),
        items: [],
      },
    ]);

    const recs = generateRecommendations();
    expect(
      recs.find((r) => r.id?.startsWith("weekly_digest_")),
    ).toBeUndefined();
  });

  it("weekly_digest включає витрати та звички", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T09:00:00Z"));

    // Mon prev = Apr 20, Sun prev = Apr 26 23:59:59
    const txTime = Math.floor(
      new Date("2026-04-22T12:00:00Z").getTime() / 1000,
    );
    setLS("finyk_tx_cache", {
      txs: [
        { id: "tx1", amount: -500000, time: txTime, description: "Покупки" },
      ],
    });
    setLS("finyk_tx_cats", { tx1: "shopping" });

    // Habits: 1 habit, completed all 7 days of last week
    const habits = [{ id: "h1" }];
    const completions: Record<string, string[]> = {};
    completions["h1"] = [];
    for (let i = 0; i < 7; i++) {
      const _d = new Date("2026-04-20T12:00:00Z");
      _d.setDate(_d.getDate() + i);
      const dk = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
      completions["h1"].push(dk);
    }
    setLS("hub_routine_v1", { habits, completions });

    const recs = generateRecommendations();
    const digest = recs.find((r) => r.id?.startsWith("weekly_digest_"));
    expect(digest).toBeDefined();
    expect(digest!.body).toContain("₴"); // spending
    expect(digest!.body).toContain("звички"); // habits
  });

  // -----------------------------------------------------------------------
  // Edge cases — corrupt/partial localStorage
  // -----------------------------------------------------------------------

  it("обробляє пошкоджений JSON у localStorage gracefully", () => {
    localStorage.setItem("finyk_tx_cache", "{{not json}}");
    localStorage.setItem("hub_routine_v1", "nope");
    localStorage.setItem("nutrition_log_v1", "broken");

    const recs = generateRecommendations();
    expect(Array.isArray(recs)).toBe(true);
  });

  it("обробляє порожній масив транзакцій", () => {
    setLS("finyk_tx_cache", { txs: [] });
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: "food", limit: 1000 },
    ]);

    const recs = generateRecommendations();
    const budgetRecs = recs.filter(
      (r) => r.id.startsWith("budget_over_") || r.id.startsWith("budget_warn_"),
    );
    expect(budgetRecs).toHaveLength(0);
  });

  it("обробляє finyk_tx_cache як масив напряму (не обгорнутий об'єкт)", () => {
    const ts = Math.floor(Date.now() / 1000);
    // Direct array format
    setLS("finyk_tx_cache", [
      { id: "tx1", amount: -200000, time: ts, description: "Покупки" },
    ]);
    setLS("finyk_tx_cats", { tx1: "food" });
    setLS("finyk_budgets", [
      { id: "b1", type: "limit", categoryId: "food", limit: 1000 },
    ]);

    const recs = generateRecommendations();
    const budgetRec = recs.find((r) => r.id === "budget_over_food");
    expect(budgetRec).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Cross-module interaction
  // -----------------------------------------------------------------------

  it("крос-модульний: fizruk+nutrition → post_workout_protein", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T17:00:00Z"));

    const today = "2026-04-27";
    // Low protein
    setLS("nutrition_log_v1", {
      [today]: {
        meals: [{ macros: { kcal: 500, protein_g: 10 } }],
      },
    });
    setLS("nutrition_prefs_v1", {
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
    });

    // Recent workout 30 min ago
    const recentWorkout = new Date("2026-04-27T16:30:00Z");
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: recentWorkout.toISOString(),
        endedAt: new Date(recentWorkout.getTime() + 1800000).toISOString(),
        items: [{ nameUk: "Присідання зі штангою" }],
      },
    ]);

    const recs = generateRecommendations();
    const post = recs.find((r) => r.id === "nutrition_post_workout_protein");
    expect(post).toBeDefined();
    expect(post!.module).toBe("nutrition");
    expect(post!.priority).toBe(88);
  });

  // -----------------------------------------------------------------------
  // safeLS resilience
  // -----------------------------------------------------------------------

  it("safeLS повертає fallback при null localStorage", () => {
    // getItem returns null for missing keys
    const recs = generateRecommendations();
    expect(Array.isArray(recs)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Muscle label i18n
  // -----------------------------------------------------------------------

  it("мʼязові рекомендації використовують українські назви", () => {
    const oldW = new Date();
    oldW.setDate(oldW.getDate() - 12);
    setLS("fizruk_workouts_v1", [
      {
        id: "w1",
        startedAt: oldW.toISOString(),
        endedAt: new Date(oldW.getTime() + 3600000).toISOString(),
        items: [
          { nameUk: "Тяга верхнього блоку" },
          { nameUk: "Підйом на біцепс" },
          { nameUk: "Розгинання на триципс" },
          { nameUk: "Планка" },
          { nameUk: "Розведення гантелей на плечей" },
        ],
      },
    ]);

    const recs = generateRecommendations();
    const labels = recs
      .filter((r) => r.id.startsWith("fizruk_muscle_"))
      .map((r) => r.title);

    // Verify Ukrainian labels are used
    const allLabels = labels.join(" ");
    expect(allLabels).toMatch(/Спина|Біцепс|Триципс|Прес|Плечі/);
  });
});
