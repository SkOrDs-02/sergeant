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
import {
  categoryLabelFor,
  habitNameFor,
  mealTypeLabelFor,
} from "./hubChatActionCardsHelpers";
import { formatNumberUk } from "@sergeant/shared";

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
  create_transaction: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
      stringField(input, "description") || stringField(input, "category_id"),
    ]);
  },

  find_transaction: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      stringField(input, "query"),
      amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
    ]);
  },

  batch_categorize: (input) => {
    const pattern = stringField(input, "pattern");
    const category = stringField(input, "category_id");
    return joinParts([pattern, category ? `→ ${category}` : undefined], " ");
  },

  log_meal: (input) => {
    const calories = numberField(input, "calories");
    return joinParts([
      mealTypeLabelFor(stringField(input, "meal_type")),
      stringField(input, "description") || stringField(input, "name"),
      calories !== undefined ? `${formatNumberUk(calories)} ккал` : undefined,
    ]);
  },

  log_water: (input) => {
    const ml = numberField(input, "amount_ml") ?? numberField(input, "amount");
    return ml !== undefined ? `${formatNumberUk(ml)} мл` : undefined;
  },

  log_set: (input) => {
    const weightKg =
      numberField(input, "weight_kg") ?? numberField(input, "weight");
    const reps = numberField(input, "reps");
    return joinParts([
      stringField(input, "exercise_name") ||
        stringField(input, "name") ||
        stringField(input, "exercise"),
      weightKg !== undefined ? `${formatNumberUk(weightKg)} кг` : undefined,
      reps !== undefined ? `${reps} повт.` : undefined,
    ]);
  },

  // AI-4 (`docs/work/specs/audits/2026-09-01-product-audit/findings.md`) —
  // `habitNameFor` резолвить `hab_<uuid>` у назву звички з локального
  // стану Рутини; raw id — fallback, коли звички вже немає локально
  // (видалена / ще не синхронізована), а не типовий шлях.
  mark_habit_done: (input) =>
    habitNameFor(stringField(input, "habit_id")) ||
    stringField(input, "habit_id") ||
    stringField(input, "name"),
  create_habit: (input) =>
    stringField(input, "name") ||
    habitNameFor(stringField(input, "habit_id")) ||
    stringField(input, "habit_id"),

  set_habit_schedule: (input) => {
    const days = input["days"];
    if (!Array.isArray(days) || days.length === 0) return undefined;
    const cleaned = days
      .map((d) => (typeof d === "string" ? d.trim() : ""))
      .filter((d) => d.length > 0);
    return cleaned.length ? cleaned.join(", ") : undefined;
  },

  pause_habit: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    const habit = habitNameFor(rawHabitId) || rawHabitId;
    if (input["paused"] === false) {
      return habit ? `${habit} · повернення з паузи` : "повернення з паузи";
    }
    // Показуємо саме діапазон: без нього картка підтвердження не давала б
    // відповісти на єдине питання, яке тут важить, — «на скільки?».
    const from = stringField(input, "from");
    const to = stringField(input, "to");
    const range = from && to ? `${from} – ${to}` : from ? `з ${from}` : "пауза";
    return habit ? `${habit} · ${range}` : range;
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

  set_budget_limit: (input) => {
    const limit =
      numberField(input, "limit") ?? numberField(input, "target_amount");
    return joinParts([
      categoryLabelFor(stringField(input, "category_id")) ||
        stringField(input, "category_id"),
      limit !== undefined ? `${formatNumberUk(limit)} ₴` : undefined,
    ]);
  },
  update_budget: (input) => {
    const limit =
      numberField(input, "limit") ?? numberField(input, "target_amount");
    return joinParts([
      categoryLabelFor(stringField(input, "category_id")) ||
        stringField(input, "category_id"),
      limit !== undefined ? `${formatNumberUk(limit)} ₴` : undefined,
    ]);
  },

  set_monthly_plan: (input) => {
    const income = numberField(input, "income");
    const expense = numberField(input, "expense");
    const savings = numberField(input, "savings");
    return joinParts([
      income !== undefined ? `Дохід: ${formatNumberUk(income)} ₴` : undefined,
      expense !== undefined
        ? `Витрати: ${formatNumberUk(expense)} ₴`
        : undefined,
      savings !== undefined
        ? `Заощадження: ${formatNumberUk(savings)} ₴`
        : undefined,
    ]);
  },

  create_debt: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      stringField(input, "name"),
      amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
    ]);
  },
  create_receivable: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      stringField(input, "name"),
      amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
    ]);
  },

  mark_debt_paid: (input) => {
    const amount = numberField(input, "amount");
    return joinParts(
      [
        stringField(input, "debt_id"),
        amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
      ],
      " ",
    );
  },

  add_asset: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      stringField(input, "name"),
      amount !== undefined
        ? `${formatNumberUk(amount)} ${stringField(input, "currency") || "UAH"}`
        : undefined,
    ]);
  },

  split_transaction: (input) => {
    const txId = stringField(input, "tx_id");
    if (!txId) return undefined;
    const parts = input["parts"];
    return `TX: ${txId} → ${Array.isArray(parts) ? parts.length : 0} частин`;
  },

  recurring_expense: (input) => {
    const amount = numberField(input, "amount");
    return joinParts([
      stringField(input, "name"),
      amount !== undefined ? `${formatNumberUk(amount)} ₴` : undefined,
    ]);
  },

  export_report: (input) =>
    `Період: ${stringField(input, "period") || "month"}`,

  create_reminder: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    return joinParts(
      [
        habitNameFor(rawHabitId) || rawHabitId,
        stringField(input, "time")
          ? `о ${stringField(input, "time")}`
          : undefined,
      ],
      " ",
    );
  },

  complete_habit_for_date: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    const habitId = habitNameFor(rawHabitId) || rawHabitId;
    const date = stringField(input, "date");
    const state = input["completed"] === false ? "не виконано" : "виконано";
    if (habitId && date) return `${habitId} · ${date} · ${state}`;
    if (habitId) return `${habitId} · ${state}`;
    return undefined;
  },

  archive_habit: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    return habitNameFor(rawHabitId) || rawHabitId;
  },
  edit_habit: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    return habitNameFor(rawHabitId) || rawHabitId;
  },

  add_calendar_event: (input) =>
    joinParts([stringField(input, "name"), stringField(input, "date")]),

  reorder_habits: (input) => {
    const ids = input["habit_ids"];
    return Array.isArray(ids) ? `${ids.length} звичок` : undefined;
  },

  habit_stats: (input) => {
    const rawHabitId = stringField(input, "habit_id");
    const habitId = habitNameFor(rawHabitId) || rawHabitId;
    const periodDays = numberField(input, "period_days") ?? 30;
    if (habitId) return `${habitId} · ${periodDays} днів`;
    return undefined;
  },

  add_recipe: (input) => {
    const timeMinutes = numberField(input, "time_minutes");
    return joinParts([
      stringField(input, "title"),
      timeMinutes !== undefined
        ? `${formatNumberUk(timeMinutes)} хв`
        : undefined,
    ]);
  },

  add_to_shopping_list: (input) =>
    joinParts([stringField(input, "name"), stringField(input, "quantity")]),

  consume_from_pantry: (input) => stringField(input, "name"),

  set_daily_plan: (input) => {
    const kcal = numberField(input, "kcal");
    const proteinG = numberField(input, "protein_g");
    return joinParts([
      kcal !== undefined ? `${formatNumberUk(kcal)} ккал` : undefined,
      proteinG !== undefined
        ? `${formatNumberUk(proteinG)} г білка`
        : undefined,
    ]);
  },

  suggest_meal: (input) =>
    joinParts([
      mealTypeLabelFor(stringField(input, "meal_type")),
      stringField(input, "focus"),
    ]),

  copy_meal_from_date: (input) => {
    const targetKcal = numberField(input, "target_kcal");
    return joinParts([
      stringField(input, "source_date"),
      targetKcal !== undefined
        ? `${formatNumberUk(targetKcal)} ккал`
        : undefined,
    ]);
  },
  plan_meals_for_day: (input) => {
    const targetKcal = numberField(input, "target_kcal");
    return joinParts([
      stringField(input, "source_date"),
      targetKcal !== undefined
        ? `${formatNumberUk(targetKcal)} ккал`
        : undefined,
    ]);
  },

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

  log_measurement: (input) => {
    const weightKg = numberField(input, "weight_kg");
    const bodyFatPct = numberField(input, "body_fat_pct");
    return joinParts([
      weightKg !== undefined ? `${formatNumberUk(weightKg)} кг` : undefined,
      bodyFatPct !== undefined
        ? `${formatNumberUk(bodyFatPct)}% жиру`
        : undefined,
    ]);
  },

  add_program_day: (input) => {
    const days = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
    const weekday = numberField(input, "weekday");
    const dayName =
      weekday !== undefined && weekday >= 0 && weekday <= 6
        ? (days[weekday] ?? "?")
        : "?";
    return joinParts([dayName, stringField(input, "name")]);
  },

  log_wellbeing: (input) => {
    const sleepHours = numberField(input, "sleep_hours");
    return joinParts([
      sleepHours !== undefined
        ? `${formatNumberUk(sleepHours)} год сну`
        : undefined,
      numberField(input, "energy_level") !== undefined
        ? `енергія ${numberField(input, "energy_level")}/5`
        : undefined,
      numberField(input, "mood_score") !== undefined
        ? `настрій ${numberField(input, "mood_score")}/5`
        : undefined,
    ]);
  },

  log_weight: (input) => {
    const weightKg = numberField(input, "weight_kg");
    return weightKg !== undefined
      ? `${formatNumberUk(weightKg)} кг`
      : undefined;
  },

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
    if (targetWeight !== undefined)
      parts.push(`${formatNumberUk(targetWeight)} кг`);
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

  calculate_1rm: (input) => {
    const weightKg = numberField(input, "weight_kg");
    const reps = numberField(input, "reps");
    return joinParts([
      weightKg !== undefined ? `${formatNumberUk(weightKg)} кг` : undefined,
      reps !== undefined ? `${reps} повт.` : undefined,
    ]);
  },

  convert_units: (input) => {
    const value = numberField(input, "value");
    return joinParts(
      [
        value !== undefined ? `${formatNumberUk(value)}` : undefined,
        stringField(input, "from_unit") && stringField(input, "to_unit")
          ? `${stringField(input, "from_unit")} → ${stringField(input, "to_unit")}`
          : undefined,
      ],
      " ",
    );
  },

  save_note: (input) =>
    stringField(input, "title") || stringField(input, "name"),
  list_notes: (input) =>
    stringField(input, "title") || stringField(input, "name"),

  export_module_data: (input) => {
    const mod = stringField(input, "module");
    return mod ? `Модуль: ${mod}` : "Експорт даних";
  },

  // AI-DANGER: беремо саме `fact`, а не сирий `result`. У результаті
  // виконавця живе технічний id (`…, id:84920a0a-…`) — він потрібен моделі,
  // щоб потім викликати `forget`, але в картці це шум, який користувач
  // читає як збій. Поля `key`/`id` тут стояли помилково: схема `remember`
  // несе `fact` + `category`, тож білдер завжди повертав `undefined` і
  // картка падала у `truncate(result)` — тобто показувала id.
  remember: (input) => stringField(input, "fact"),
  forget: () => "Запис видалено з памʼяті",

  my_profile: () => "Профіль користувача",

  recall_memory: (input) => stringField(input, "query") || "Пошук у памʼяті",
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
