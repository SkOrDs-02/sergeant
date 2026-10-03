/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Рівень 3 звʼязки «витрата-борг → пасив»: що робити з привʼязкою платежу,
 * коли людина змінює РОЗПОДІЛ транзакції вже ПІСЛЯ привʼязки.
 *
 * **Чому це окремий модуль, а не гілка в мутації.** Сума привʼязки лежить у
 * `txLinks[txId].amount` знімком у мить привʼязки (докблок `LinkedTxMeta` у
 * `debtEngine.ts`), і `calcDebtRemaining` читає саме її. Зміна спліту знімок
 * не чіпала, тож залишок пасиву розходився з фактом: розписав 300 ₴ на борг,
 * привʼязав, потім переклав на 150 ₴ — пасив і далі вважав сплаченими 300 ₴.
 *
 * **Чому рішення, а не дія.** Модуль нічого не пише. Він лише каже, ЩО
 * сталося, бо два з трьох результатів не можна застосувати мовчки:
 *
 * - `update` — частка змінилась; сума оновлюється, але користувач має
 *   побачити слід (тост), інакше застосунок тихо переписав його привʼязку;
 * - `confirm-unlink` — частки `debt` у сплітах не лишилось узагалі; тут
 *   мовчазне відвʼязування знищило б ручну роботу, тому питаємо;
 * - `none` — нема що робити.
 *
 * Правило модуля «нічого не пишеться мовчки» тут головніше за зручність:
 * саме воно відрізняє рівень 3 від рівня 2 (мовчазний перерахунок), який
 * дав би правильне число ціною невидимої зміни чужих даних.
 */
import type { Debt } from "./debtEngine.js";

/** Категорія-кошик витрат-боргів; нею гейтиться секція привʼязки платежу. */
export const DEBT_CATEGORY_ID = "debt";

/** Мінімальна форма спліту, якої вистачає для рішення. */
export interface DebtSplitLike {
  categoryId?: string | undefined;
  amount?: number | undefined;
}

export interface DebtPaymentSplitSyncInput {
  txId: string;
  /**
   * Повна сума транзакції в гривнях, додатна. Потрібна саме тут, бо
   * `nextSplits === null` (спліт прибрано повністю) означає повернення до
   * повної суми — без неї цей напрямок відкотити неможливо, і рівно через
   * це перерахунок не живе в `setSplitTx`.
   */
  txAmountUAH: number;
  /** Нові спліти; `null` — спліт прибрано повністю. */
  nextSplits: readonly DebtSplitLike[] | null | undefined;
  debts: readonly Debt[];
}

export type DebtPaymentSplitSyncDecision =
  | { kind: "none" }
  | {
      kind: "update";
      debtId: string;
      debtName: string;
      previousAmountUAH: number;
      nextAmountUAH: number;
    }
  | {
      kind: "confirm-unlink";
      debtId: string;
      debtName: string;
      previousAmountUAH: number;
    };

/** Сума часток, розписаних на категорію `debt`. */
export function sumDebtSplitAmountUAH(
  splits: readonly DebtSplitLike[] | null | undefined,
): number | null {
  if (!splits || splits.length === 0) return null;
  return splits
    .filter((split) => split.categoryId === DEBT_CATEGORY_ID)
    .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
}

/** Копійчана рівність: 300.005 і 300.004 — те саме число на екрані. */
function sameMoney(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Який із пасивів тримає цю транзакцію саме як ПЛАТІЖ. Ролі `source` і
 * `increase` живуть на надходженнях, а спліт-редактор рендериться лише для
 * витрат — тож інші ролі рівень 3 не зачіпає.
 */
function findPaymentDebt(
  debts: readonly Debt[],
  txId: string,
): { debt: Debt; amountUAH: number } | null {
  for (const debt of debts) {
    if (!(debt.linkedTxIds ?? []).includes(txId)) continue;
    const meta = debt.txLinks?.[txId];
    if (meta?.role !== "payment") continue;
    return { debt, amountUAH: Math.abs(Number(meta.amount) || 0) };
  }
  return null;
}

export function decideDebtPaymentAfterSplitChange({
  txId,
  txAmountUAH,
  nextSplits,
  debts,
}: DebtPaymentSplitSyncInput): DebtPaymentSplitSyncDecision {
  const linked = findPaymentDebt(debts, txId);
  if (!linked) return { kind: "none" };

  const debtName = linked.debt.name?.trim() || "пасив без назви";
  const splitPortion = sumDebtSplitAmountUAH(nextSplits);

  // Спліт прибрано повністю — уся транзакція знову одна ціла, тож платіж
  // повертається до повної суми.
  const nextAmountUAH =
    splitPortion === null ? Math.abs(txAmountUAH) : splitPortion;

  if (nextAmountUAH <= 0) {
    return {
      kind: "confirm-unlink",
      debtId: linked.debt.id,
      debtName,
      previousAmountUAH: linked.amountUAH,
    };
  }

  if (sameMoney(nextAmountUAH, linked.amountUAH)) return { kind: "none" };

  return {
    kind: "update",
    debtId: linked.debt.id,
    debtName,
    previousAmountUAH: linked.amountUAH,
    nextAmountUAH,
  };
}
