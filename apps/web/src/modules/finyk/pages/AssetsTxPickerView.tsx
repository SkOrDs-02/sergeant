/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import { TxRow, type TxRowTx } from "../components/TxRow";
import { Card } from "@shared/components/ui/Card";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
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
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";

type Subscription = {
  id: string;
  name: string;
  emoji?: string | undefined;
  keyword?: string | undefined;
  billingDay?: number | undefined;
  currency?: string | undefined;
  linkedTxId?: string | undefined;
  [extra: string]: unknown;
};

type TxPickerState =
  | { type: "monoDebt"; id: string }
  | { type: "sub"; subId: string }
  | { type: "debt"; id: string }
  | { type: "recv"; id: string };

function transactionInstant(time: number | undefined): number {
  const value = time ?? 0;
  return value > 1_000_000_000_000 ? value : value * 1000;
}

interface AssetsTxPickerViewProps {
  txPicker: TxPickerState;
  setTxPicker: (next: TxPickerState | null) => void;
  accounts: readonly MonoAccount[];
  transactions: readonly TxRowTx[];
  loading?: boolean;
  error?: unknown;
  onRetry?: (() => void) | undefined;
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
  transactions: allTransactions,
  loading = false,
  error,
  onRetry,
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
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [openedAt] = useState(() => Date.now());
  const linkedIds = useMemo(() => {
    if (txPicker.type === "monoDebt") {
      return new Set(monoDebtLinkedTxIds[txPicker.id] ?? []);
    }
    if (txPicker.type === "sub") {
      const linked = subscriptions.find(
        (item) => item.id === txPicker.subId,
      )?.linkedTxId;
      return new Set(linked ? [linked] : []);
    }
    const collection = txPicker.type === "debt" ? manualDebts : receivables;
    return new Set(
      collection.find((item) => item.id === txPicker.id)?.linkedTxIds ?? [],
    );
  }, [manualDebts, monoDebtLinkedTxIds, receivables, subscriptions, txPicker]);
  const monthOptions = useMemo(
    () =>
      [
        ...new Set(
          allTransactions
            .map((item) => {
              const instant = transactionInstant(item.time);
              return instant > 0
                ? new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Europe/Kyiv",
                    year: "numeric",
                    month: "2-digit",
                  }).format(instant)
                : "";
            })
            .filter(Boolean),
        ),
      ]
        .sort()
        .reverse(),
    [allTransactions],
  );
  const transactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const cutoff = openedAt - 90 * 24 * 60 * 60 * 1000;
    const hasRecent = allTransactions.some(
      (item) => transactionInstant(item.time) >= cutoff,
    );
    return allTransactions.filter((item) => {
      const instant = transactionInstant(item.time);
      const itemMonth =
        instant > 0
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/Kyiv",
              year: "numeric",
              month: "2-digit",
            }).format(instant)
          : "";
      const inRange = month
        ? itemMonth === month
        : !hasRecent || instant >= cutoff || linkedIds.has(item.id);
      const haystack =
        `${item.description ?? ""} ${Math.abs(item.amount / 100)}`.toLowerCase();
      return (
        inRange && (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });
  }, [allTransactions, linkedIds, month, openedAt, query]);
  const pickerControls = (
    <div className="mb-3 space-y-2">
      <Input
        type="search"
        aria-label="Пошук транзакцій"
        placeholder="Пошук за описом або сумою"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        aria-label="Період транзакцій"
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        className="input-focus-finyk h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-text"
      >
        <option value="">Останні 90 днів</option>
        {monthOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {loading && allTransactions.length === 0 && (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}
      {Boolean(error) && allTransactions.length === 0 && (
        <Card variant="flat" radius="md" className="space-y-2">
          <p className="text-style-caption text-danger-strong dark:text-danger">
            Не вдалося завантажити транзакції.
          </p>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              Повторити
            </Button>
          )}
        </Card>
      )}
      {!loading && !error && transactions.length === 0 && (
        <p
          className="py-6 text-center text-style-caption text-subtle"
          role="status"
        >
          {query.trim()
            ? "За цим пошуком транзакцій немає."
            : "За вибраний період транзакцій немає."}
        </p>
      )}
    </div>
  );
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
          <span className="text-style-label">Погашення: {label}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
            <Card variant="flat" radius="md" className="mb-3">
              <div className="text-xs text-subtle mb-1">{label}</div>
              <div className="text-style-hero text-danger-strong dark:text-danger">
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
            {pickerControls}
            {transactions.map((t, i) => {
              const isLinked = linkedIds.includes(t.id);
              const suggested = isSuggested(t);
              return (
                <div key={i}>
                  {suggested && !isLinked && (
                    <div className="text-style-caption font-semibold text-success-strong dark:text-success px-1 pt-1">
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
          <span className="text-style-label">Транзакція для «{sub.name}»</span>
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
                    className="block mt-2 text-style-label text-danger-strong dark:text-danger hover:underline"
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
            {pickerControls}
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
                      // Kyiv-local day-of-month so subscription billing day
                      // stays anchored to Europe/Kyiv, not the host clock.
                      const bd = getKyivDateParts(
                        new Date(transactionInstant(t.time)),
                      ).day;
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
        <span className="text-style-label">
          {isDebt ? "Транзакції по пасиву" : "Транзакції по активу"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
          <Card variant="flat" radius="md" className="mb-4">
            <div className="text-xs text-subtle">
              {item?.emoji} {item?.name}
            </div>
            <p className="text-xs text-subtle mt-2 leading-relaxed">
              Обери транзакції, які належать цьому запису. Привʼязані транзакції
              враховуються в сумі сплаченого та позначаються роллю платежу.
            </p>
            <div
              className={cn(
                "text-style-hero mt-1",
                isDebt
                  ? "text-danger-strong dark:text-danger"
                  : "text-success-strong dark:text-success",
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
          {pickerControls}
          {transactions.map((t, i) => {
            const isLinked = linked.includes(t.id);
            const role = isLinked ? getTxRole(t) : null;
            return (
              <div key={i}>
                {isLinked && role && (
                  <div
                    className="text-style-caption px-1 py-1"
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
