import { CURRENCY, CURRENCY_SYMBOL } from "../constants";
import { formatNumberUk } from "@sergeant/shared";

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
  // Compare by calendar day at midnight, not elapsed milliseconds, so a
  // transaction at 23:50 and a read at 00:10 render as "Вчора", not "Сьогодні".
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d0.getTime()) / 86400000);
  const t = d.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diff === 0) return `Сьогодні, ${t}`;
  if (diff === 1) return `Вчора, ${t}`;
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
