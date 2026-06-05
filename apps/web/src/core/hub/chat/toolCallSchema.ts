import { z } from "zod";

/**
 * Audit 03 F3 (severity: critical, perspective: security).
 *
 * `useChatSend` accepts `data.tool_calls` from the Anthropic-proxy and feeds
 * each entry straight into `executeActions` — which routes by `name` and
 * destructures `input` into LocalStorage mutators (`create_transaction`,
 * `mark_habit_done`, `log_meal`, `create_habit`, …). Without runtime
 * validation a contract drift between server↔client (or a model that emits
 * `input: null`, `name: 42`, or a missing `id`) reaches the executor and
 * either crashes the turn or performs a mutation with a corrupted payload.
 *
 * This schema is the **structural firewall**: every entry must have
 * `id: string`, `name: string`, `input: object` before any handler runs.
 * Per-tool strict variants below validate mutator payloads before
 * `executeActions` runs — on failure the whole batch is rejected, the user
 * sees a toast, and we fall back to plain-text rendering (no silent mutation
 * with corrupted data).
 *
 * AI-CONTEXT: if `safeParse` fails we DO NOT execute any tool from the batch.
 * The caller surfaces a "Не вдалося виконати дію" toast and falls back to
 * rendering `data.text` (or the raw assistant turn) without mutations.
 */
export const ToolCallEnvelopeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export type ToolCallEnvelope = z.infer<typeof ToolCallEnvelopeSchema>;

export const ToolCallsArraySchema = z.array(ToolCallEnvelopeSchema);

// ─── Per-tool strict input schemas (mutators only) ────────────────────────────
// Read-only tools (search, totals, summaries) are not validated here because
// they cannot corrupt user data; corrupt read-only payloads produce harmless
// empty results. Mutator tools write to LocalStorage, so malformed payloads
// must be caught before the handler fires.

const numOrStr = z.union([z.number(), z.string()]);

// finyk mutators
const CreateTransactionInputSchema = z.object({
  amount: numOrStr,
  type: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
});

const ChangeCategoryInputSchema = z.object({
  tx_id: z.string().min(1),
  category_id: z.string().min(1),
});

const HideTransactionInputSchema = z.object({
  tx_id: z.string().min(1),
});

const SetBudgetLimitInputSchema = z.object({
  category_id: z.string().min(1),
  limit: numOrStr,
});

const SetMonthlyPlanInputSchema = z.object({
  income: numOrStr.nullable().optional(),
  expense: numOrStr.nullable().optional(),
  savings: numOrStr.nullable().optional(),
});

const CreateDebtInputSchema = z.object({
  name: z.string().min(1),
  amount: numOrStr,
  due_date: z.string().optional(),
  emoji: z.string().optional(),
});

const CreateReceivableInputSchema = z.object({
  name: z.string().min(1),
  amount: numOrStr,
});

// routine mutators
const MarkHabitDoneInputSchema = z.object({
  habit_id: z.string().min(1),
  date: z.string().optional(),
});

const CreateHabitInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  recurrence: z.string().optional(),
  weekdays: z.array(z.number()).optional(),
  time_of_day: z.string().optional(),
});

const ArchiveHabitInputSchema = z.object({
  habit_id: z.string().min(1),
  archived: z.boolean().optional(),
});

const EditHabitInputSchema = z.object({
  habit_id: z.string().min(1),
  name: z.string().optional(),
  emoji: z.string().optional(),
  recurrence: z.string().optional(),
  weekdays: z.array(z.number()).optional(),
});

const CompleteHabitForDateInputSchema = z.object({
  habit_id: z.string().min(1),
  date: z.string().min(1),
  completed: z.boolean().optional(),
});

// nutrition mutators
const LogMealInputSchema = z.object({
  name: z.string().optional(),
  kcal: numOrStr.optional(),
  protein_g: numOrStr.optional(),
  fat_g: numOrStr.optional(),
  carbs_g: numOrStr.optional(),
});

const LogWaterInputSchema = z.object({
  amount_ml: numOrStr,
  date: z.string().optional(),
});

const AddToShoppingListInputSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional(),
  note: z.string().optional(),
  category: z.string().optional(),
});

// fizruk mutators
const LogSetInputSchema = z.object({
  exercise_name: z.string().min(1),
  reps: numOrStr,
  weight_kg: numOrStr.optional(),
  sets: numOrStr.optional(),
});

const LogWeightInputSchema = z.object({
  weight_kg: numOrStr,
  date: z.string().optional(),
});

const StartWorkoutInputSchema = z.object({
  note: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
});

// cross mutators
const SaveNoteInputSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
});

const RememberInputSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

/**
 * Audit `2026-05-13-consolidated-page-audit.md` C1 (severity: critical,
 * perspective: security).
 *
 * The envelope firewall above only proves a tool call is *shaped* like
 * `{id, name, input}` — it does not prove the `name` is one this client
 * knows how to dispatch. `executeActions` routes by `name` and its
 * `ChatAction` union ends in a wide-open `{ name: string; ... }` fallback,
 * so a prompt-injected model reply could name an arbitrary tool and have it
 * dispatched with the user's full Better Auth cookie context.
 *
 * This is the **name allow-list**: every dispatchable tool name, mirrored
 * from the `ChatAction` discriminated union in `core/lib/chatActions/types.ts`
 * (and the `ASYNC_CHAT_ACTION_NAMES` set in `serverActions.ts`). A tool call
 * whose `name` is not in this set is rejected — the whole batch is dropped,
 * the caller logs the offending name and falls back to plain-text rendering.
 * Keep this in sync when adding a new tool to the union.
 */
export const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set([
  // finyk
  "change_category",
  "find_transaction",
  "batch_categorize",
  "create_debt",
  "create_receivable",
  "hide_transaction",
  "set_budget_limit",
  "set_monthly_plan",
  "create_transaction",
  "delete_transaction",
  "update_budget",
  "mark_debt_paid",
  "add_asset",
  "import_monobank_range",
  "split_transaction",
  "recurring_expense",
  "export_report",
  // fizruk
  "plan_workout",
  "log_set",
  "start_workout",
  "finish_workout",
  "log_measurement",
  "add_program_day",
  "log_wellbeing",
  "log_weight",
  "suggest_workout",
  "copy_workout",
  "compare_progress",
  "calculate_1rm",
  // routine
  "mark_habit_done",
  "create_habit",
  "create_reminder",
  "complete_habit_for_date",
  "archive_habit",
  "add_calendar_event",
  "edit_habit",
  "reorder_habits",
  "habit_stats",
  "set_habit_schedule",
  "pause_habit",
  "habit_trend",
  // nutrition
  "log_meal",
  "log_water",
  "add_recipe",
  "add_to_shopping_list",
  "consume_from_pantry",
  "set_daily_plan",
  "suggest_meal",
  "copy_meal_from_date",
  "plan_meals_for_day",
  // cross
  "morning_briefing",
  "weekly_summary",
  "set_goal",
  "spending_trend",
  "weight_chart",
  "category_breakdown",
  "detect_anomalies",
  "compare_weeks",
  "convert_units",
  "save_note",
  "list_notes",
  "export_module_data",
  "remember",
  "forget",
  "my_profile",
  // async (server-side) — ASYNC_CHAT_ACTION_NAMES in serverActions.ts
  "recall_memory",
]);

/**
 * Map of tool names to their strict input schema.
 * Tools absent from this map are treated as read-only and pass through
 * after the structural firewall (envelope-level check) succeeds.
 */
const MUTATOR_INPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // finyk
  create_transaction: CreateTransactionInputSchema,
  change_category: ChangeCategoryInputSchema,
  hide_transaction: HideTransactionInputSchema,
  set_budget_limit: SetBudgetLimitInputSchema,
  set_monthly_plan: SetMonthlyPlanInputSchema,
  create_debt: CreateDebtInputSchema,
  create_receivable: CreateReceivableInputSchema,
  // routine
  mark_habit_done: MarkHabitDoneInputSchema,
  create_habit: CreateHabitInputSchema,
  archive_habit: ArchiveHabitInputSchema,
  edit_habit: EditHabitInputSchema,
  complete_habit_for_date: CompleteHabitForDateInputSchema,
  // nutrition
  log_meal: LogMealInputSchema,
  log_water: LogWaterInputSchema,
  add_to_shopping_list: AddToShoppingListInputSchema,
  // fizruk
  log_set: LogSetInputSchema,
  log_weight: LogWeightInputSchema,
  start_workout: StartWorkoutInputSchema,
  // cross
  save_note: SaveNoteInputSchema,
  remember: RememberInputSchema,
};

export function parseToolCalls(
  value: unknown,
): { ok: true; value: ToolCallEnvelope[] } | { ok: false; issues: string[] } {
  // Step 1: structural firewall — envelope shape for all entries.
  const parsed = ToolCallsArraySchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((iss) => `${iss.path.join(".") || "<root>"}: ${iss.message}`);
    return { ok: false, issues };
  }

  // Step 2: name allow-list — reject any tool the client cannot dispatch.
  // A valid envelope is not enough: the name must be one we know, or a
  // prompt-injected reply could invoke an arbitrary action. Unknown names
  // fail the whole batch (caller logs them and falls back to plain text).
  const allIssues: string[] = [];
  for (const tc of parsed.data) {
    if (!KNOWN_TOOL_NAMES.has(tc.name)) {
      allIssues.push(`${tc.name}: unknown tool (not in allow-list)`);
    }
  }
  if (allIssues.length > 0) {
    return { ok: false, issues: allIssues };
  }

  // Step 3: per-tool strict input validation for known mutators.
  for (const tc of parsed.data) {
    const schema = MUTATOR_INPUT_SCHEMAS[tc.name];
    if (!schema) continue; // read-only tool — envelope check is sufficient
    const inputParsed = schema.safeParse(tc.input);
    if (!inputParsed.success) {
      const toolIssues = inputParsed.error.issues
        .slice(0, 3)
        .map(
          (iss) =>
            `${tc.name}.input.${iss.path.join(".") || "<root>"}: ${iss.message}`,
        );
      allIssues.push(...toolIssues);
    }
  }

  if (allIssues.length > 0) {
    return { ok: false, issues: allIssues };
  }

  return { ok: true, value: parsed.data };
}
