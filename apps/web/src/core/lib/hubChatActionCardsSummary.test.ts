import { describe, it, expect } from "vitest";
import { summaryFor } from "./hubChatActionCardsSummary";

describe("summaryFor", () => {
  it("create_transaction: amount + description", () => {
    expect(
      summaryFor(
        "create_transaction",
        { amount: 200, description: "Кава" },
        "r",
      ),
    ).toBe("200 ₴ · Кава");
  });
  it("create_transaction: falls back to category_id when no description", () => {
    expect(
      summaryFor(
        "create_transaction",
        { amount: 50, category_id: "food" },
        "r",
      ),
    ).toBe("50 ₴ · food");
  });
  it("create_transaction: numeric string amount coerced", () => {
    expect(summaryFor("create_transaction", { amount: "75" }, "r")).toBe(
      "75 ₴",
    );
  });
  it("create_transaction: empty input falls through to truncated result", () => {
    expect(summaryFor("create_transaction", {}, "result")).toBe("result");
  });

  it("find_transaction: query + amount", () => {
    expect(
      summaryFor("find_transaction", { query: "ATB", amount: 300 }, "r"),
    ).toBe("ATB · 300 ₴");
  });
  it("find_transaction: query only", () => {
    expect(summaryFor("find_transaction", { query: "ATB" }, "r")).toBe("ATB");
  });

  it("batch_categorize: pattern + category", () => {
    expect(
      summaryFor(
        "batch_categorize",
        { pattern: "Uber", category_id: "transport" },
        "r",
      ),
    ).toBe("Uber → transport");
  });
  it("batch_categorize: pattern only", () => {
    expect(summaryFor("batch_categorize", { pattern: "Uber" }, "r")).toBe(
      "Uber",
    );
  });

  it("log_meal: full", () => {
    expect(
      summaryFor(
        "log_meal",
        { meal_type: "сніданок", name: "Омлет", calories: 350 },
        "r",
      ),
    ).toBe("сніданок · Омлет · 350 ккал");
  });

  it("log_water: amount_ml preferred", () => {
    expect(summaryFor("log_water", { amount_ml: 250, amount: 999 }, "r")).toBe(
      "250 мл",
    );
  });
  it("log_water: falls back to amount", () => {
    expect(summaryFor("log_water", { amount: 200 }, "r")).toBe("200 мл");
  });
  it("log_water: no amount falls through", () => {
    expect(summaryFor("log_water", {}, "fallback")).toBe("fallback");
  });

  it("log_set: full with exercise_name", () => {
    expect(
      summaryFor(
        "log_set",
        { exercise_name: "Жим", weight_kg: 80, reps: 5 },
        "r",
      ),
    ).toBe("Жим · 80 кг · 5 повт.");
  });
  it("log_set: weight/weight_kg fallback", () => {
    expect(summaryFor("log_set", { exercise: "Присід", weight: 60 }, "r")).toBe(
      "Присід · 60 кг",
    );
  });

  it("mark_habit_done / create_habit", () => {
    expect(summaryFor("mark_habit_done", { habit_id: "h1" }, "r")).toBe("h1");
    expect(summaryFor("create_habit", { name: "Біг" }, "r")).toBe("Біг");
  });

  it("set_habit_schedule: joins string days", () => {
    expect(
      summaryFor("set_habit_schedule", { days: ["пн", " ", "ср"] }, "r"),
    ).toBe("пн, ср");
  });
  it("set_habit_schedule: empty days falls through", () => {
    expect(summaryFor("set_habit_schedule", { days: [] }, "fb")).toBe("fb");
  });

  it("pause_habit: paused state variants", () => {
    expect(summaryFor("pause_habit", { habit_id: "h1" }, "r")).toBe(
      "h1 · на паузі",
    );
    expect(
      summaryFor("pause_habit", { habit_id: "h1", paused: false }, "r"),
    ).toBe("h1 · знято з паузи");
    expect(summaryFor("pause_habit", { paused: false }, "r")).toBe(
      "знято з паузи",
    );
  });

  it("start_workout", () => {
    expect(summaryFor("start_workout", { program_id: "p1" }, "r")).toBe("p1");
  });

  it("compare_weeks: all branches", () => {
    expect(
      summaryFor("compare_weeks", { week_a: "W1", week_b: "W2" }, "r"),
    ).toBe("W1 vs W2");
    expect(summaryFor("compare_weeks", { week_a: "W1" }, "r")).toBe(
      "W1 vs попередній",
    );
    expect(summaryFor("compare_weeks", { week_b: "W2" }, "r")).toBe(
      "поточний vs W2",
    );
    expect(summaryFor("compare_weeks", {}, "r")).toBe("поточний vs попередній");
  });

  it("change_category", () => {
    expect(
      summaryFor("change_category", { tx_id: "t1", category_id: "c1" }, "r"),
    ).toBe("TX: t1 → c1");
  });
  it("delete_transaction / hide_transaction", () => {
    expect(summaryFor("delete_transaction", { tx_id: "t1" }, "r")).toBe(
      "TX: t1",
    );
    expect(summaryFor("hide_transaction", { tx_id: "t1" }, "r")).toBe("TX: t1");
  });

  it("set_budget_limit / update_budget", () => {
    expect(
      summaryFor("set_budget_limit", { category_id: "food", limit: 5000 }, "r"),
    ).toBe("food · 5000 ₴");
    expect(
      summaryFor(
        "update_budget",
        { category_id: "food", target_amount: 3000 },
        "r",
      ),
    ).toBe("food · 3000 ₴");
  });

  it("set_monthly_plan", () => {
    expect(
      summaryFor(
        "set_monthly_plan",
        { income: 100, expense: 80, savings: 20 },
        "r",
      ),
    ).toBe("Дохід: 100 ₴ · Витрати: 80 ₴ · Заощадження: 20 ₴");
  });

  it("create_debt / create_receivable", () => {
    expect(summaryFor("create_debt", { name: "Банк", amount: 1000 }, "r")).toBe(
      "Банк · 1000 ₴",
    );
    expect(
      summaryFor("create_receivable", { name: "Друг", amount: 500 }, "r"),
    ).toBe("Друг · 500 ₴");
  });

  it("mark_debt_paid", () => {
    expect(
      summaryFor("mark_debt_paid", { debt_id: "d1", amount: 200 }, "r"),
    ).toBe("d1 200 ₴");
  });

  it("add_asset: with custom currency and default", () => {
    expect(
      summaryFor(
        "add_asset",
        { name: "Gold", amount: 5, currency: "USD" },
        "r",
      ),
    ).toBe("Gold · 5 USD");
    expect(summaryFor("add_asset", { name: "Cash", amount: 100 }, "r")).toBe(
      "Cash · 100 UAH",
    );
  });

  it("split_transaction", () => {
    expect(
      summaryFor("split_transaction", { tx_id: "t1", parts: [1, 2, 3] }, "r"),
    ).toBe("TX: t1 → 3 частин");
  });

  it("recurring_expense", () => {
    expect(
      summaryFor("recurring_expense", { name: "Netflix", amount: 200 }, "r"),
    ).toBe("Netflix · 200 ₴");
  });

  it("export_report: default and explicit period", () => {
    expect(summaryFor("export_report", {}, "r")).toBe("Період: month");
    expect(summaryFor("export_report", { period: "year" }, "r")).toBe(
      "Період: year",
    );
  });

  it("create_reminder", () => {
    expect(
      summaryFor("create_reminder", { habit_id: "h1", time: "08:00" }, "r"),
    ).toBe("h1 о 08:00");
  });

  it("complete_habit_for_date: branches", () => {
    expect(
      summaryFor(
        "complete_habit_for_date",
        { habit_id: "h1", date: "2024-01-01" },
        "r",
      ),
    ).toBe("h1 · 2024-01-01 · виконано");
    expect(
      summaryFor(
        "complete_habit_for_date",
        { habit_id: "h1", date: "2024-01-01", completed: false },
        "r",
      ),
    ).toBe("h1 · 2024-01-01 · не виконано");
    expect(summaryFor("complete_habit_for_date", { habit_id: "h1" }, "r")).toBe(
      "h1 · виконано",
    );
  });

  it("archive_habit / edit_habit", () => {
    expect(summaryFor("archive_habit", { habit_id: "h1" }, "r")).toBe("h1");
    expect(summaryFor("edit_habit", { habit_id: "h2" }, "r")).toBe("h2");
  });

  it("add_calendar_event", () => {
    expect(
      summaryFor("add_calendar_event", { name: "ДР", date: "2024-05-01" }, "r"),
    ).toBe("ДР · 2024-05-01");
  });

  it("reorder_habits", () => {
    expect(summaryFor("reorder_habits", { habit_ids: ["a", "b"] }, "r")).toBe(
      "2 звичок",
    );
  });

  it("habit_stats: default period", () => {
    expect(summaryFor("habit_stats", { habit_id: "h1" }, "r")).toBe(
      "h1 · 30 днів",
    );
    expect(
      summaryFor("habit_stats", { habit_id: "h1", period_days: 7 }, "r"),
    ).toBe("h1 · 7 днів");
  });

  it("add_recipe", () => {
    expect(
      summaryFor("add_recipe", { title: "Борщ", time_minutes: 60 }, "r"),
    ).toBe("Борщ · 60 хв");
  });

  it("add_to_shopping_list", () => {
    expect(
      summaryFor(
        "add_to_shopping_list",
        { name: "Молоко", quantity: "2л" },
        "r",
      ),
    ).toBe("Молоко · 2л");
  });

  it("consume_from_pantry", () => {
    expect(summaryFor("consume_from_pantry", { name: "Хліб" }, "r")).toBe(
      "Хліб",
    );
  });

  it("set_daily_plan", () => {
    expect(
      summaryFor("set_daily_plan", { kcal: 2000, protein_g: 150 }, "r"),
    ).toBe("2000 ккал · 150 г білка");
  });

  it("suggest_meal", () => {
    expect(
      summaryFor("suggest_meal", { meal_type: "обід", focus: "білок" }, "r"),
    ).toBe("обід · білок");
  });

  it("copy_meal_from_date / plan_meals_for_day", () => {
    expect(
      summaryFor(
        "copy_meal_from_date",
        { source_date: "2024-01-01", target_kcal: 1800 },
        "r",
      ),
    ).toBe("2024-01-01 · 1800 ккал");
    expect(summaryFor("plan_meals_for_day", { target_kcal: 1800 }, "r")).toBe(
      "1800 ккал",
    );
  });

  it("plan_workout: with date, exercises and default time", () => {
    expect(
      summaryFor(
        "plan_workout",
        { date: "2024-01-01", exercises: [1, 2] },
        "r",
      ),
    ).toBe("2024-01-01 · о 09:00 · 2 вправ");
    expect(summaryFor("plan_workout", { time: "18:00" }, "r")).toBe("о 18:00");
  });

  it("finish_workout: with id and default", () => {
    expect(summaryFor("finish_workout", { workout_id: "w1" }, "r")).toBe(
      "ID: w1",
    );
    expect(summaryFor("finish_workout", {}, "r")).toBe("Поточне тренування");
  });

  it("log_measurement", () => {
    expect(
      summaryFor("log_measurement", { weight_kg: 80, body_fat_pct: 15 }, "r"),
    ).toBe("80 кг · 15% жиру");
  });

  it("add_program_day: weekday mapping and out-of-range", () => {
    expect(
      summaryFor("add_program_day", { weekday: 1, name: "Push" }, "r"),
    ).toBe("пн · Push");
    expect(summaryFor("add_program_day", { weekday: 99 }, "r")).toBe("?");
  });

  it("log_wellbeing", () => {
    expect(
      summaryFor(
        "log_wellbeing",
        { sleep_hours: 8, energy_level: 4, mood_score: 5 },
        "r",
      ),
    ).toBe("8 год сну · енергія 4/5 · настрій 5/5");
  });

  it("log_weight", () => {
    expect(summaryFor("log_weight", { weight_kg: 75 }, "r")).toBe("75 кг");
  });

  it("suggest_workout: focus and default", () => {
    expect(summaryFor("suggest_workout", { focus: "ноги" }, "r")).toBe("ноги");
    expect(summaryFor("suggest_workout", {}, "r")).toBe("Загальне тренування");
  });

  it("copy_workout: branches", () => {
    expect(
      summaryFor(
        "copy_workout",
        { source_workout_id: "w1", date: "2024-01-01" },
        "r",
      ),
    ).toBe("з w1 на 2024-01-01");
    expect(summaryFor("copy_workout", {}, "r")).toBe("Останнє тренування");
  });

  it("compare_progress: exercise vs muscle", () => {
    expect(
      summaryFor(
        "compare_progress",
        { exercise_name: "Жим", period_days: 14 },
        "r",
      ),
    ).toBe("Жим · 14 днів");
    expect(summaryFor("compare_progress", { muscle_group: "груди" }, "r")).toBe(
      "груди · 30 днів",
    );
  });

  it("set_goal: short, long and empty", () => {
    expect(
      summaryFor(
        "set_goal",
        { description: "Схуднути", target_weight_kg: 70 },
        "r",
      ),
    ).toBe("Схуднути · 70 кг");
    const long = "a".repeat(60);
    expect(summaryFor("set_goal", { description: long }, "r")).toBe(
      long.slice(0, 50) + "…",
    );
    expect(summaryFor("set_goal", {}, "r")).toBe("Нова ціль");
  });

  it("analytics period tools", () => {
    expect(summaryFor("spending_trend", { period_days: 7 }, "r")).toBe(
      "Період: 7 днів",
    );
    expect(summaryFor("weight_chart", {}, "r")).toBe("Період: 30 днів");
    expect(summaryFor("detect_anomalies", {}, "r")).toBe("Період: 30 днів");
    expect(summaryFor("habit_trend", {}, "r")).toBe("Період: 30 днів");
    expect(summaryFor("category_breakdown", {}, "r")).toBe("Період: 30 днів");
  });

  it("calculate_1rm", () => {
    expect(summaryFor("calculate_1rm", { weight_kg: 100, reps: 3 }, "r")).toBe(
      "100 кг · 3 повт.",
    );
  });

  it("convert_units", () => {
    expect(
      summaryFor(
        "convert_units",
        { value: 5, from_unit: "kg", to_unit: "lb" },
        "r",
      ),
    ).toBe("5 kg → lb");
  });

  it("save_note / list_notes", () => {
    expect(summaryFor("save_note", { title: "Title" }, "r")).toBe("Title");
    expect(summaryFor("list_notes", { name: "Name" }, "r")).toBe("Name");
  });

  it("export_module_data: module and default", () => {
    expect(summaryFor("export_module_data", { module: "finyk" }, "r")).toBe(
      "Модуль: finyk",
    );
    expect(summaryFor("export_module_data", {}, "r")).toBe("Експорт даних");
  });

  it("remember / forget", () => {
    expect(summaryFor("remember", { key: "k1" }, "r")).toBe("k1");
    expect(summaryFor("forget", { id: "i1" }, "r")).toBe("i1");
  });

  it("my_profile", () => {
    expect(summaryFor("my_profile", {}, "r")).toBe("Профіль користувача");
  });

  it("recall_memory: query and default", () => {
    expect(summaryFor("recall_memory", { query: "пошук" }, "r")).toBe("пошук");
    expect(summaryFor("recall_memory", {}, "r")).toBe("Пошук у пам'яті");
  });

  it("query/analytics tools return raw result untruncated", () => {
    const longResult = "x".repeat(300);
    expect(summaryFor("query_transactions", {}, longResult)).toBe(longResult);
    expect(summaryFor("aggregate_spending", {}, longResult)).toBe(longResult);
    expect(summaryFor("nutrition_averages", {}, longResult)).toBe(longResult);
  });

  it("default + truncation: unknown tool truncates result to 120 chars", () => {
    const longResult = "y".repeat(200);
    const out = summaryFor("unknown_tool", {}, longResult);
    expect(out.length).toBe(120);
    expect(out.endsWith("…")).toBe(true);
  });

  it("default: short result returned as-is", () => {
    expect(summaryFor("unknown_tool", {}, "short")).toBe("short");
  });

  it("utility tools fall through when required fields are absent", () => {
    expect(summaryFor("calculate_1rm", {}, "fallback")).toBe("fallback");
    expect(summaryFor("convert_units", { from_unit: "kg" }, "fallback")).toBe(
      "fallback",
    );
    expect(summaryFor("save_note", {}, "fallback")).toBe("fallback");
    expect(summaryFor("remember", {}, "fallback")).toBe("fallback");
  });
});
