/**
 * summaryFor function - generates a short summary for action cards
 * based on the tool name and input parameters.
 */

type StringFieldGetter = (key: string) => string | undefined;
type NumberFieldGetter = (key: string) => number | undefined;

export function summaryFor(
  name: string,
  input: Record<string, unknown>,
  result: string,
): string {
  const truncate = (s: string, max = 120): string =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

  const stringField: StringFieldGetter = (key: string): string | undefined => {
    const v = input[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const numberField: NumberFieldGetter = (key: string): number | undefined => {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
    return undefined;
  };

  switch (name) {
    case "create_transaction": {
      const amount = numberField("amount");
      const desc = stringField("description") || stringField("category_id");
      const parts: string[] = [];
      if (amount !== undefined) parts.push(`${amount} ₴`);
      if (desc) parts.push(desc);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "find_transaction": {
      const query = stringField("query");
      const amount = numberField("amount");
      const parts: string[] = [];
      if (query) parts.push(query);
      if (amount !== undefined) parts.push(`${amount} ₴`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "batch_categorize": {
      const pattern = stringField("pattern");
      const category = stringField("category_id");
      const parts: string[] = [];
      if (pattern) parts.push(pattern);
      if (category) parts.push(`→ ${category}`);
      if (parts.length) return parts.join(" ");
      break;
    }
    case "log_meal": {
      const meal = stringField("meal_type");
      const desc = stringField("description") || stringField("name");
      const kcal = numberField("calories");
      const parts: string[] = [];
      if (meal) parts.push(meal);
      if (desc) parts.push(desc);
      if (kcal !== undefined) parts.push(`${kcal} ккал`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "log_water": {
      const ml = numberField("amount_ml") ?? numberField("amount");
      if (ml !== undefined) return `${ml} мл`;
      break;
    }
    case "log_set": {
      const exercise =
        stringField("exercise_name") ||
        stringField("name") ||
        stringField("exercise");
      const weight = numberField("weight_kg") ?? numberField("weight");
      const reps = numberField("reps");
      const parts: string[] = [];
      if (exercise) parts.push(exercise);
      if (weight !== undefined) parts.push(`${weight} кг`);
      if (reps !== undefined) parts.push(`${reps} повт.`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "mark_habit_done":
    case "create_habit": {
      const habit = stringField("habit_id") || stringField("name");
      if (habit) return habit;
      break;
    }
    case "set_habit_schedule": {
      const days = (input["days"] as unknown) ?? null;
      if (Array.isArray(days) && days.length > 0) {
        return days
          .map((d) => (typeof d === "string" ? d.trim() : ""))
          .filter((d) => d.length > 0)
          .join(", ");
      }
      break;
    }
    case "pause_habit": {
      const habit = stringField("habit_id");
      const paused = input["paused"];
      const state = paused === false ? "знято з паузи" : "на паузі";
      if (habit) return `${habit} · ${state}`;
      return state;
    }
    case "start_workout": {
      const program = stringField("program_id") || stringField("name");
      if (program) return program;
      break;
    }
    case "compare_weeks": {
      const weekA = stringField("week_a");
      const weekB = stringField("week_b");
      if (weekA && weekB) return `${weekA} vs ${weekB}`;
      if (weekA) return `${weekA} vs попередній`;
      if (weekB) return `поточний vs ${weekB}`;
      return "поточний vs попередній";
    }
    // Finyk - additional tools
    case "change_category": {
      const txId = stringField("tx_id");
      const catId = stringField("category_id");
      const parts: string[] = [];
      if (txId) parts.push(`TX: ${txId}`);
      if (catId) parts.push(`→ ${catId}`);
      if (parts.length) return parts.join(" ");
      break;
    }
    case "delete_transaction": {
      const txId = stringField("tx_id");
      if (txId) return `TX: ${txId}`;
      break;
    }
    case "hide_transaction": {
      const txId = stringField("tx_id");
      if (txId) return `TX: ${txId}`;
      break;
    }
    case "set_budget_limit":
    case "update_budget": {
      const catId = stringField("category_id");
      const limit = numberField("limit") ?? numberField("target_amount");
      const parts: string[] = [];
      if (catId) parts.push(catId);
      if (limit !== undefined) parts.push(`${limit} ₴`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "set_monthly_plan": {
      const income = numberField("income");
      const expense = numberField("expense");
      const savings = numberField("savings");
      const parts: string[] = [];
      if (income !== undefined) parts.push(`Дохід: ${income} ₴`);
      if (expense !== undefined) parts.push(`Витрати: ${expense} ₴`);
      if (savings !== undefined) parts.push(`Заощадження: ${savings} ₴`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "create_debt":
    case "create_receivable": {
      const name = stringField("name");
      const amount = numberField("amount");
      const parts: string[] = [];
      if (name) parts.push(name);
      if (amount !== undefined) parts.push(`${amount} ₴`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "mark_debt_paid": {
      const debtId = stringField("debt_id");
      const amount = numberField("amount");
      const parts: string[] = [];
      if (debtId) parts.push(debtId);
      if (amount !== undefined) parts.push(`${amount} ₴`);
      if (parts.length) return parts.join(" ");
      break;
    }
    case "add_asset": {
      const name = stringField("name");
      const amount = numberField("amount");
      const currency = stringField("currency") || "UAH";
      const parts: string[] = [];
      if (name) parts.push(name);
      if (amount !== undefined) parts.push(`${amount} ${currency}`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "split_transaction": {
      const txId = stringField("tx_id");
      const parts = input["parts"];
      if (txId)
        return `TX: ${txId} → ${Array.isArray(parts) ? parts.length : 0} частин`;
      break;
    }
    case "recurring_expense": {
      const name = stringField("name");
      const amount = numberField("amount");
      const parts: string[] = [];
      if (name) parts.push(name);
      if (amount !== undefined) parts.push(`${amount} ₴`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "export_report": {
      const period = stringField("period") || "month";
      return `Період: ${period}`;
    }
    // Routine - additional tools
    case "create_reminder": {
      const habitId = stringField("habit_id");
      const time = stringField("time");
      const parts: string[] = [];
      if (habitId) parts.push(habitId);
      if (time) parts.push(`о ${time}`);
      if (parts.length) return parts.join(" ");
      break;
    }
    case "complete_habit_for_date": {
      const habitId = stringField("habit_id");
      const date = stringField("date");
      const completed = input["completed"];
      const state = completed === false ? "не виконано" : "виконано";
      if (habitId && date) return `${habitId} · ${date} · ${state}`;
      if (habitId) return `${habitId} · ${state}`;
      break;
    }
    case "archive_habit":
    case "edit_habit": {
      const habitId = stringField("habit_id");
      if (habitId) return habitId;
      break;
    }
    case "add_calendar_event": {
      const eventName = stringField("name");
      const date = stringField("date");
      const parts: string[] = [];
      if (eventName) parts.push(eventName);
      if (date) parts.push(date);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "reorder_habits": {
      const ids = input["habit_ids"];
      if (Array.isArray(ids)) return `${ids.length} звичок`;
      break;
    }
    case "habit_stats": {
      const habitId = stringField("habit_id");
      const periodDays = numberField("period_days") ?? 30;
      if (habitId) return `${habitId} · ${periodDays} днів`;
      break;
    }
    // Nutrition - additional tools
    case "add_recipe": {
      const title = stringField("title");
      const timeMin = numberField("time_minutes");
      const parts: string[] = [];
      if (title) parts.push(title);
      if (timeMin !== undefined) parts.push(`${timeMin} хв`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "add_to_shopping_list": {
      const name = stringField("name");
      const quantity = stringField("quantity");
      const parts: string[] = [];
      if (name) parts.push(name);
      if (quantity) parts.push(quantity);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "consume_from_pantry": {
      const name = stringField("name");
      if (name) return name;
      break;
    }
    case "set_daily_plan": {
      const kcal = numberField("kcal");
      const protein = numberField("protein_g");
      const parts: string[] = [];
      if (kcal !== undefined) parts.push(`${kcal} ккал`);
      if (protein !== undefined) parts.push(`${protein} г білка`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "suggest_meal": {
      const focus = stringField("focus");
      const mealType = stringField("meal_type");
      const parts: string[] = [];
      if (mealType) parts.push(mealType);
      if (focus) parts.push(focus);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "copy_meal_from_date":
    case "plan_meals_for_day": {
      const sourceDate = stringField("source_date");
      const targetKcal = numberField("target_kcal");
      const parts: string[] = [];
      if (sourceDate) parts.push(sourceDate);
      if (targetKcal !== undefined) parts.push(`${targetKcal} ккал`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    // Fizruk - additional tools
    case "plan_workout": {
      const date = stringField("date");
      const time = stringField("time") || "09:00";
      const exercises = input["exercises"];
      const parts: string[] = [];
      if (date) parts.push(date);
      parts.push(`о ${time}`);
      if (Array.isArray(exercises)) parts.push(`${exercises.length} вправ`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "finish_workout": {
      const workoutId = stringField("workout_id");
      if (workoutId) return `ID: ${workoutId}`;
      return "Поточне тренування";
    }
    case "log_measurement": {
      const weight = numberField("weight_kg");
      const bodyFat = numberField("body_fat_pct");
      const parts: string[] = [];
      if (weight !== undefined) parts.push(`${weight} кг`);
      if (bodyFat !== undefined) parts.push(`${bodyFat}% жиру`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "add_program_day": {
      const weekday = numberField("weekday");
      const name = stringField("name");
      const days = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
      const dayName =
        weekday !== undefined && weekday >= 0 && weekday <= 6
          ? (days[weekday] ?? "?")
          : "?";
      const parts: string[] = [];
      parts.push(dayName);
      if (name) parts.push(name);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "log_wellbeing": {
      const sleep = numberField("sleep_hours");
      const energy = numberField("energy_level");
      const mood = numberField("mood_score");
      const parts: string[] = [];
      if (sleep !== undefined) parts.push(`${sleep} год сну`);
      if (energy !== undefined) parts.push(`енергія ${energy}/5`);
      if (mood !== undefined) parts.push(`настрій ${mood}/5`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "log_weight": {
      const weight = numberField("weight_kg");
      if (weight !== undefined) return `${weight} кг`;
      break;
    }
    case "suggest_workout": {
      const focus = stringField("focus");
      if (focus) return focus;
      return "Загальне тренування";
    }
    case "copy_workout": {
      const srcId = stringField("source_workout_id");
      const date = stringField("date");
      const parts: string[] = [];
      if (srcId) parts.push(`з ${srcId}`);
      if (date) parts.push(`на ${date}`);
      if (parts.length) return parts.join(" ");
      return "Останнє тренування";
    }
    case "compare_progress": {
      const exercise = stringField("exercise_name");
      const muscle = stringField("muscle_group");
      const period = numberField("period_days") ?? 30;
      const parts: string[] = [];
      if (exercise) parts.push(exercise);
      else if (muscle) parts.push(muscle);
      parts.push(`${period} днів`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    // Cross-module - additional tools
    case "set_goal": {
      const desc = stringField("description");
      const targetWeight = numberField("target_weight_kg");
      const parts: string[] = [];
      if (desc && desc.length <= 50) parts.push(desc);
      else if (desc) parts.push(desc.slice(0, 50) + "…");
      if (targetWeight !== undefined) parts.push(`${targetWeight} кг`);
      if (parts.length) return parts.join(" · ");
      if (!parts.length) return "Нова ціль";
      break;
    }
    case "spending_trend":
    case "weight_chart":
    case "category_breakdown":
    case "detect_anomalies":
    case "habit_trend": {
      const period = numberField("period_days") ?? 30;
      return `Період: ${period} днів`;
    }
    // Utility tools
    case "calculate_1rm": {
      const weight = numberField("weight_kg");
      const reps = numberField("reps");
      const parts: string[] = [];
      if (weight !== undefined) parts.push(`${weight} кг`);
      if (reps !== undefined) parts.push(`${reps} повт.`);
      if (parts.length) return parts.join(" · ");
      break;
    }
    case "convert_units": {
      const value = numberField("value");
      const from = stringField("from_unit");
      const to = stringField("to_unit");
      const parts: string[] = [];
      if (value !== undefined) parts.push(`${value}`);
      if (from && to) parts.push(`${from} → ${to}`);
      if (parts.length) return parts.join(" ");
      break;
    }
    case "save_note":
    case "list_notes": {
      const title = stringField("title") || stringField("name");
      if (title) return title;
      break;
    }
    case "export_module_data": {
      const module = stringField("module");
      if (module) return `Модуль: ${module}`;
      return "Експорт даних";
    }
    // Memory tools
    case "remember":
    case "forget": {
      const key = stringField("key") || stringField("id");
      if (key) return key;
      break;
    }
    case "my_profile": {
      return "Профіль користувача";
    }
    case "recall_memory": {
      const query = stringField("query");
      if (query) return query;
      return "Пошук у пам'яті";
    }
    default:
      break;
  }

  return truncate(result);
}
