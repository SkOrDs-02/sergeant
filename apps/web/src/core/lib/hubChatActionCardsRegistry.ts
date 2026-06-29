/**
 * Registry of per-tool summary builders for action cards.
 *
 * Replaces the monolithic `summaryFor` switch in `hubChatActionCardsSummary.ts`
 * (previously `complexity: 190`, `cognitive: 492`, 470 lines, with the
 * `stringField`/`numberField` helpers recreated on every call). Each entry is a
 * small pure function; the `Partial<Record<ToolName, …>>` shape lets us list
 * only the tools that need custom rendering and fall back to `truncate(result)`
 * for the rest.
 *
 * The `ToolName` union is the canonical Anthropic tool name set from
 * `chatActions/types.ts` — adding a new tool here is one entry instead of three
 * switch cases (`summaryFor`/`iconFor`/`titleFor`).
 */
import type { ChatAction } from "./chatActions/types";

type SummaryInput = Record<string, unknown>;

const stringField = (input: SummaryInput, key: string): string | undefined => {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

const numberField = (input: SummaryInput, key: string): number | undefined => {
  const v = input[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
};

const joinParts = (
  parts: (string | undefined | null | false)[],
  sep = " · ",
): string | undefined => {
  const filtered = parts.filter((p): p is string => Boolean(p));
  return filtered.length ? filtered.join(sep) : undefined;
};

export type SummaryFn = (input: SummaryInput) => string | undefined;

const SUMMARY_REGISTRY: Record<string, SummaryFn> = {
  create_transaction: (input) =>
    joinParts([
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ₴`
        : undefined,
      stringField(input, "description") || stringField(input, "category_id"),
    ]),

  find_transaction: (input) =>
    joinParts([
      stringField(input, "query"),
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ₴`
        : undefined,
    ]),

  batch_categorize: (input) => {
    const pattern = stringField(input, "pattern");
    const category = stringField(input, "category_id");
    return joinParts([pattern, category ? `→ ${category}` : undefined], " ");
  },

  log_meal: (input) =>
    joinParts([
      stringField(input, "meal_type"),
      stringField(input, "description") || stringField(input, "name"),
      numberField(input, "calories") !== undefined
        ? `${numberField(input, "calories")} ккал`
        : undefined,
    ]),

  log_water: (input) => {
    const ml = numberField(input, "amount_ml") ?? numberField(input, "amount");
    return ml !== undefined ? `${ml} мл` : undefined;
  },

  log_set: (input) =>
    joinParts([
      stringField(input, "exercise_name") ||
        stringField(input, "name") ||
        stringField(input, "exercise"),
      numberField(input, "weight_kg") !== undefined
        ? `${numberField(input, "weight_kg")} кг`
        : numberField(input, "weight") !== undefined
          ? `${numberField(input, "weight")} кг`
          : undefined,
      numberField(input, "reps") !== undefined
        ? `${numberField(input, "reps")} повт.`
        : undefined,
    ]),

  mark_habit_done: (input) =>
    stringField(input, "habit_id") || stringField(input, "name"),
  create_habit: (input) =>
    stringField(input, "habit_id") || stringField(input, "name"),

  set_habit_schedule: (input) => {
    const days = input["days"];
    if (!Array.isArray(days) || days.length === 0) return undefined;
    const cleaned = days
      .map((d) => (typeof d === "string" ? d.trim() : ""))
      .filter((d) => d.length > 0);
    return cleaned.length ? cleaned.join(", ") : undefined;
  },

  pause_habit: (input) => {
    const habit = stringField(input, "habit_id");
    const state = input["paused"] === false ? "знято з паузи" : "на паузі";
    return habit ? `${habit} · ${state}` : state;
  },

  start_workout: (input) =>
    stringField(input, "program_id") || stringField(input, "name"),

  compare_weeks: (input) => {
    const a = stringField(input, "week_a");
    const b = stringField(input, "week_b");
    if (a && b) return `${a} vs ${b}`;
    if (a) return `${a} vs попередній`;
    if (b) return `поточний vs ${b}`;
    return "поточний vs попередній";
  },

  change_category: (input) =>
    joinParts(
      [
        stringField(input, "tx_id")
          ? `TX: ${stringField(input, "tx_id")}`
          : undefined,
        stringField(input, "category_id")
          ? `→ ${stringField(input, "category_id")}`
          : undefined,
      ],
      " ",
    ),

  delete_transaction: (input) => {
    const txId = stringField(input, "tx_id");
    return txId ? `TX: ${txId}` : undefined;
  },
  hide_transaction: (input) => {
    const txId = stringField(input, "tx_id");
    return txId ? `TX: ${txId}` : undefined;
  },

  set_budget_limit: (input) =>
    joinParts([
      stringField(input, "category_id"),
      numberField(input, "limit") !== undefined ||
      numberField(input, "target_amount") !== undefined
        ? `${numberField(input, "limit") ?? numberField(input, "target_amount")} ₴`
        : undefined,
    ]),
  update_budget: (input) =>
    joinParts([
      stringField(input, "category_id"),
      numberField(input, "limit") !== undefined ||
      numberField(input, "target_amount") !== undefined
        ? `${numberField(input, "limit") ?? numberField(input, "target_amount")} ₴`
        : undefined,
    ]),

  set_monthly_plan: (input) =>
    joinParts([
      numberField(input, "income") !== undefined
        ? `Дохід: ${numberField(input, "income")} ₴`
        : undefined,
      numberField(input, "expense") !== undefined
        ? `Витрати: ${numberField(input, "expense")} ₴`
        : undefined,
      numberField(input, "savings") !== undefined
        ? `Заощадження: ${numberField(input, "savings")} ₴`
        : undefined,
    ]),

  create_debt: (input) =>
    joinParts([
      stringField(input, "name"),
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ₴`
        : undefined,
    ]),
  create_receivable: (input) =>
    joinParts([
      stringField(input, "name"),
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ₴`
        : undefined,
    ]),

  mark_debt_paid: (input) =>
    joinParts(
      [
        stringField(input, "debt_id"),
        numberField(input, "amount") !== undefined
          ? `${numberField(input, "amount")} ₴`
          : undefined,
      ],
      " ",
    ),

  add_asset: (input) =>
    joinParts([
      stringField(input, "name"),
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ${stringField(input, "currency") || "UAH"}`
        : undefined,
    ]),

  split_transaction: (input) => {
    const txId = stringField(input, "tx_id");
    if (!txId) return undefined;
    const parts = input["parts"];
    return `TX: ${txId} → ${Array.isArray(parts) ? parts.length : 0} частин`;
  },

  recurring_expense: (input) =>
    joinParts([
      stringField(input, "name"),
      numberField(input, "amount") !== undefined
        ? `${numberField(input, "amount")} ₴`
        : undefined,
    ]),

  export_report: (input) =>
    `Період: ${stringField(input, "period") || "month"}`,

  create_reminder: (input) =>
    joinParts(
      [
        stringField(input, "habit_id"),
        stringField(input, "time")
          ? `о ${stringField(input, "time")}`
          : undefined,
      ],
      " ",
    ),

  complete_habit_for_date: (input) => {
    const habitId = stringField(input, "habit_id");
    const date = stringField(input, "date");
    const state = input["completed"] === false ? "не виконано" : "виконано";
    if (habitId && date) return `${habitId} · ${date} · ${state}`;
    if (habitId) return `${habitId} · ${state}`;
    return undefined;
  },

  archive_habit: (input) => stringField(input, "habit_id"),
  edit_habit: (input) => stringField(input, "habit_id"),

  add_calendar_event: (input) =>
    joinParts([stringField(input, "name"), stringField(input, "date")]),

  reorder_habits: (input) => {
    const ids = input["habit_ids"];
    return Array.isArray(ids) ? `${ids.length} звичок` : undefined;
  },

  habit_stats: (input) => {
    const habitId = stringField(input, "habit_id");
    const periodDays = numberField(input, "period_days") ?? 30;
    if (habitId) return `${habitId} · ${periodDays} днів`;
    return undefined;
  },

  add_recipe: (input) =>
    joinParts([
      stringField(input, "title"),
      numberField(input, "time_minutes") !== undefined
        ? `${numberField(input, "time_minutes")} хв`
        : undefined,
    ]),

  add_to_shopping_list: (input) =>
    joinParts([stringField(input, "name"), stringField(input, "quantity")]),

  consume_from_pantry: (input) => stringField(input, "name"),

  set_daily_plan: (input) =>
    joinParts([
      numberField(input, "kcal") !== undefined
        ? `${numberField(input, "kcal")} ккал`
        : undefined,
      numberField(input, "protein_g") !== undefined
        ? `${numberField(input, "protein_g")} г білка`
        : undefined,
    ]),

  suggest_meal: (input) =>
    joinParts([stringField(input, "meal_type"), stringField(input, "focus")]),

  copy_meal_from_date: (input) =>
    joinParts([
      stringField(input, "source_date"),
      numberField(input, "target_kcal") !== undefined
        ? `${numberField(input, "target_kcal")} ккал`
        : undefined,
    ]),
  plan_meals_for_day: (input) =>
    joinParts([
      stringField(input, "source_date"),
      numberField(input, "target_kcal") !== undefined
        ? `${numberField(input, "target_kcal")} ккал`
        : undefined,
    ]),

  plan_workout: (input) => {
    const date = stringField(input, "date");
    const time = stringField(input, "time") || "09:00";
    const exercises = input["exercises"];
    return joinParts([
      date,
      `о ${time}`,
      Array.isArray(exercises) ? `${exercises.length} вправ` : undefined,
    ]);
  },

  finish_workout: (input) => {
    const workoutId = stringField(input, "workout_id");
    return workoutId ? `ID: ${workoutId}` : "Поточне тренування";
  },

  log_measurement: (input) =>
    joinParts([
      numberField(input, "weight_kg") !== undefined
        ? `${numberField(input, "weight_kg")} кг`
        : undefined,
      numberField(input, "body_fat_pct") !== undefined
        ? `${numberField(input, "body_fat_pct")}% жиру`
        : undefined,
    ]),

  add_program_day: (input) => {
    const days = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
    const weekday = numberField(input, "weekday");
    const dayName =
      weekday !== undefined && weekday >= 0 && weekday <= 6
        ? (days[weekday] ?? "?")
        : "?";
    return joinParts([dayName, stringField(input, "name")]);
  },

  log_wellbeing: (input) =>
    joinParts([
      numberField(input, "sleep_hours") !== undefined
        ? `${numberField(input, "sleep_hours")} год сну`
        : undefined,
      numberField(input, "energy_level") !== undefined
        ? `енергія ${numberField(input, "energy_level")}/5`
        : undefined,
      numberField(input, "mood_score") !== undefined
        ? `настрій ${numberField(input, "mood_score")}/5`
        : undefined,
    ]),

  log_weight: (input) =>
    numberField(input, "weight_kg") !== undefined
      ? `${numberField(input, "weight_kg")} кг`
      : undefined,

  suggest_workout: (input) =>
    stringField(input, "focus") || "Загальне тренування",

  copy_workout: (input) => {
    const srcId = stringField(input, "source_workout_id");
    const date = stringField(input, "date");
    return (
      joinParts(
        [srcId ? `з ${srcId}` : undefined, date ? `на ${date}` : undefined],
        " ",
      ) ?? "Останнє тренування"
    );
  },

  compare_progress: (input) => {
    const exercise = stringField(input, "exercise_name");
    const muscle = stringField(input, "muscle_group");
    const period = numberField(input, "period_days") ?? 30;
    return joinParts([exercise || muscle, `${period} днів`]);
  },

  set_goal: (input) => {
    const desc = stringField(input, "description");
    const targetWeight = numberField(input, "target_weight_kg");
    const parts: (string | undefined)[] = [];
    if (desc && desc.length <= 50) parts.push(desc);
    else if (desc) parts.push(desc.slice(0, 50) + "…");
    if (targetWeight !== undefined) parts.push(`${targetWeight} кг`);
    return parts.length ? parts.join(" · ") : "Нова ціль";
  },

  spending_trend: (input) =>
    `Період: ${numberField(input, "period_days") ?? 30} днів`,
  weight_chart: (input) =>
    `Період: ${numberField(input, "period_days") ?? 30} днів`,
  category_breakdown: (input) =>
    `Період: ${numberField(input, "period_days") ?? 30} днів`,
  detect_anomalies: (input) =>
    `Період: ${numberField(input, "period_days") ?? 30} днів`,
  habit_trend: (input) =>
    `Період: ${numberField(input, "period_days") ?? 30} днів`,

  calculate_1rm: (input) =>
    joinParts([
      numberField(input, "weight_kg") !== undefined
        ? `${numberField(input, "weight_kg")} кг`
        : undefined,
      numberField(input, "reps") !== undefined
        ? `${numberField(input, "reps")} повт.`
        : undefined,
    ]),

  convert_units: (input) =>
    joinParts(
      [
        numberField(input, "value") !== undefined
          ? `${numberField(input, "value")}`
          : undefined,
        stringField(input, "from_unit") && stringField(input, "to_unit")
          ? `${stringField(input, "from_unit")} → ${stringField(input, "to_unit")}`
          : undefined,
      ],
      " ",
    ),

  save_note: (input) =>
    stringField(input, "title") || stringField(input, "name"),
  list_notes: (input) =>
    stringField(input, "title") || stringField(input, "name"),

  export_module_data: (input) => {
    const mod = stringField(input, "module");
    return mod ? `Модуль: ${mod}` : "Експорт даних";
  },

  remember: (input) => stringField(input, "key") || stringField(input, "id"),
  forget: (input) => stringField(input, "key") || stringField(input, "id"),

  my_profile: () => "Профіль користувача",

  recall_memory: (input) => stringField(input, "query") || "Пошук у пам'яті",
};

const QUERY_TOOLS_FOR_PASSTHROUGH: ReadonlySet<string> = new Set([
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
]);

/**
 * Public registry entry point. Returns the rendered summary for an action,
 * looking up the per-tool builder first, then the read-only query pass-through,
 * then the result-truncation fallback.
 *
 * Mirrors the legacy `summaryFor(name, input, result)` signature.
 */
export function renderSummary(
  name: string,
  input: ChatAction["input"] | SummaryInput,
  result: string,
): string {
  const truncate = (s: string, max = 120): string =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;
  const inputObj = (input || {}) as SummaryInput;

  if (QUERY_TOOLS_FOR_PASSTHROUGH.has(name)) {
    return result;
  }

  const builder = SUMMARY_REGISTRY[name];
  if (builder) {
    const built = builder(inputObj);
    if (built !== undefined) return built;
  }

  return truncate(result);
}
