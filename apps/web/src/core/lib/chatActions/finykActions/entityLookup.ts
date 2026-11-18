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
import { resolveManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";
import { getVisibleFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { formatNumberUk } from "@sergeant/shared";

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

/**
 * Сума витрати `id` у гривнях (без знака) або `null`, якщо це не витрата.
 * Ручний запис тримає гривні й напрям у `kind`/`type`, банківський рядок —
 * копійки зі знаком.
 */
export function finykExpenseAmountUah(id: string): number | null {
  const manual = getCachedFinykSqliteState().manualExpenses.find(
    (tx) => String(tx.id ?? "") === id,
  );
  if (manual) {
    if (resolveManualExpenseKind(manual) !== "expense") return null;
    const amount = Math.abs(Number(manual.amount));
    return Number.isFinite(amount) ? amount : null;
  }
  const bank = getVisibleFinykMonoMirrorState().transactions.find(
    (tx) => String(tx.id ?? "") === id,
  );
  const amount = Number(bank?.amount);
  return Number.isFinite(amount) && amount < 0 ? Math.abs(amount) / 100 : null;
}

/**
 * Людський підпис операції для результату виконавця: `«Кава» на 120 грн`,
 * `на 120 грн` (без опису) або `""` (операції не знайдено).
 *
 * AI-CONTEXT (перевірка першої хвилі 2026-11-18): change_category,
 * hide/delete/split_transaction рапортували лише id (`Операцію m_… видалено`),
 * і людина бачила той id у картці дії й у тості. Сам id лишається моделі в
 * `(id:…)`, а показ вирізає його (`core/lib/chatDisplayText.ts`). Рахувати
 * треба ДО запису: після `delete_transaction` операції в кеші вже нема.
 */
export function finykTransactionLabel(id: string): string {
  if (!id) return "";
  const manual = getCachedFinykSqliteState().manualExpenses.find(
    (tx) => String(tx.id ?? "") === id,
  );
  if (manual) return describeTx(manual.description, Number(manual.amount));
  const bank = getVisibleFinykMonoMirrorState().transactions.find(
    (tx) => String(tx.id ?? "") === id,
  );
  if (!bank) return "";
  return describeTx(
    bank.merchant || bank.description,
    Number(bank.amount) / 100,
  );
}

function describeTx(description: unknown, amountUah: number): string {
  const desc = typeof description === "string" ? description.trim() : "";
  const amount = Number.isFinite(amountUah)
    ? `на ${formatNumberUk(Math.abs(amountUah))} грн`
    : "";
  return [desc ? `«${desc}»` : "", amount].filter(Boolean).join(" ");
}

/** True when `id` matches a built-in (expense or income) or custom category. */
export function finykCategoryExists(id: string): boolean {
  if (!id) return false;
  if (MCC_CATEGORIES.some((c) => c.id === id)) return true;
  if (INCOME_CATEGORIES.some((c) => c.id === id)) return true;
  return getCachedFinykSqliteState().customCategories.some((c) => c.id === id);
}

export function unknownTransactionMessage(id: string): string {
  return `Не знайшов операцію (id:${id}), знайди її через find_transaction і візьми id звідти.`;
}

export function unknownCategoryMessage(id: string): string {
  return `Не знайшов категорію (id:${id}), перевір список категорій і візьми id звідти.`;
}
