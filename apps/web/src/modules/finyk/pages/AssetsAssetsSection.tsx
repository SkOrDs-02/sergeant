import { DebtCard } from "../components/DebtCard";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import {
  getRecvPaid,
  calcReceivableRemaining,
  getReceivableEffectiveTotal,
} from "../utils";
import { getAccountVisual } from "../lib/accountVisual";
import { cn } from "@shared/lib/ui/cn";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { ReceivableForm, AssetForm } from "./AssetsForm";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

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
