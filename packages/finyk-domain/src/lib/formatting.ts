import { CURRENCY, CURRENCY_SYMBOL } from "../constants";
import { formatNumberUk, toKyivISODate } from "@sergeant/shared";

export function fmtAmt(
  amount: number,
  cc: number = CURRENCY.UAH as number,
): string {
  const v = amount / 100;
  const sym = CURRENCY_SYMBOL[cc] ?? "₴";
  return `${v > 0 ? "+" : ""}${formatNumberUk(v, { minimumFractionDigits: 2 })}${sym}`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  // Domain invariant: financial periods are Europe/Kyiv-anchored. Compare
  // Kyiv calendar-day keys, not the device clock's midnight, otherwise
  // the same transaction can read "Сьогодні" on one card and "Вчора" on
  // another depending on which helper rendered it (§1.24 audit finding;
  // mirrors `formatStickyDayLabel` in transactionsLib.ts).
  const dayKey = toKyivISODate(d);
  const todayKey = toKyivISODate(Date.now());
  const yesterdayKey = toKyivISODate(Date.now() - 86400000);
  const t = d.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dayKey === todayKey) return `Сьогодні, ${t}`;
  if (dayKey === yesterdayKey) return `Вчора, ${t}`;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
}

interface Account {
  type?: string | undefined;
  creditLimit?: number | undefined;
}

/**
 * Підпис рахунку. До 2026-08-21 кожна гілка несла емодзі-префікс
 * («🖤 Чорна картка»), тож поверхні, які малювали справжню іконку, мали
 * власний емодзі-вільний дублікат цієї таблиці
 * (`apps/web/.../lib/accountVisual.ts`), а ті, що не знали про нього,
 * показували системний гліф. Тут лишається лише текст; іконку бере
 * `getAccountVisual`.
 */
export function getAccountLabel(acc: Account): string {
  if (acc.type === "eAid") return "Єпідтримка";
  if (acc.creditLimit && acc.creditLimit > 0 && acc.type === "black")
    return "Кредитна картка";
  if (acc.creditLimit && acc.creditLimit > 0) return "Кредит";
  if (acc.type === "black") return "Чорна картка";
  if (acc.type === "white") return "Біла картка";
  if (acc.type === "platinum") return "Платинова";
  if (acc.type === "iron") return "Залізна";
  if (acc.type === "fop") return "ФОП";
  return "Картка";
}
