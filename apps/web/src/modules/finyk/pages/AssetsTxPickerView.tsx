/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import { TxRow, type TxRowTx } from "../components/TxRow";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { getAccountLabel, getMonoDebt } from "../utils";
import type {
  Debt,
  LinkedTxRole,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import {
  classifyMonoCardLink,
  isSuggestedMonoCardRepayment,
  sumMonoCardPaid,
} from "@sergeant/finyk-domain/domain/monoCardDebt";
import { AssetsDebtTxPicker } from "./AssetsDebtTxPicker";
import {
  buildMonthOptions,
  useLinkableTransactions,
} from "../hooks/useLinkableTransactions";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { Input } from "@shared/components/ui/Input";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";

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
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
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
 *    transaction shows its role above the row; the label comes from
 *    `describeLinkedTxRole`, the tone from `ROLE_TONE` in
 *    `AssetsDebtTxPicker.tsx`. (Раніше тут стояло «tinted by
 *    `getDebtTxRole` / `getReceivableTxRole`» — ці дві функції тон ніколи
 *    не задавали, і колір домен більше не віддає взагалі.)
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
  setLinkedTxRole,
  showBalance,
  customCategories,
}: AssetsTxPickerViewProps) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  // AI-CONTEXT: `mono.transactions` (проп) — це навмисно лише поточний
  // календарний місяць (див. `useMonobankWebhook`). Пікер тягне свій,
  // ширший діапазон, інакше напис «Останні 90 днів» бреше: 3-го числа під
  // ним видно 7 операцій.
  const linkable = useLinkableTransactions({
    month,
    enabled: true,
    base: allTransactions as never,
  });
  const sourceTransactions = linkable.transactions as readonly TxRowTx[];
  const isLoading = loading || linkable.loading;
  const loadError = error ?? linkable.error;
  const retry = onRetry ?? linkable.refetch;
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
  // Опції періоду будуються з календаря, а не з уже завантажених даних —
  // інакше селект пропонує рівно той місяць, який і так видно.
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  // Діапазон уже відфільтрував сервер — тут лишається тільки пошук
  // і локальні (ручні) записи поза вибраним місяцем.
  const transactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sourceTransactions
      .filter((item) => {
        const instant = transactionInstant(item.time);
        const itemMonth =
          instant > 0
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Kyiv",
                year: "numeric",
                month: "2-digit",
              }).format(instant)
            : "";
        const inRange = month ? itemMonth === month : true;
        const haystack =
          `${item.description ?? ""} ${Math.abs(item.amount / 100)}`.toLowerCase();
        return (
          (inRange || linkedIds.has(item.id)) &&
          (!normalizedQuery || haystack.includes(normalizedQuery))
        );
      })
      .sort((a, b) => transactionInstant(b.time) - transactionInstant(a.time));
  }, [sourceTransactions, linkedIds, month, query]);
  const pickerControls = (
    <div className="mb-3 space-y-2">
      <Input
        type="search"
        aria-label="Пошук транзакцій"
        {...searchFieldProps("transactions-search")}
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
      {isLoading && sourceTransactions.length === 0 && (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}
      {Boolean(loadError) && sourceTransactions.length === 0 && (
        <Card variant="flat" radius="md" className="space-y-2">
          <p className="text-style-caption text-danger-strong dark:text-danger">
            Не вдалося завантажити транзакції.
          </p>
          <Button size="sm" onClick={retry}>
            Повторити
          </Button>
        </Card>
      )}
      {!isLoading && !loadError && transactions.length === 0 && (
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
              className="inline-flex items-center gap-1 text-style-label text-muted hover:text-text transition-colors"
            >
              <Icon name="chevron-left" size="sm" />
              Назад
            </button>
          </div>
        </div>
      );
    }
    const linkedIds = monoDebtLinkedTxIds[txPicker.id] || [];
    // AI-CONTEXT: рахуємо по `allTransactions` — проп зі стану сторінки
    // (поточний місяць + ручні записи), а НЕ по `transactions` і не по
    // `sourceTransactions`. Перший звужений пошуком, другий — вибраним
    // періодом, тож обидва змушували б суму стрибати від відкритого
    // фільтра. `allTransactions` не залежить ні від того, ні від іншого,
    // і рівно він відповідає підпису «Погашено цього місяця» — та сама
    // множина, що живить `AssetsLiabilitiesSection`, тож два екрани
    // показують одне число. Правило погашення — канонічне в
    // `@sergeant/finyk-domain` (дубль із секцією пасивів знято).
    const paid = sumMonoCardPaid(allTransactions, linkedIds, txPicker.id);
    const remaining = getMonoDebt(account);
    const total = paid + remaining;
    const label = getAccountLabel(account);

    const isSuggested = (t: TxRowTx) =>
      isSuggestedMonoCardRepayment(t, txPicker.id);

    const monoLinkKind = (t: TxRowTx) => classifyMonoCardLink(t, txPicker.id);
    const monoLinkLabel = (t: TxRowTx) => {
      const copy = messages.finyk.monoCardLink;
      const kind = monoLinkKind(t);
      if (kind === "repayment") return copy.repayment;
      return kind === "card-purchase" ? copy.cardPurchase : copy.otherIncome;
    };

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
          <button
            onClick={() => setTxPicker(null)}
            className="inline-flex items-center gap-1 text-style-label text-muted hover:text-text transition-colors"
          >
            <Icon name="chevron-left" size="sm" />
            Назад
          </button>
          <span className="text-style-label">Погашення: {label}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
            <Card variant="flat" radius="md" className="mb-3">
              <div className="text-style-caption text-subtle mb-1">{label}</div>
              <div className="text-style-headline text-danger-strong dark:text-danger">
                <Money amount={-Math.round(remaining)} tone="inherit" /> залишок
                боргу
              </div>
              <div className="text-style-caption text-subtle mt-1">
                {/* Обидва числа з символом: це не пара «X з Y», а два
                    самостійні факти через «·». Символ опускають лише там,
                    де числа читаються одним виразом (див. «Сплачено X з Y»
                    в `AssetsDebtTxPicker`). */}
                Погашено цього місяця: <Money amount={Math.round(paid)} /> ·
                Базовий борг: <Money amount={Math.round(total)} />
              </div>
              <div className="h-1.5 bg-line rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-danger rounded-full transition-[width,background-color] duration-slower"
                  style={{
                    width: `${total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0}%`,
                  }}
                />
              </div>
            </Card>
            <p className="text-style-caption text-subtle mb-3 px-1">
              Тапни транзакцію щоб привʼязати як погашення. Виділені зеленим:
              автоматично виявлені поповнення картки.
            </p>
            {pickerControls}
            {transactions.map((t, i) => {
              const isLinked = linkedIds.includes(t.id);
              const suggested = isSuggested(t);
              return (
                <div key={i}>
                  {suggested && !isLinked && (
                    <div className="inline-flex items-center gap-1 text-style-caption font-semibold text-success-strong dark:text-success px-1 pt-1">
                      <Icon name="arrow-up" size="sm" />
                      Поповнення картки
                    </div>
                  )}
                  {isLinked && (
                    // Галочка `TxRow` лише каже «привʼязано». Що саме
                    // привʼязка зробила — тут: покупка по картці й рух на
                    // чужому рахунку в суму погашеного не йдуть, і мовчати
                    // про це означало б обіцяти неіснуючий внесок.
                    <div
                      className={cn(
                        "text-style-caption font-semibold px-1 pt-1",
                        monoLinkKind(t) === "repayment"
                          ? "text-success-strong dark:text-success"
                          : "text-warning-strong dark:text-warning",
                      )}
                    >
                      {monoLinkLabel(t)}
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
              className="inline-flex items-center gap-1 text-style-label text-muted hover:text-text transition-colors"
            >
              <Icon name="chevron-left" size="sm" />
              Назад
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
            className="inline-flex items-center gap-1 text-style-label text-muted hover:text-text transition-colors"
          >
            <Icon name="chevron-left" size="sm" />
            Назад
          </button>
          <span className="text-style-label">Транзакція для «{sub.name}»</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
            <Card variant="flat" radius="md" className="mb-4">
              <p className="text-style-caption text-subtle leading-relaxed">
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
            className="inline-flex items-center gap-1 text-style-label text-muted hover:text-text transition-colors"
          >
            <Icon name="chevron-left" size="sm" />
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <AssetsDebtTxPicker
      kind={isDebt ? "debt" : "receivable"}
      item={item}
      transactions={transactions}
      allTransactions={sourceTransactions}
      setLinkedTxRole={setLinkedTxRole}
      showBalance={showBalance}
      {...(customCategories ? { customCategories } : {})}
      controls={pickerControls}
      onBack={() => setTxPicker(null)}
    />
  );
}
