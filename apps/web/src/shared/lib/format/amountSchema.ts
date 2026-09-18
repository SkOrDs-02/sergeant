/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Zod-примітив для грошових полів, які RHF тримає як рядок.
 *
 * Форми Фініка зберігають суму в `string` (порожній `Input` природніше
 * описується рядком), тож кожна з них раніше писала власний `refine` з
 * власними правилами. Тут — одна перевірка на всіх, побудована на
 * `parseAmountToMinor`; серверний двійник — `amountMinorSchema` у
 * `@sergeant/shared` (спека beta-input-boundaries).
 */
import { z } from "zod";
import { AMOUNT_ERROR_MESSAGE, parseAmountToMinor } from "./amount";

export interface AmountStringOptions {
  /**
   * Відхиляти дробові суми. Для бюджетів і планів це свідома продуктова
   * вимога (ліміт «1500.5 ₴» читається як помилка вводу), для витрати —
   * ні.
   */
  integerOnly?: boolean | undefined;
}

/**
 * @param requiredMessage повідомлення для порожнього і для недодатного
 *   поля — форми називають його по-різному («Вкажи суму» / «Введи ліміт
 *   більше 0»), і обидва випадки означають для користувача одне: дай
 *   додатне число.
 */
export function amountStringSchema(
  requiredMessage?: string,
  { integerOnly = false }: AmountStringOptions = {},
) {
  return z.string().superRefine((value, ctx) => {
    const parsed = parseAmountToMinor(value);
    if (!parsed.ok) {
      const useCustom =
        requiredMessage &&
        (parsed.error === "empty" || parsed.error === "too-small");
      ctx.addIssue({
        code: "custom",
        message: useCustom
          ? requiredMessage
          : AMOUNT_ERROR_MESSAGE[parsed.error],
      });
      return;
    }
    if (integerOnly && parsed.minor % 100 !== 0) {
      ctx.addIssue({
        code: "custom",
        message: requiredMessage ?? AMOUNT_ERROR_MESSAGE["not-a-number"],
      });
    }
  });
}

/**
 * Гривні для write-path. Схема вже гарантує валідність, тож `0` тут —
 * недосяжна гілка, а не тиха втрата даних.
 */
export function amountStringToHryvnia(value: string): number {
  const parsed = parseAmountToMinor(value);
  return parsed.ok ? parsed.minor / 100 : 0;
}
