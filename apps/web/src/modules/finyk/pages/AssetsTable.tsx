import { DebtCard } from "../components/DebtCard";
import { SubCard } from "../components/SubCard";
import { RecurringSuggestions } from "../components/RecurringSuggestions";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import {
  getMonoDebt,
  getDebtPaid,
  getRecvPaid,
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
} from "../utils";
import { getAccountVisual } from "../lib/accountVisual";
import { cn } from "@shared/lib/ui/cn";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { FinykStatsStrip } from "../components/FinykStatsStrip";
import {
  AssetsLiabilitiesBar,
  QuickActionButton,
  SectionBar,
} from "./AssetsBars";
import {
  SubscriptionForm,
  ReceivableForm,
  AssetForm,
  DebtForm,
} from "./AssetsForm";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

// ---------------------------------------------------------------------------
// Networth hero card
// ---------------------------------------------------------------------------
export function AssetsNetworthCard({
  networth,
  totalAssets,
  totalDebt,
  showBalance,
}: Pick<State, "networth" | "totalAssets" | "totalDebt" | "showBalance">) {
  const isNegative = networth < 0;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border p-5 mb-3 shadow-soft",
        "bg-finyk/5 dark:bg-finyk-surface-dark/10 border-finyk/15 dark:border-finyk-border-dark/20",
        "before:absolute before:inset-0 before:pointer-events-none before:bg-linear-to-br",
        isNegative
          ? "before:from-danger/5 before:via-transparent before:to-transparent"
          : "before:from-finyk/10 before:via-transparent before:to-transparent",
      )}
    >
      <div className="relative">
        <p className="text-sm text-muted inline-flex items-center gap-1.5">
          <Icon name="wallet" size={14} aria-hidden />
          Загальний нетворс
        </p>
        <div
          className={cn(
            "text-display-stat mt-2",
            isNegative
              ? "text-danger-strong dark:text-danger"
              : "text-finyk-strong dark:text-finyk",
            !showBalance && "tracking-widest",
          )}
        >
          {showBalance ? (
            <>
              {networth.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}
              <span
                className={cn(
                  "text-2xl font-semibold ml-1",
                  isNegative ? "text-danger/60" : "text-finyk/60",
                )}
              >
                ₴
              </span>
            </>
          ) : (
            "\u2022\u2022\u2022\u2022\u2022\u2022"
          )}
        </div>
        {showBalance ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-finyk/20 text-sm">
            <div>
              <div className="text-xs text-subtle mb-0.5">Активи</div>
              <div className="font-semibold tabular-nums text-text">
                {`+${totalAssets.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`}
              </div>
            </div>
            <div className="w-px bg-finyk/20 hidden sm:block self-stretch min-h-10" />
            <div>
              <div className="text-xs text-subtle mb-0.5">Пасиви</div>
              <div className="font-semibold tabular-nums text-text">
                {`\u2212${totalDebt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted mt-3">Суми приховано</p>
        )}
        {showBalance && totalAssets + totalDebt > 0 && (
          <AssetsLiabilitiesBar assets={totalAssets} liabilities={totalDebt} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions section body
// ---------------------------------------------------------------------------
export function AssetsSubscriptionsSection({ state }: { state: State }) {
  const {
    subscriptions,
    setSubscriptions,
    transactions,
    showSubForm,
    setShowSubForm,
    newSub,
    setNewSub,
    setTxPicker,
    showBalance,
  } = state;
  const toast = useToast();

  return (
    <div className="mb-3 space-y-0">
      {subscriptions.length > 0 && (
        <button
          type="button"
          onClick={() => openHubModule("routine", "")}
          className="w-full text-xs text-muted hover:text-text transition-colors pb-2 flex items-center justify-center gap-1.5"
        >
          <Icon name="calendar" size={14} aria-hidden />
          <span>Побачити у календарі Рутини</span>
          <Icon name="chevron-right" size={14} aria-hidden />
        </button>
      )}
      {subscriptions.map((sub, i) => (
        <SubCard
          key={sub.id}
          sub={sub}
          transactions={transactions}
          showBalance={showBalance}
          onDelete={() => {
            const removed = sub;
            const removedIdx = i;
            setSubscriptions((ss) => ss.filter((_, j) => j !== removedIdx));
            notifyFinykRoutineCalendarSync();
            showUndoToast(toast, {
              msg: `Видалено підписку «${removed.name}»`,
              onUndo: () => {
                setSubscriptions((ss) => {
                  const next = [...ss];
                  next.splice(removedIdx, 0, removed);
                  return next;
                });
                notifyFinykRoutineCalendarSync();
              },
            });
          }}
          onEdit={(updated) => {
            setSubscriptions((ss) =>
              ss.map((s, j) => (j === i ? { ...s, ...updated } : s)),
            );
            notifyFinykRoutineCalendarSync();
          }}
          onLinkTransactions={() => setTxPicker({ type: "sub", subId: sub.id })}
        />
      ))}
      {showSubForm ? (
        <SubscriptionForm
          newSub={newSub}
          setNewSub={setNewSub}
          setSubscriptions={setSubscriptions}
          setShowSubForm={setShowSubForm}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowSubForm(true)}
          className="w-full py-2.5 text-style-label rounded-xl bg-finyk-soft text-finyk-strong dark:bg-finyk/15 dark:text-finyk border border-finyk-soft-border hover:bg-brand-100 dark:hover:bg-finyk/25 active:scale-[0.99] transition-colors shadow-soft mt-2"
        >
          + Додати підписку
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assets section body (Monobank accounts + receivables + manual assets)
// ---------------------------------------------------------------------------
export function AssetsAssetsSection({ state }: { state: State }) {
  const toast = useToast();
  const {
    accounts,
    transactions,
    hiddenAccounts,
    manualAssets,
    setManualAssets,
    receivables,
    setReceivables,
    showRecvForm,
    setShowRecvForm,
    showAssetForm,
    setShowAssetForm,
    newRecv,
    setNewRecv,
    newAsset,
    setNewAsset,
    assetFormRef,
    assetNameInputRef,
    setTxPicker,
    showBalance,
  } = state;

  return (
    <div className="mb-3 space-y-2">
      <SectionHeading as="div" size="sm" className="pt-1">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="credit-card" size={14} className="text-muted" />
          Картки Monobank
        </span>
      </SectionHeading>
      {accounts
        .filter((a) => !hiddenAccounts.includes(a.id ?? ""))
        .map((a, i) => {
          const visual = getAccountVisual(a);
          const currencySymbol =
            a.currencyCode === 980
              ? "\u20B4"
              : a.currencyCode === 840
                ? "$"
                : "\u20AC";
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 hover:bg-panelHi transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                    visual.tone,
                  )}
                  aria-hidden
                >
                  <Icon name={visual.iconName} size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-style-label truncate">{visual.name}</div>
                  <div className="text-meta text-subtle mt-0.5">Monobank</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold tabular-nums text-text">
                  {showBalance
                    ? `${((a.balance ?? 0) / 100).toLocaleString("uk-UA", {
                        minimumFractionDigits: 2,
                      })} ${currencySymbol}`
                    : "\u2022\u2022\u2022\u2022"}
                </div>
              </div>
            </div>
          );
        })}

      <SectionHeading as="div" size="sm" className="pt-2">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="hand-coins" size={14} className="text-success" />
          Мені винні
        </span>
      </SectionHeading>
      {receivables.length === 0 && !showRecvForm && (
        <p className="text-xs text-muted px-1">
          Зберігайте облік боргів і дат повернення — прив&apos;язуйте вхідні
          транзакції, щоб автоматично рахувати повернене.
        </p>
      )}
      {receivables.map((r) => (
        <DebtCard
          key={r.id}
          name={r.name ?? ""}
          emoji={r.emoji ?? ""}
          remaining={calcReceivableRemaining(r, transactions)}
          paid={getRecvPaid(r, transactions)}
          total={getReceivableEffectiveTotal(r, transactions)}
          dueDate={r.dueDate}
          isReceivable
          showBalance={showBalance}
          onDelete={() => {
            const removed = r;
            setReceivables((rs) => rs.filter((x) => x.id !== removed.id));
            showUndoToast(toast, {
              msg: `Видалено борг «${removed.name}»`,
              onUndo: () => setReceivables((rs) => [...rs, removed]),
            });
          }}
          onLink={() => setTxPicker({ id: r.id, type: "recv" })}
          linkedCount={r.linkedTxIds?.length || 0}
        />
      ))}
      {showRecvForm ? (
        <ReceivableForm
          newRecv={newRecv}
          setNewRecv={setNewRecv}
          setReceivables={setReceivables}
          setShowRecvForm={setShowRecvForm}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowRecvForm(true)}
          className="w-full py-2.5 text-style-label rounded-xl bg-success/10 text-success-strong dark:bg-success/15 dark:text-success border border-success/30 hover:bg-success/15 dark:hover:bg-success/25 active:scale-[0.99] transition-colors shadow-soft"
        >
          + Додати актив «мені винні»
        </button>
      )}

      <SectionHeading as="div" size="sm" className="pt-2">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="piggy-bank" size={14} className="text-muted" />
          Інші активи
        </span>
      </SectionHeading>
      {manualAssets.length === 0 && !showAssetForm && (
        <div className="space-y-2">
          <p className="text-xs text-muted px-1">
            Готівка, заощадження, депозит, інвестиції, нерухомість, авто — усе,
            що не на картці Monobank.
          </p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {[
              "\uD83D\uDCB5 Готівка",
              "\uD83C\uDFE6 Депозит",
              "\uD83D\uDCC8 Інвестиції",
              "\uD83C\uDFE0 Нерухомість",
              "\uD83D\uDE97 Авто",
            ].map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center text-meta text-muted bg-panelHi border border-line rounded-full px-2 py-0.5"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}
      {showAssetForm ? (
        <AssetForm
          newAsset={newAsset}
          setNewAsset={setNewAsset}
          setManualAssets={setManualAssets}
          setShowAssetForm={setShowAssetForm}
          assetFormRef={assetFormRef}
          assetNameInputRef={assetNameInputRef}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAssetForm(true)}
          className="w-full py-2.5 text-style-label rounded-xl bg-success/10 text-success-strong dark:bg-success/15 dark:text-success border border-success/30 hover:bg-success/15 dark:hover:bg-success/25 active:scale-[0.99] transition-colors shadow-soft"
        >
          + Додати актив
        </button>
      )}
      {manualAssets.map((a, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 hover:bg-panelHi transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-panelHi text-xl leading-none shrink-0"
              aria-hidden
            >
              {a.emoji}
            </span>
            <div className="min-w-0">
              <div className="text-style-label truncate">{a.name}</div>
              <div className="text-meta text-subtle mt-0.5">{a.currency}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold tabular-nums text-success">
              {showBalance
                ? `${Number(a.amount).toLocaleString("uk-UA")} ${
                    a.currency === "UAH"
                      ? "\u20B4"
                      : a.currency === "USD"
                        ? "$"
                        : a.currency
                  }`
                : "\u2022\u2022\u2022\u2022"}
            </span>
            <button
              onClick={() => {
                const removed = a;
                const removedIdx = i;
                setManualAssets((as) => as.filter((_, j) => j !== removedIdx));
                showUndoToast(toast, {
                  msg: `Видалено актив «${removed.name}»`,
                  onUndo: () =>
                    setManualAssets((as) => {
                      const next = [...as];
                      next.splice(removedIdx, 0, removed);
                      return next;
                    }),
                });
              }}
              className="text-subtle hover:text-danger text-sm transition-colors"
              aria-label={`Видалити актив ${a.name}`}
            >
              {"\u{1F5D1}"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Liabilities section body
// ---------------------------------------------------------------------------
export function AssetsLiabilitiesSection({ state }: { state: State }) {
  const toast = useToast();
  const {
    transactions,
    manualDebts,
    setManualDebts,
    monoDebtAccounts,
    monoDebtLinkedTxIds,
    showDebtForm,
    setShowDebtForm,
    newDebt,
    setNewDebt,
    debtFormRef,
    debtNameInputRef,
    setTxPicker,
    showBalance,
  } = state;

  const liabilitiesEmpty =
    monoDebtAccounts.length === 0 && manualDebts.length === 0 && !showDebtForm;

  return (
    <div className="mb-3 space-y-0">
      {liabilitiesEmpty && (
        <div className="space-y-2 mb-3">
          <p className="text-xs text-muted px-1">
            Кредити, розстрочки, позики, комунальні борги — додавайте з датою
            повернення, прив&apos;язуйте транзакції-платежі, і картка сама
            покаже прогрес «Сплачено N з M».
          </p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {[
              "\uD83D\uDCB3 Кредит",
              "\uD83D\uDCC5 Розстрочка",
              "\uD83E\uDD1D Позика",
              "\uD83D\uDCA1 Комуналка",
            ].map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center text-meta text-muted bg-panelHi border border-line rounded-full px-2 py-0.5"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}
      {showDebtForm ? (
        <DebtForm
          newDebt={newDebt}
          setNewDebt={setNewDebt}
          setManualDebts={setManualDebts}
          setShowDebtForm={setShowDebtForm}
          debtFormRef={debtFormRef}
          debtNameInputRef={debtNameInputRef}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowDebtForm(true)}
          className="w-full py-2.5 text-style-label rounded-xl bg-danger/10 text-danger-strong dark:bg-danger/15 dark:text-danger border border-danger/30 hover:bg-danger/15 dark:hover:bg-danger/25 active:scale-[0.99] transition-colors shadow-soft mb-2"
        >
          + Додати пасив
        </button>
      )}
      {monoDebtAccounts.map((a, i) => {
        const linkedIds = (a.id ? monoDebtLinkedTxIds[a.id] : []) || [];
        const paidFromLinked = transactions
          .filter((t) => linkedIds.includes(t.id))
          .reduce((s, t) => s + Math.abs(t.amount / 100), 0);
        const remaining = getMonoDebt(a);
        const volatileTotal = paidFromLinked + remaining;
        const visual = getAccountVisual(a);
        return (
          <DebtCard
            key={i}
            name={visual.name}
            emoji={"\u{1F4B3}"}
            remaining={remaining}
            paid={paidFromLinked}
            total={volatileTotal}
            showBalance={showBalance}
            onLink={() => setTxPicker({ id: a.id ?? "", type: "monoDebt" })}
            linkedCount={linkedIds.length}
          />
        );
      })}
      {manualDebts.map((d) => (
        <DebtCard
          key={d.id}
          name={d.name ?? ""}
          emoji={d.emoji ?? ""}
          remaining={calcDebtRemaining(d, transactions)}
          paid={getDebtPaid(d, transactions)}
          total={getDebtEffectiveTotal(d, transactions)}
          dueDate={d.dueDate}
          showBalance={showBalance}
          onDelete={() => {
            const removed = d;
            setManualDebts((ds) => ds.filter((x) => x.id !== removed.id));
            showUndoToast(toast, {
              msg: `Видалено борг «${removed.name}»`,
              onUndo: () => setManualDebts((ds) => [...ds, removed]),
            });
          }}
          onLink={() => setTxPicker({ id: d.id, type: "debt" })}
          linkedCount={d.linkedTxIds?.length || 0}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main table: networth + stats + quick actions + all three sections
// ---------------------------------------------------------------------------
export function AssetsTable({ state }: { state: State }) {
  const {
    networth,
    totalAssets,
    totalDebt,
    showBalance,
    urgentLiability,
    todayStart,
    open,
    setOpen,
    subscriptions,
    transactions,
    dismissedRecurring,
    excludedTxIds,
    addSubscriptionFromRecurring,
    dismissRecurring,
    openSubscriptionForm,
    openAssetForm,
    openDebtForm,
  } = state;

  return (
    <>
      <AssetsNetworthCard
        networth={networth}
        totalAssets={totalAssets}
        totalDebt={totalDebt}
        showBalance={showBalance}
      />

      <FinykStatsStrip
        subsMonthly={0}
        subsCount={0}
        nextCharge={null}
        urgentLiability={urgentLiability}
        todayStart={todayStart}
        showBalance={showBalance}
        onOpenLiabilities={() => setOpen((v) => ({ ...v, liabilities: true }))}
        className="mb-3"
      />

      <div className="grid grid-cols-3 gap-2 mb-3">
        <QuickActionButton
          iconName="refresh-cw"
          label="Підписка"
          tone="finyk"
          onClick={openSubscriptionForm}
        />
        <QuickActionButton
          iconName="trending-up"
          label="Актив"
          tone="success"
          onClick={openAssetForm}
        />
        <QuickActionButton
          iconName="trending-down"
          label="Пасив"
          tone="danger"
          onClick={openDebtForm}
        />
      </div>

      <RecurringSuggestions
        transactions={transactions}
        subscriptions={subscriptions}
        dismissedRecurring={dismissedRecurring}
        excludedTxIds={excludedTxIds}
        onAdd={(candidate) => addSubscriptionFromRecurring?.(candidate)}
        onDismiss={(key) => dismissRecurring?.(key)}
      />

      {/* Subscriptions section */}
      <SectionBar
        title="Підписки"
        iconName="refresh-cw"
        iconTone="finyk"
        summary={`${subscriptions.length} активн${
          subscriptions.length === 1 ? "а" : "их"
        }`}
        open={open.subscriptions}
        onToggle={() =>
          setOpen((v) => ({ ...v, subscriptions: !v.subscriptions }))
        }
      />
      {open.subscriptions && <AssetsSubscriptionsSection state={state} />}

      {/* Assets section */}
      <SectionBar
        title="Активи"
        iconName="trending-up"
        iconTone="success"
        summary={
          showBalance
            ? `+${totalAssets.toLocaleString("uk-UA", {
                maximumFractionDigits: 0,
              })} ₴`
            : "\u2022\u2022\u2022\u2022"
        }
        open={open.assets}
        onToggle={() => setOpen((v) => ({ ...v, assets: !v.assets }))}
      />
      {open.assets && <AssetsAssetsSection state={state} />}

      {/* Liabilities section */}
      <SectionBar
        title="Пасиви"
        iconName="trending-down"
        iconTone="danger"
        summary={
          showBalance
            ? `\u2212${totalDebt.toLocaleString("uk-UA", {
                maximumFractionDigits: 0,
              })} ₴`
            : "\u2022\u2022\u2022\u2022"
        }
        open={open.liabilities}
        onToggle={() => setOpen((v) => ({ ...v, liabilities: !v.liabilities }))}
      />
      {open.liabilities && <AssetsLiabilitiesSection state={state} />}
    </>
  );
}
