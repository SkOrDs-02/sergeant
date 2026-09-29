/**
 * Amount guard for Finyk chat-action executors that write money fields.
 *
 * AI-CONTEXT: chat tools run on the client (same threat model as the
 * id-guards in `entityLookup.ts`) — there is no server-side validator
 * between the model and the write. A cheap model happily emits
 * `{"limit": "NaN"}`, `{"amount": -500}` or `{"amount": 1e12}`, and an
 * executor that does a bare `Number(x)` writes the garbage and reports
 * success. `updateBudget` already guarded its two amount fields
 * (`Number.isFinite(n) && n > 0`, scope='limit'/'goal'); this hoists that
 * pattern into one place so `setBudgetLimit`, `setMonthlyPlan`,
 * `createDebt` and `createReceivable` get the same guard instead of an
 * unchecked `Number(x)`.
 *
 * The upper bound mirrors `MAX_AMOUNT_HRYVNIA`
 * (`@shared/lib/format/amount.ts`), the same ceiling `MoneyInput` already
 * enforces by default on every manual Finyk money field — budget limit and
 * goal amount (`AddBudgetForm`), the three monthly-plan fields
 * (`MonthlyPlanCard`), and debt/receivable/asset amount (`AssetsForm`).
 * Reusing it here means a model can't write a value the manual form itself
 * would refuse to save (спека beta-input-boundaries).
 */
import { MAX_AMOUNT_HRYVNIA } from "@shared/lib/format/amount";
import { formatNumberUk } from "@sergeant/shared";

export type PositiveAmountResult =
  { ok: true; value: number } | { ok: false; message: string };

/**
 * Validate a hryvnia amount from an LLM tool call: finite, strictly
 * positive (zero is rejected the same as a negative — a budget/debt/plan
 * amount of exactly 0 is not a meaningful entry), and within
 * `MAX_AMOUNT_HRYVNIA`.
 *
 * @param label field name spliced into the rejection, matching the
 *   existing tone (`"Потрібен додатний limit."`) already used by
 *   `updateBudget`.
 */
export function validatePositiveAmount(
  raw: unknown,
  label: string,
): PositiveAmountResult {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: `Потрібен додатний ${label}.` };
  }
  if (value > MAX_AMOUNT_HRYVNIA) {
    return {
      ok: false,
      message: `Сума для ${label} завелика, максимум ${formatNumberUk(MAX_AMOUNT_HRYVNIA)} грн.`,
    };
  }
  return { ok: true, value };
}
