import { CURRENCY } from "../constants.js";

interface Subscription {
  linkedTxId?: string | undefined;
  keyword?: string | undefined;
  currency?: string | undefined;
  /**
   * Очікувана сума в мінорних одиницях (Р20 спеки аналітики v2): середнє
   * з історії списань, записане при підтвердженні пропозиції. Показується,
   * поки немає зіставленої транзакції.
   */
  expectedAmount?: number | undefined;
}

interface Transaction {
  id: string;
  amount: number;
  time?: number | undefined;
  description?: string | undefined;
  currencyCode?: number | undefined;
}

interface AmountMeta {
  amount: number | null;
  currency: string;
  lastTx: Transaction | null;
}

/** Остання релевантна транзакція: спочатку привʼязана вручну, інакше за ключовим словом (найновіша). */
export function getLastTxForSubscription(
  sub: Subscription,
  transactions: Transaction[],
): Transaction | null {
  if (!transactions || !transactions.length) return null;
  const list = [...transactions].sort((a, b) => (b.time || 0) - (a.time || 0));
  if (sub.linkedTxId) {
    const linked = list.find((t) => t.id === sub.linkedTxId);
    if (linked && linked.amount < 0) return linked;
  }
  const kw = (sub.keyword || "").trim().toLowerCase();
  if (!kw) return null;
  return (
    list.find(
      (t) => t.amount < 0 && (t.description || "").toLowerCase().includes(kw),
    ) || null
  );
}

export function getSubscriptionAmountMeta(
  sub: Subscription,
  transactions: Transaction[],
): AmountMeta {
  const lastTx = getLastTxForSubscription(sub, transactions);
  if (!lastTx) {
    const expected = Number(sub.expectedAmount);
    return {
      amount: expected > 0 ? expected / 100 : null,
      currency: sub.currency === "USD" ? "$" : "₴",
      lastTx: null,
    };
  }
  const amount = Math.abs(lastTx.amount / 100);
  const currency = lastTx.currencyCode === CURRENCY.USD ? "$" : "₴";
  return { amount, currency, lastTx };
}
