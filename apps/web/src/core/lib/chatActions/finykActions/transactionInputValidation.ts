/**
 * Валідація входу `create_transaction` до будь-якого запису (сервер чи локально).
 *
 * AI-CONTEXT: серверна схема `POST /api/finyk/manual-expenses`
 * (`ManualExpenseCreateSchema` у `@sergeant/shared`) тримає суму ≤
 * `MAX_AMOUNT_MINOR`, нотатку ≤ 500 символів і дату в
 * `[HARD_MIN_DAY_KEY; HARD_MAX_DAY_KEY]` (спека beta-input-boundaries). Локальний
 * фолбек і шлях доходу йдуть повз сервер і ту схему, а `finykChatWrite` потім
 * доносить запис у ту саму таблицю через sync, тож без цієї перевірки один
 * чат-виклик обходив усі три межі. Перевіряємо ДО першого запису, тим самим
 * правилом, що й сервер.
 */
import { validatePositiveAmount } from "./amountValidation";
import {
  DATE_INVALID_MESSAGE,
  classifyDateBound,
} from "@shared/lib/time/dateBounds";
import type { CreateTransactionAction } from "../types";

/**
 * Ліміт опису = `ManualExpenseCreateSchema.note` (`.max(500)`).
 * Дрейф ловить `transactionInputValidation.test.ts`.
 */
export const TRANSACTION_DESCRIPTION_MAX_LEN = 500;

export type TransactionInputCheck =
  { ok: true; amount: number } | { ok: false; message: string };

export function validateTransactionInput(
  input: CreateTransactionAction["input"],
): TransactionInputCheck {
  const { amount, description, date } = input;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, message: "Некоректна сума операції." };
  }
  const bounded = validatePositiveAmount(amt, "операції");
  if (!bounded.ok) return { ok: false, message: bounded.message };

  const desc = typeof description === "string" ? description.trim() : "";
  if (desc.length > TRANSACTION_DESCRIPTION_MAX_LEN) {
    return {
      ok: false,
      message: `Опис задовгий (${desc.length} символів), максимум ${TRANSACTION_DESCRIPTION_MAX_LEN}. Скороти його і спробуй ще раз.`,
    };
  }

  // Формат, що не схожий на YYYY-MM-DD, виконавці й раніше ігнорували
  // (запис іде «сьогодні»); межі перевіряємо лише для календарного ключа.
  if (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    classifyDateBound(date) === "invalid"
  ) {
    return {
      ok: false,
      message: `${DATE_INVALID_MESSAGE} Перевір рік і спробуй ще раз.`,
    };
  }
  return { ok: true, amount: bounded.value };
}
