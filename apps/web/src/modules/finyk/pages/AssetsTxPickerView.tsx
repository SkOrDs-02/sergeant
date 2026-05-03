import { TxRow, type TxRowTx } from "../components/TxRow";
import { Card } from "@shared/components/ui/Card";
import {
  getAccountLabel,
  getMonoDebt,
  getDebtPaid,
  getRecvPaid,
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
} from "../utils";
import {
  getDebtTxRole,
  getReceivableTxRole,
  type Debt,
  type Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { cn } from "@shared/lib/ui/cn";

type Subscription = {
  id: string;
  name: string;
  emoji?: string;
  keyword?: string;
  billingDay?: number;
  currency?: string;
  linkedTxId?: string;
  [extra: string]: unknown;
};

type TxPickerState =
  | { type: "monoDebt"; id: string }
  | { type: "sub"; subId: string }
  | { type: "debt"; id: string }
  | { type: "recv"; id: string };

interface AssetsTxPickerViewProps {
  txPicker: TxPickerState;
  setTxPicker: (next: TxPickerState | null) => void;
  accounts: readonly MonoAccount[];
  transactions: readonly TxRowTx[];
  monoDebtLinkedTxIds: Record<string, string[]>;
  toggleMonoDebtTx: (accountId: string, txId: string) => void;
  subscriptions: readonly Subscription[];
  updateSubscription: (subId: string, patch: Record<string, unknown>) => void;
  manualDebts: readonly Debt[];
  receivables: readonly Receivable[];
  toggleLinkedTx: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
  ) => void;
  showBalance: boolean;
  customCategories?: readonly CustomCategoryInput[];
}

/**
 * Sub-screen rendered by the Assets page when the user enters a
 * transaction-linking flow. Three modes share the same back-button +
 * scrolling list shell:
 *
 *  - `monoDebt` — repayment linking for a Mono credit card. Suggested
 *    rows (positive amount on the same account) get a green eyebrow.
 *  - `sub` — subscription → recurring expense linking. Tapping a row
 *    sets `linkedTxId` + `billingDay` from that transaction's day.
 *  - `debt` / `receivable` — manual debt or receivable. Each linked
 *    transaction shows its role (charge / payment / partial) above the
 *    row tinted by `getDebtTxRole` / `getReceivableTxRole`.
 *
 * The host page mounts this view as a full-screen overlay (header is
 * sticky, content scrolls) instead of the regular Assets layout — the
 * caller switches by checking `txPicker !== null` and rendering one or
 * the other.
 */
export function AssetsTxPickerView({
  txPicker,
  setTxPicker,
  accounts,
  transactions,
  monoDebtLinkedTxIds,
  toggleMonoDebtTx,
  subscriptions,
  updateSubscription,
  manualDebts,
  receivables,
  toggleLinkedTx,
  showBalance,
  customCategories,
}: AssetsTxPickerViewProps) {
  if (txPicker.type === "monoDebt") {
    const account = accounts.find((a) => a.id === txPicker.id);
    if (!account) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
            <button
              type="button"
              onClick={() => setTxPicker(null)}
              className="text-sm text-muted hover:text-text transition-colors"
            >
              ← Назад
            </button>
          </div>
        </div>
      );
    }
    const linkedIds = monoDebtLinkedTxIds[txPicker.id] || [];
    const paid = transactions
      .filter((t) => linkedIds.includes(t.id))
      .reduce((s, t) => s + Math.abs(t.amount / 100), 0);
    const remaining = getMonoDebt(account);
    const total = paid + remaining;
    const label = getAccountLabel(account);

    const isSuggested = (t: TxRowTx) =>
      t._accountId === txPicker.id && t.amount > 0;

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
          <button
            onClick={() => setTxPicker(null)}
            className="text-sm text-muted hover:text-text transition-colors"
          >
            ← Назад
          </button>
          <span className="text-sm font-bold">Погашення: {label}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
            <Card variant="flat" radius="md" className="mb-3">
              <div className="text-xs text-subtle mb-1">{label}</div>
              <div className="text-style-hero text-danger">
                −
                {remaining.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴ залишок боргу
              </div>
              <div className="text-xs text-subtle mt-1">
                Погашено цього місяця:{" "}
                {paid.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ ·
                Базовий борг:{" "}
                {total.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
              </div>
              <div className="h-1.5 bg-line rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-danger rounded-full transition-[width,background-color] duration-500"
                  style={{
                    width: `${total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0}%`,
                  }}
                />
              </div>
            </Card>
            <p className="text-xs text-subtle mb-3 px-1">
              Тапни транзакцію щоб прив&apos;язати як погашення. Виділені
              зеленим — автоматично виявлені поповнення картки.
            </p>
            {transactions.map((t, i) => {
              const isLinked = linkedIds.includes(t.id);
              const suggested = isSuggested(t);
              return (
                <div key={i}>
                  {suggested && !isLinked && (
                    <div className="text-2xs font-semibold text-success px-1 pt-1">
                      ↑ Поповнення картки
                    </div>
                  )}
                  <TxRow
                    tx={t}
                    highlighted={isLinked}
                    onClick={() => toggleMonoDebtTx(txPicker.id, t.id)}
                    accounts={accounts}
                    hideAmount={!showBalance}
                    customCategories={customCategories}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (txPicker.type === "sub") {
    const sub = subscriptions.find(
      (s) => s.id === (txPicker as { subId: string }).subId,
    );
    if (!sub) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
            <button
              type="button"
              onClick={() => setTxPicker(null)}
              className="text-sm text-muted hover:text-text transition-colors"
            >
              ← Назад
            </button>
          </div>
        </div>
      );
    }
    const linkedId = sub.linkedTxId;
    const expenses = transactions
      .filter((t) => t.amount < 0)
      .slice()
      .sort((a, b) => (b.time || 0) - (a.time || 0));
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
          <button
            type="button"
            onClick={() => setTxPicker(null)}
            className="text-sm text-muted hover:text-text transition-colors"
          >
            ← Назад
          </button>
          <span className="text-sm font-bold">Транзакція для «{sub.name}»</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
            <Card variant="flat" radius="md" className="mb-4">
              <p className="text-xs text-subtle leading-relaxed">
                Обери списання (наприклад через Apple/Google). День місяця з
                транзакції підставиться в «день списання»; сума піде в огляд і в
                Рутину.
                {linkedId && (
                  <button
                    type="button"
                    className="block mt-2 text-style-label text-danger hover:underline"
                    onClick={() => {
                      updateSubscription(sub.id, { linkedTxId: null });
                      setTxPicker(null);
                    }}
                  >
                    Зняти привʼязку
                  </button>
                )}
              </p>
            </Card>
            {expenses.map((t, i) => {
              const isLinked = linkedId === t.id;
              return (
                <TxRow
                  key={t.id || i}
                  tx={t}
                  highlighted={isLinked}
                  customCategories={customCategories}
                  onClick={() => {
                    if (isLinked) {
                      updateSubscription(sub.id, { linkedTxId: null });
                    } else {
                      const bd = new Date((t.time || 0) * 1000).getDate();
                      updateSubscription(sub.id, {
                        linkedTxId: t.id,
                        billingDay: bd,
                      });
                    }
                    setTxPicker(null);
                  }}
                  accounts={accounts}
                  hideAmount={!showBalance}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Manual debt / receivable linking ---
  const isDebt = txPicker.type === "debt";
  const items: readonly (Debt | Receivable)[] = isDebt
    ? manualDebts
    : receivables;
  const item = items.find((d) => d.id === (txPicker as { id: string }).id);
  if (!item) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
          <button
            type="button"
            onClick={() => setTxPicker(null)}
            className="text-sm text-muted hover:text-text transition-colors"
          >
            ← Назад
          </button>
        </div>
      </div>
    );
  }
  const linked = item.linkedTxIds || [];
  const paid = isDebt
    ? getDebtPaid(item as Debt, transactions as TxRowTx[])
    : getRecvPaid(item as Receivable, transactions as TxRowTx[]);
  const total = isDebt
    ? getDebtEffectiveTotal(item as Debt, transactions as TxRowTx[])
    : getReceivableEffectiveTotal(
        item as Receivable,
        transactions as TxRowTx[],
      );
  const remaining = isDebt
    ? calcDebtRemaining(item as Debt, transactions as TxRowTx[])
    : calcReceivableRemaining(item as Receivable, transactions as TxRowTx[]);
  const getTxRole = (tx: TxRowTx) =>
    isDebt ? getDebtTxRole(tx) : getReceivableTxRole(tx);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
        <button
          onClick={() => setTxPicker(null)}
          className="text-sm text-muted hover:text-text transition-colors"
        >
          ← Назад
        </button>
        <span className="text-sm font-bold">
          {isDebt ? "Транзакції по пасиву" : "Транзакції по активу"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
          <Card variant="flat" radius="md" className="mb-4">
            <div className="text-xs text-subtle">
              {item?.emoji} {item?.name}
            </div>
            <div
              className={cn(
                "text-style-hero mt-1",
                isDebt ? "text-danger" : "text-success",
              )}
            >
              {isDebt ? "−" : "+"}
              {remaining.toLocaleString("uk-UA")} ₴ залишок
            </div>
            <div className="text-xs text-subtle mt-1">
              Сплачено: {paid.toLocaleString("uk-UA")} з{" "}
              {total?.toLocaleString("uk-UA")} ₴
            </div>
          </Card>
          {transactions.map((t, i) => {
            const isLinked = linked.includes(t.id);
            const role = isLinked ? getTxRole(t) : null;
            return (
              <div key={i}>
                {isLinked && role && (
                  <div
                    className="text-xs font-bold px-1 py-1"
                    style={{ color: role.color }}
                  >
                    {role.label}
                  </div>
                )}
                <TxRow
                  tx={t}
                  highlighted={isLinked}
                  onClick={() =>
                    toggleLinkedTx(
                      (txPicker as { id: string }).id,
                      t.id,
                      (txPicker as { type: "debt" | "receivable" }).type,
                    )
                  }
                  hideAmount={!showBalance}
                  customCategories={customCategories}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
