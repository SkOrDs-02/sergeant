import {
  getDebtPaid as debtEngineGetDebtPaid,
  getReceivablePaid,
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
  type Debt,
  type Receivable,
  type Tx as DebtTx,
} from "../domain/debtEngine";

export {
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
};

// Скільки сплачено по боргу (я винен):
// тільки від'ємні транзакції (витрати) = погашення боргу
export function getDebtPaid(
  debt: Debt,
  transactions: readonly DebtTx[] = [],
): number {
  return debtEngineGetDebtPaid(debt, transactions);
}

// Скільки повернено по дебіторці (мені винні):
// тільки позитивні транзакції (надходження) = погашення боргу
export function getRecvPaid(
  recv: Receivable,
  transactions: readonly DebtTx[] = [],
): number {
  return getReceivablePaid(recv, transactions);
}
