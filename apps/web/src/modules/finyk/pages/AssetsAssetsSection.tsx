import { DebtCard } from "../components/DebtCard";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { Card } from "@shared/components/ui/Card";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
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
  const [allReceivablesVisible, setAllReceivablesVisible] = useState(false);
  const [allAssetsVisible, setAllAssetsVisible] = useState(false);
  const [receivablesExpanded, setReceivablesExpanded] = useState(true);
  const [assetsExpanded, setAssetsExpanded] = useState(true);
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
    editingRecvId,
    setEditingRecvId,
    newAsset,
    setNewAsset,
    editingAssetId,
    setEditingAssetId,
    assetFormRef,
    assetNameInputRef,
    setTxPicker,
    showBalance,
  } = state;

  return (
    <div className="mb-3 space-y-3">
      <CollapsibleSection
        storageKey="finyk_assets_mono_cards_open_v1"
        title="Картки Monobank"
        headingSize="sm"
        collapsedIcon="credit-card"
      >
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
                    <div className="text-style-label truncate">
                      {visual.name}
                    </div>
                    <div className="text-style-caption text-subtle mt-0.5">
                      Monobank
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-style-label tabular-nums text-text">
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
      </CollapsibleSection>

      <Card radius="lg" padding="sm" className="space-y-2">
        <button
          type="button"
          className="touch-target flex w-full items-center justify-between pt-2 text-left"
          aria-expanded={receivablesExpanded}
          onClick={() => setReceivablesExpanded((value) => !value)}
        >
          <SectionHeading as="span" size="sm">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="hand-coins" size={14} className="text-success" />
              Мені винні
            </span>
          </SectionHeading>
          <Icon
            name={receivablesExpanded ? "chevron-up" : "chevron-down"}
            size={16}
          />
        </button>
        <div hidden={!receivablesExpanded} className="space-y-2">
          {receivables.length === 0 && !showRecvForm && (
            <p className="text-xs text-muted px-1">
              Зберігайте облік боргів і дат повернення — прив&apos;язуйте вхідні
              транзакції, щоб автоматично рахувати повернене.
            </p>
          )}
          {receivables
            .slice(0, allReceivablesVisible ? undefined : 3)
            .map((r) => (
              <DebtCard
                key={r.id}
                name={r.name ?? ""}
                emoji={r.emoji ?? ""}
                remaining={calcReceivableRemaining(r, transactions)}
                paid={getRecvPaid(r, transactions)}
                total={getReceivableEffectiveTotal(r, transactions)}
                dueDate={r.dueDate}
                isReceivable
                onEdit={() => {
                  setEditingRecvId(r.id);
                  setNewRecv({
                    name: r.name ?? "",
                    emoji: r.emoji ?? "",
                    amount: String(r.amount ?? ""),
                    note: String(r["note"] ?? ""),
                    dueDate: r.dueDate ?? "",
                  });
                  setShowRecvForm(true);
                }}
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
          {receivables.length > 3 && (
            <button
              type="button"
              onClick={() => setAllReceivablesVisible((visible) => !visible)}
              className="touch-target w-full text-style-caption text-primary hover:underline"
            >
              {allReceivablesVisible
                ? "Згорнути"
                : `Показати всі (${receivables.length})`}
            </button>
          )}
          {showRecvForm ? (
            <ReceivableForm
              newRecv={newRecv}
              setNewRecv={setNewRecv}
              setReceivables={setReceivables}
              setShowRecvForm={(next) => {
                setShowRecvForm(next);
                if (!next) setEditingRecvId(null);
              }}
              editingId={editingRecvId}
              onUpdate={(id, value) => {
                setReceivables((rs) =>
                  rs.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          ...value,
                          id,
                          linkedTxIds: item.linkedTxIds ?? [],
                        }
                      : item,
                  ),
                );
                setEditingRecvId(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingRecvId(null);
                setNewRecv({
                  name: "",
                  emoji: "",
                  amount: "",
                  note: "",
                  dueDate: "",
                });
                setShowRecvForm(true);
              }}
              className="w-full py-2.5 text-style-label rounded-xl bg-success/10 text-success-strong dark:bg-success/15 dark:text-success border border-success/30 hover:bg-success/15 dark:hover:bg-success/25 active:scale-[0.99] transition-colors shadow-soft"
            >
              + Додати актив «мені винні»
            </button>
          )}
        </div>
      </Card>

      <Card radius="lg" padding="sm" className="space-y-2">
        <button
          type="button"
          className="touch-target flex w-full items-center justify-between pt-2 text-left"
          aria-expanded={assetsExpanded}
          onClick={() => setAssetsExpanded((value) => !value)}
        >
          <SectionHeading as="span" size="sm">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="piggy-bank" size={14} className="text-muted" />
              Інші активи
            </span>
          </SectionHeading>
          <Icon
            name={assetsExpanded ? "chevron-up" : "chevron-down"}
            size={16}
          />
        </button>
        <div hidden={!assetsExpanded} className="space-y-2">
          {manualAssets.length === 0 && !showAssetForm && (
            <div className="space-y-2">
              <p className="text-xs text-muted px-1">
                Готівка, заощадження, депозит, інвестиції, нерухомість, авто —
                усе, що не на картці Monobank.
              </p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {[
                  "Готівка",
                  "Депозит",
                  "Інвестиції",
                  "Нерухомість",
                  "Авто",
                ].map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center text-style-caption text-muted bg-panelHi border border-line rounded-full px-2 py-0.5"
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
              setShowAssetForm={(next) => {
                setShowAssetForm(next);
                if (!next) setEditingAssetId(null);
              }}
              assetFormRef={assetFormRef}
              assetNameInputRef={assetNameInputRef}
              editingId={editingAssetId}
              onUpdate={(id, value) => {
                setManualAssets((as) =>
                  as.map((item) => (item.id === id ? value : item)),
                );
                setEditingAssetId(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingAssetId(null);
                setNewAsset({
                  name: "",
                  amount: "",
                  currency: "UAH",
                  emoji: "",
                });
                setShowAssetForm(true);
              }}
              className="w-full py-2.5 text-style-label rounded-xl bg-success/10 text-success-strong dark:bg-success/15 dark:text-success border border-success/30 hover:bg-success/15 dark:hover:bg-success/25 active:scale-[0.99] transition-colors shadow-soft"
            >
              + Додати актив
            </button>
          )}
          {manualAssets
            .slice(0, allAssetsVisible ? undefined : 3)
            .map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 hover:bg-panelHi transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-panelHi text-xl leading-none shrink-0"
                    aria-hidden
                  >
                    <Icon name="wallet" size={18} className="text-muted" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-style-label truncate">{a.name}</div>
                    <div className="text-style-caption text-subtle mt-0.5">
                      {a.currency}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-style-label tabular-nums text-success-strong dark:text-success">
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
                    type="button"
                    onClick={() => {
                      setEditingAssetId(a.id);
                      setNewAsset({
                        name: a.name ?? "",
                        amount: String(a.amount ?? ""),
                        currency: a.currency ?? "UAH",
                        emoji: a.emoji ?? "",
                      });
                      setShowAssetForm(true);
                    }}
                    className="text-subtle hover:text-text text-sm transition-colors"
                    aria-label={`Редагувати актив ${a.name}`}
                  >
                    <Icon name="edit" size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const removed = a;
                      const removedIdx = i;
                      setManualAssets((as) =>
                        as.filter((_, j) => j !== removedIdx),
                      );
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
                    <Icon name="trash" size={16} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          {manualAssets.length > 3 && (
            <button
              type="button"
              onClick={() => setAllAssetsVisible((visible) => !visible)}
              className="touch-target w-full text-style-caption text-primary hover:underline"
            >
              {allAssetsVisible
                ? "Згорнути"
                : `Показати всі (${manualAssets.length})`}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
import { useState } from "react";
