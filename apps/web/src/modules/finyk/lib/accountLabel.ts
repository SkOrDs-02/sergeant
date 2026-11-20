/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Підпис рахунку за ключем `accountKeyOf` (`finyk-domain`): «Готівка на
 * руках», «Без рахунку» або картка з останніми цифрами. Один на Аналітику
 * («За рахунками») і аркуш «Фільтри» в Операціях, щоб рахунок звався
 * однаково в обох місцях.
 */
import { CASH_ACCOUNT_ID } from "@sergeant/finyk-domain/constants";
import { NO_ACCOUNT_KEY } from "@sergeant/finyk-domain/domain/accountBreakdown";
import { messages } from "@shared/i18n/uk";
import { getAccountVisual } from "./accountVisual";

export interface LabelledAccount {
  id?: string | undefined;
  type?: string | undefined;
  creditLimit?: number | undefined;
  maskedPan?: unknown;
}

export function accountLabel(
  key: string,
  accounts: readonly LabelledAccount[],
): string {
  const t = messages.finyk.cashOnHand;
  if (key === CASH_ACCOUNT_ID) return t.title;
  if (key === NO_ACCOUNT_KEY) return t.noAccount;
  const acc = accounts.find((a) => a.id === key);
  if (!acc) return t.cardFallback;
  const pan = Array.isArray(acc.maskedPan)
    ? acc.maskedPan.find((v): v is string => typeof v === "string")
    : undefined;
  const last4 = pan?.replace(/\D/g, "").slice(-4);
  const name = getAccountVisual(acc).name;
  return last4 ? `${name} • ${last4}` : name;
}
