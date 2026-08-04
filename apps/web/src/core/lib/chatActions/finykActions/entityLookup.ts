/**
 * Existence checks for Finyk entity ids that arrive from LLM tool calls.
 *
 * AI-CONTEXT: chat tools are executed by the **client**, so there is no
 * server-side validator between the model and the write. Cheap models
 * confidently invent ids (measured: `mark_habit_done({"habit_id":
 * "habit_morning_workout_123"})`), and an unvalidated write lands a
 * phantom override that no screen ever renders while the model reports
 * success. Same failure mode as QA D-005 in `routineActions.ts` —
 * validate first, return a Ukrainian error string as `tool_result`, and
 * let the model correct itself.
 *
 * Reads go through the same sources the read-tools use (SQLite warm cache
 * for manual expenses / custom categories, Mono mirror for bank rows), so
 * an id the model could legitimately have seen always resolves.
 */
import { INCOME_CATEGORIES, MCC_CATEGORIES } from "@finyk/constants";
import { getVisibleFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";

/**
 * Normalize an id echoed back by the model. List/query results render
 * entities as `Name (id:m_1)`, and models routinely copy the `id:`
 * prefix into the next tool call.
 */
export function normalizeFinykId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^id:\s*/i, "")
    .trim();
}

/** True when `id` matches a manual expense or a mirrored bank transaction. */
export function finykTransactionExists(id: string): boolean {
  if (!id) return false;
  const manual = getCachedFinykSqliteState().manualExpenses;
  if (manual.some((tx) => String(tx.id ?? "") === id)) return true;
  return getVisibleFinykMonoMirrorState().transactions.some(
    (tx) => String(tx.id ?? "") === id,
  );
}

/** True when `id` matches a built-in (expense or income) or custom category. */
export function finykCategoryExists(id: string): boolean {
  if (!id) return false;
  if (MCC_CATEGORIES.some((c) => c.id === id)) return true;
  if (INCOME_CATEGORIES.some((c) => c.id === id)) return true;
  return getCachedFinykSqliteState().customCategories.some((c) => c.id === id);
}

export function unknownTransactionMessage(id: string): string {
  return `Не знайшов транзакцію "${id}" — знайди її через find_transaction і візьми id звідти.`;
}

export function unknownCategoryMessage(id: string): string {
  return `Не знайшов категорію "${id}" — перевір список категорій і візьми id звідти.`;
}
