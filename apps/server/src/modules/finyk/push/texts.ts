/**
 * Тексти push Фініка (Ф-4 (б)).
 *
 * Тон за `docs/product/copy/style-guide.uk.md`: без крапки в заголовку,
 * лапки «…», без довгого тире, ₴ після числа. Суми є, бо їх показує й
 * сусідній push Monobank (спека § Уже вирішено, «Тексти»). Заголовок
 * дзеркалить рядок «Зараз» на хабі («Завтра спишеться «…»»), щоб push і
 * рядок читались однаково.
 *
 * Відкриття веде на Планування (`/finyk/budgets`): там і картка ліміту, і
 * «Найближчі платежі». Шлях, а не `/?module=finyk`: легасі-параметр хаб
 * перенаправляє на корінь модуля і губить сторінку.
 */

import { formatMoneyFromKopecks } from "@sergeant/shared";
import {
  formatLimitBudgetLabel,
  formatLimitUsedLabel,
} from "@sergeant/finyk-domain/domain/budget";
import type { FinykDueCharge } from "@sergeant/finyk-domain/domain/flowSchedule";
import type { FinykLimitThreshold } from "@sergeant/finyk-domain/domain/limitPush";
import type { LimitBudget } from "@sergeant/finyk-domain/domain/types";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/lib/categories";

import type { PushPayload } from "../../../push/types.js";

export const FINYK_PLANNING_URL = "/finyk/budgets";

/** Скільки платежів називаємо в тілі, решта «ще N». */
const DUE_NAMES_MAX = 3;

/** Підпис ліміту так само, як на картці Планування. */
export function finykLimitLabel(
  budget: Pick<LimitBudget, "label" | "categoryId" | "categoryIds">,
  customCategories: readonly unknown[],
): string {
  return formatLimitBudgetLabel(
    budget,
    (id) => resolveExpenseCategoryMeta(id, customCategories)?.label ?? null,
  );
}

export interface FinykLimitPushInput {
  budgetId: string;
  label: string;
  threshold: FinykLimitThreshold;
  spentMinor: number;
  limitMinor: number;
  pctRaw: number;
  periodKey: string;
}

export function buildFinykLimitPush(input: FinykLimitPushInput): PushPayload {
  const title =
    input.threshold === 100
      ? `Ліміт «${input.label}» перевищено`
      : `Ліміт «${input.label}» майже вичерпано`;
  const body = `${formatMoneyFromKopecks(input.spentMinor)} з ${formatMoneyFromKopecks(
    input.limitMinor,
  )}, ${formatLimitUsedLabel(input.pctRaw)}`;
  return {
    title,
    body,
    // Тег на бюджет і період: 100 % замінює на екрані банер про 80 %.
    tag: `finyk-limit-${input.budgetId}-${input.periodKey}`,
    url: FINYK_PLANNING_URL,
    data: { module: "finyk", kind: "finyk_limit", threshold: input.threshold },
  };
}

const PAYMENT_PLURAL = new Intl.PluralRules("uk-UA");

function paymentsWord(count: number): string {
  const form = PAYMENT_PLURAL.select(count);
  if (form === "one") return "платіж";
  if (form === "few") return "платежі";
  return "платежів";
}

function dueName(charge: FinykDueCharge): string {
  const name = charge.name?.trim();
  if (name) return name;
  return charge.kind === "debt" ? "Борг" : "Підписка";
}

function dueAmount(charge: FinykDueCharge): string | null {
  if (charge.amountMinor === null) return null;
  return formatMoneyFromKopecks(charge.amountMinor, {
    symbol: charge.currency || "₴",
  });
}

/**
 * Push «завтра спишеться». Один платіж: назва в заголовку, сума в тілі.
 * Кілька: кількість у заголовку, назви з сумами в тілі (перші три, далі
 * «ще N»). Платежі вже відсортовані доменом: більша сума першою.
 */
export function buildFinykDuePush(
  charges: readonly FinykDueCharge[],
  dueDayKey: string,
): PushPayload {
  const [first] = charges;
  const common = {
    tag: `finyk-due-${dueDayKey}`,
    url: FINYK_PLANNING_URL,
    data: { module: "finyk", kind: "finyk_due" },
  };
  if (charges.length === 1 && first) {
    const amount = dueAmount(first);
    return {
      ...common,
      title: `Завтра спишеться «${dueName(first)}»`,
      body: amount ? `Сума ${amount}` : "Сума поки невідома",
    };
  }
  const named = charges.slice(0, DUE_NAMES_MAX).map((c) => {
    const amount = dueAmount(c);
    return amount ? `«${dueName(c)}» ${amount}` : `«${dueName(c)}»`;
  });
  const rest = charges.length - named.length;
  return {
    ...common,
    title: `Завтра спишеться ${charges.length} ${paymentsWord(charges.length)}`,
    body: rest > 0 ? `${named.join(", ")}, ще ${rest}` : named.join(", "),
  };
}
