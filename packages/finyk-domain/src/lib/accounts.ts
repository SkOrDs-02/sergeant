import { CURRENCY } from "../constants";

export interface MonoAccount {
  id?: string | undefined;
  // The Mono webhook may surface accounts before balance has propagated
  // (and the privatbank merge in `useUnifiedFinanceData` reuses this
  // shape with optional balance), so this field is optional. Helpers
  // below treat a missing balance as `0`.
  balance?: number | undefined;
  creditLimit?: number | undefined;
  currencyCode?: number | undefined;
  type?: string | undefined;
  [k: string]: unknown;
}

export function getMonoDebt(acc: MonoAccount): number {
  const creditLimit = acc.creditLimit ?? 0;
  const balance = acc.balance ?? 0;
  if (creditLimit > 0) return Math.max(0, (creditLimit - balance) / 100);
  if (balance < 0) return Math.abs(balance) / 100;
  return 0;
}

/**
 * "Власні кошти" на рахунку — те, що лишається понад кредитний ліміт.
 * Для звичайних карток (без `creditLimit`) дорівнює `balance` без змін;
 * для кредиток — `max(0, balance - creditLimit)`, тобто 0, доки картка
 * "в мінусі" відносно ліміту (сам борг тоді живе окремо в
 * `getMonoDebt`/`isMonoDebt` і потрапляє в «Пасиви», не в «Активи»).
 * Одиниці — копійки (як і `balance`), не ділені на 100.
 */
export function getMonoOwnFunds(acc: MonoAccount): number {
  const creditLimit = acc.creditLimit ?? 0;
  const balance = acc.balance ?? 0;
  if (creditLimit > 0) return Math.max(0, balance - creditLimit);
  return balance;
}

export function isMonoDebt(acc: MonoAccount): boolean {
  const creditLimit = acc.creditLimit ?? 0;
  const balance = acc.balance ?? 0;
  if (creditLimit > 0) return creditLimit - balance > 0;
  // Дебетова картка у мінусі (овердрафт / реверс комісії) — теж борг.
  // До фіксу ця гілка `getMonoDebt` була недосяжна з `getMonoTotals`,
  // бо `isMonoDebt` вимагав `creditLimit > 0`, і відʼємні дебетові
  // баланси мовчки не йшли у networth.
  return balance < 0;
}

export function daysUntil(day: number): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), day);
  if (target <= now) target.setMonth(target.getMonth() + 1);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function getMonoTotals(
  accounts: MonoAccount[],
  hiddenAccountIds: string[] = [],
): { balance: number; debt: number } {
  const visible = accounts.filter(
    (a) => !(a.id !== undefined && hiddenAccountIds.includes(a.id)),
  );
  // Кредитки більше не виключені з balance — власні кошти зверху ліміту
  // (getMonoOwnFunds) враховуються в капітал, лише сам борг (creditLimit -
  // balance, коли додатний) лишається виключно в debt/«Пасиви» нижче.
  const balance = visible
    .filter((a) => a.currencyCode === (CURRENCY.UAH as number))
    .reduce((sum, a) => {
      const ownFunds = getMonoOwnFunds(a);
      return ownFunds > 0 ? sum + ownFunds / 100 : sum;
    }, 0);
  // Приховані рахунки виключаємо і з balance, і з debt —
  // інакше при схованій кредитці `networth = balance - debt` займає
  // її борг, а сама кредитка не видна у списку.
  const debt = visible
    .filter((a) => isMonoDebt(a))
    .reduce((sum, a) => sum + getMonoDebt(a), 0);
  return { balance, debt };
}
