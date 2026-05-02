// Hex-кольори для inline-стилів, дубль значень з apps/web tailwind.config.js
// (theme.extend.colors.success / danger / warning). Свідомо інлайнимо
// константу тут, щоб пакет `@sergeant/finyk-domain` не тягнув web-only
// залежність на `@shared/lib/themeHex`. Якщо знадобиться більше токенів —
// винесемо в `@sergeant/shared/theme` окремим PR.
const THEME_HEX = {
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#b45309",
} as const;

export interface Debt {
  id: string;
  amount: number;
  linkedTxIds?: string[];
  totalAmount?: number;
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  currency?: string;
  [extra: string]: unknown;
}

export interface Receivable {
  id: string;
  amount: number;
  linkedTxIds?: string[];
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  currency?: string;
  [extra: string]: unknown;
}

export interface Tx {
  id: string;
  amount: number;
}

export interface TxRole {
  kind: "origin" | "payment";
  label: string;
  color: string;
}

function toAmountUAH(tx: Tx): number {
  return Math.abs((tx?.amount || 0) / 100);
}

function findLinkedTx(
  linkedTxIds: readonly string[] = [],
  transactions: readonly Tx[] = [],
): Tx[] {
  const index = new Map(transactions.map((tx) => [tx.id, tx]));
  return linkedTxIds
    .map((id) => index.get(id))
    .filter((tx): tx is Tx => tx !== undefined);
}

export function getDebtTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount > 0
    ? { kind: "origin", label: "📥 Виникнення боргу", color: THEME_HEX.danger }
    : { kind: "payment", label: "✅ Сплата боргу", color: THEME_HEX.success };
}

export function getReceivableTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount < 0
    ? { kind: "origin", label: "📤 Виникнення боргу", color: THEME_HEX.danger }
    : {
        kind: "payment",
        label: "✅ Погашення боргу",
        color: THEME_HEX.success,
      };
}

export function getDebtPaid(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  const linked = findLinkedTx(debt?.linkedTxIds || [], transactions);
  return linked
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + toAmountUAH(tx), 0);
}

export function getDebtOriginated(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  const linked = findLinkedTx(debt?.linkedTxIds || [], transactions);
  return linked
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + toAmountUAH(tx), 0);
}

export function getReceivablePaid(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  const linked = findLinkedTx(receivable?.linkedTxIds || [], transactions);
  return linked
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + toAmountUAH(tx), 0);
}

export function getReceivableOriginated(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  const linked = findLinkedTx(receivable?.linkedTxIds || [], transactions);
  return linked
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + toAmountUAH(tx), 0);
}

export function getDebtEffectiveTotal(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  return Number(debt?.totalAmount || 0) + getDebtOriginated(debt, transactions);
}

export function getReceivableEffectiveTotal(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  return (
    Number(receivable?.amount || 0) +
    getReceivableOriginated(receivable, transactions)
  );
}

export function calcDebtRemaining(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  return Math.max(
    0,
    getDebtEffectiveTotal(debt, transactions) - getDebtPaid(debt, transactions),
  );
}

export function calcReceivableRemaining(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  return Math.max(
    0,
    getReceivableEffectiveTotal(receivable, transactions) -
      getReceivablePaid(receivable, transactions),
  );
}
