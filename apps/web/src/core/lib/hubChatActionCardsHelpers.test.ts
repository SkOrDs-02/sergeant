import { describe, it, expect } from "vitest";
import { moduleFor, iconFor, titleFor } from "./hubChatActionCardsHelpers";

describe("moduleFor", () => {
  it("maps finyk tools", () => {
    for (const n of [
      "create_transaction",
      "find_transaction",
      "batch_categorize",
      "change_category",
      "delete_transaction",
      "hide_transaction",
      "set_budget_limit",
      "set_monthly_plan",
      "create_debt",
      "create_receivable",
      "update_budget",
      "mark_debt_paid",
      "add_asset",
      "split_transaction",
      "recurring_expense",
      "export_report",
      "import_monobank_range",
      "query_transactions",
      "aggregate_spending",
      "compare_periods",
    ]) {
      expect(moduleFor(n)).toBe("finyk");
    }
  });

  it("maps nutrition tools", () => {
    for (const n of [
      "log_meal",
      "log_water",
      "add_recipe",
      "add_to_shopping_list",
      "consume_from_pantry",
      "set_daily_plan",
      "suggest_meal",
      "copy_meal_from_date",
      "plan_meals_for_day",
      "query_nutrition",
      "nutrition_averages",
    ]) {
      expect(moduleFor(n)).toBe("nutrition");
    }
  });

  it("maps fizruk tools", () => {
    for (const n of [
      "start_workout",
      "log_set",
      "plan_workout",
      "finish_workout",
      "log_measurement",
      "add_program_day",
      "log_wellbeing",
      "log_weight",
      "suggest_workout",
      "copy_workout",
      "compare_progress",
      "query_workouts",
      "exercise_progress",
      "training_stats",
    ]) {
      expect(moduleFor(n)).toBe("fizruk");
    }
  });

  it("maps routine tools", () => {
    for (const n of [
      "mark_habit_done",
      "create_habit",
      "archive_habit",
      "set_habit_schedule",
      "pause_habit",
      "create_reminder",
      "complete_habit_for_date",
      "add_calendar_event",
      "edit_habit",
      "reorder_habits",
      "habit_stats",
      "query_habits",
      "habit_correlation",
    ]) {
      expect(moduleFor(n)).toBe("routine");
    }
  });

  it("maps unknown/cross/utility/memory to hub", () => {
    expect(moduleFor("set_goal")).toBe("hub");
    expect(moduleFor("remember")).toBe("hub");
    expect(moduleFor("calculate_1rm")).toBe("hub");
    expect(moduleFor("totally_unknown")).toBe("hub");
  });
});

describe("iconFor", () => {
  it("returns icons for known tools across modules", () => {
    expect(iconFor("create_transaction")).toBe("credit-card");
    expect(iconFor("set_monthly_plan")).toBe("calendar");
    expect(iconFor("create_debt")).toBe("landmark");
    expect(iconFor("add_asset")).toBe("piggy-bank");
    expect(iconFor("export_report")).toBe("file-text");
    expect(iconFor("import_monobank_range")).toBe("refresh-cw");
    expect(iconFor("log_meal")).toBe("utensils");
    expect(iconFor("log_water")).toBe("droplet");
    expect(iconFor("add_recipe")).toBe("book-open");
    expect(iconFor("add_to_shopping_list")).toBe("shopping-cart");
    expect(iconFor("consume_from_pantry")).toBe("check");
    expect(iconFor("set_daily_plan")).toBe("target");
    expect(iconFor("suggest_meal")).toBe("lightbulb");
    expect(iconFor("start_workout")).toBe("dumbbell");
    expect(iconFor("log_set")).toBe("activity");
    expect(iconFor("finish_workout")).toBe("flag");
    expect(iconFor("log_measurement")).toBe("weighing-scale");
    expect(iconFor("add_program_day")).toBe("calendar-days");
    expect(iconFor("log_wellbeing")).toBe("smile");
    expect(iconFor("suggest_workout")).toBe("zap");
    expect(iconFor("compare_progress")).toBe("trending-up");
    expect(iconFor("mark_habit_done")).toBe("check");
    expect(iconFor("set_habit_schedule")).toBe("calendar");
    expect(iconFor("pause_habit")).toBe("pause-circle");
    expect(iconFor("archive_habit")).toBe("archive");
    expect(iconFor("reorder_habits")).toBe("arrow-up-down");
    expect(iconFor("habit_stats")).toBe("bar-chart");
    expect(iconFor("complete_habit_for_date")).toBe("calendar-check");
    expect(iconFor("morning_briefing")).toBe("sun");
    expect(iconFor("weekly_summary")).toBe("bar-chart");
    expect(iconFor("set_goal")).toBe("target");
    expect(iconFor("detect_anomalies")).toBe("alert-triangle");
    expect(iconFor("calculate_1rm")).toBe("calculator");
    expect(iconFor("convert_units")).toBe("arrow-right-left");
    expect(iconFor("save_note")).toBe("sticky-note");
    expect(iconFor("export_module_data")).toBe("download");
    expect(iconFor("remember")).toBe("brain");
    expect(iconFor("my_profile")).toBe("user");
    expect(iconFor("recall_memory")).toBe("search");
    expect(iconFor("aggregate_spending")).toBe("bar-chart");
    expect(iconFor("compare_periods")).toBe("trending-up");
    expect(iconFor("query_transactions")).toBe("search");
  });

  it("covers remaining icon cases", () => {
    expect(iconFor("find_transaction")).toBe("credit-card");
    expect(iconFor("batch_categorize")).toBe("credit-card");
    expect(iconFor("change_category")).toBe("credit-card");
    expect(iconFor("delete_transaction")).toBe("credit-card");
    expect(iconFor("hide_transaction")).toBe("credit-card");
    expect(iconFor("set_budget_limit")).toBe("credit-card");
    expect(iconFor("update_budget")).toBe("credit-card");
    expect(iconFor("split_transaction")).toBe("credit-card");
    expect(iconFor("recurring_expense")).toBe("calendar");
    expect(iconFor("create_receivable")).toBe("landmark");
    expect(iconFor("mark_debt_paid")).toBe("landmark");
    expect(iconFor("copy_meal_from_date")).toBe("utensils");
    expect(iconFor("plan_meals_for_day")).toBe("utensils");
    expect(iconFor("plan_workout")).toBe("dumbbell");
    expect(iconFor("copy_workout")).toBe("dumbbell");
    expect(iconFor("log_weight")).toBe("weighing-scale");
    expect(iconFor("create_habit")).toBe("check");
    expect(iconFor("edit_habit")).toBe("check");
    expect(iconFor("create_reminder")).toBe("calendar");
    expect(iconFor("add_calendar_event")).toBe("calendar");
    expect(iconFor("spending_trend")).toBe("bar-chart");
    expect(iconFor("weight_chart")).toBe("bar-chart");
    expect(iconFor("category_breakdown")).toBe("bar-chart");
    expect(iconFor("habit_trend")).toBe("bar-chart");
    expect(iconFor("compare_weeks")).toBe("bar-chart");
    expect(iconFor("training_stats")).toBe("bar-chart");
    expect(iconFor("nutrition_averages")).toBe("bar-chart");
    expect(iconFor("query_habits")).toBe("bar-chart");
    expect(iconFor("exercise_progress")).toBe("trending-up");
    expect(iconFor("habit_correlation")).toBe("trending-up");
    expect(iconFor("query_workouts")).toBe("search");
    expect(iconFor("query_nutrition")).toBe("search");
    expect(iconFor("forget")).toBe("brain");
    expect(iconFor("list_notes")).toBe("sticky-note");
  });

  it("returns undefined for unknown tool", () => {
    expect(iconFor("totally_unknown")).toBeUndefined();
  });
});

describe("titleFor", () => {
  it("returns completed titles", () => {
    expect(titleFor("create_transaction", "completed")).toBe(
      "Транзакцію записано",
    );
    expect(titleFor("log_water", "completed")).toBe("Воду залоговано");
    expect(titleFor("start_workout", "completed")).toBe(
      "Тренування стартувало",
    );
    expect(titleFor("mark_habit_done", "completed")).toBe("Звичку створено");
  });

  it("appends failed suffix", () => {
    expect(titleFor("create_transaction", "failed")).toBe(
      "Транзакцію записано — не вийшло",
    );
    expect(titleFor("log_set", "failed")).toBe("Підхід записано — не вийшло");
  });

  it("covers cross-module, utility, memory, query titles", () => {
    expect(titleFor("morning_briefing", "completed")).toBe("Ранковий брифінг");
    expect(titleFor("set_goal", "completed")).toBe("Ціль встановлено");
    expect(titleFor("calculate_1rm", "completed")).toBe("1RM розраховано");
    expect(titleFor("remember", "completed")).toBe("Пам'ять оновлено");
    expect(titleFor("query_transactions", "completed")).toBe(
      "Транзакції за запитом",
    );
    expect(titleFor("nutrition_averages", "completed")).toBe(
      "Середнє харчування",
    );
  });

  it("falls back to tool name for unknown", () => {
    expect(titleFor("totally_unknown", "completed")).toBe("totally_unknown");
  });

  it("returns a non-empty completed title for every known tool", () => {
    const tools = [
      "create_transaction",
      "find_transaction",
      "batch_categorize",
      "change_category",
      "delete_transaction",
      "hide_transaction",
      "set_budget_limit",
      "update_budget",
      "set_monthly_plan",
      "create_debt",
      "create_receivable",
      "mark_debt_paid",
      "add_asset",
      "split_transaction",
      "recurring_expense",
      "export_report",
      "log_meal",
      "log_water",
      "add_recipe",
      "add_to_shopping_list",
      "consume_from_pantry",
      "set_daily_plan",
      "suggest_meal",
      "copy_meal_from_date",
      "plan_meals_for_day",
      "start_workout",
      "log_set",
      "plan_workout",
      "finish_workout",
      "log_measurement",
      "add_program_day",
      "log_wellbeing",
      "log_weight",
      "suggest_workout",
      "copy_workout",
      "compare_progress",
      "mark_habit_done",
      "create_habit",
      "set_habit_schedule",
      "pause_habit",
      "create_reminder",
      "complete_habit_for_date",
      "archive_habit",
      "add_calendar_event",
      "edit_habit",
      "reorder_habits",
      "habit_stats",
      "morning_briefing",
      "weekly_summary",
      "compare_weeks",
      "set_goal",
      "spending_trend",
      "weight_chart",
      "category_breakdown",
      "detect_anomalies",
      "habit_trend",
      "calculate_1rm",
      "convert_units",
      "save_note",
      "list_notes",
      "export_module_data",
      "remember",
      "forget",
      "my_profile",
      "recall_memory",
      "query_transactions",
      "aggregate_spending",
      "compare_periods",
      "query_workouts",
      "exercise_progress",
      "training_stats",
      "query_habits",
      "habit_correlation",
      "query_nutrition",
      "nutrition_averages",
    ];
    for (const t of tools) {
      const completed = titleFor(t, "completed");
      const failed = titleFor(t, "failed");
      expect(completed.length).toBeGreaterThan(0);
      expect(failed).toContain("— не вийшло");
    }
  });
});
