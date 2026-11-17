import { Button } from "@shared/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { DebtCard } from "../components/DebtCard";
import { Icon } from "@shared/components/ui/Icon";
import { AssetsGroupCard } from "./AssetsGroupCard";
import { Money } from "@shared/components/ui/Money";
import { FinanceItemHeading } from "../components/FinanceItemHeading";
import {
  getRecvPaid,
  calcReceivableRemaining,
  getReceivableEffectiveTotal,
} from "../utils";
import { AssetsMonoCards } from "./AssetsMonoCards";
import { AssetsMonoJars } from "./AssetsMonoJars";
import { AssetsCashOnHand } from "./AssetsCashOnHand";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { ReceivableForm, AssetForm } from "./AssetsForm";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

// Єдиний вхід у форми - рядок «Актив» кутової кнопки, а «Своє / Мені винні»
// обирається вже у формі (redesign v3.2); власних кнопок «+ Додати…» у
// групах немає (дублі, звіт власника 2026-09-03). Тому група мусить
// розгортатись сама, коли форма показана, інакше вибір відкривав би форму
// в згорнутій групі.

export function AssetsAssetsSection({ state }: { state: State }) {
  const toast = useToast();
  const [allReceivablesVisible, setAllReceivablesVisible] = useState(false);
  const [allAssetsVisible, setAllAssetsVisible] = useState(false);
  const [receivablesExpanded, setReceivablesExpanded] = useState(true);
  const [assetsExpanded, setAssetsExpanded] = useState(true);
  const {
    accounts,
    jars,
    transactions,
    hiddenAccounts,
    toggleHideAccount,
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
    cashBalanceMinor,
    createCashOnHand,
    setCashActualAmount,
    switchAssetKind,
  } = state;

  // Форма «Мені винні» стоїть у групі вище за «Інші активи»: після
  // перемикання типу її треба показати, інакше вона зʼявиться поза екраном.
  const recvFormRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showRecvForm) return;
    const frame = requestAnimationFrame(() =>
      recvFormRef.current?.scrollIntoView?.({
        behavior: motionScrollBehavior(),
        block: "start",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [showRecvForm]);

  // Похідний стан, а не ефект із setState: поки форма показана, група
  // відкрита незалежно від того, що людина згорнула раніше.
  const receivablesOpen = receivablesExpanded || showRecvForm;
  const assetsOpen = assetsExpanded || showAssetForm;

  return (
    <div className="space-y-0">
      <AssetsMonoCards
        accounts={accounts}
        hiddenAccounts={hiddenAccounts}
        toggleHideAccount={toggleHideAccount}
        showBalance={showBalance}
      />

      <AssetsMonoJars jars={jars} showBalance={showBalance} />

      {createCashOnHand && setCashActualAmount && (
        <AssetsCashOnHand
          balanceMinor={cashBalanceMinor}
          onCreate={createCashOnHand}
          onSetActual={setCashActualAmount}
          showBalance={showBalance}
        />
      )}

      <AssetsGroupCard
        title="Мені винні"
        iconName="hand-coins"
        iconClassName="text-success"
        open={receivablesOpen}
        onToggle={() => setReceivablesExpanded(!receivablesOpen)}
      >
        {receivables.length === 0 && !showRecvForm && (
          <p className="text-style-body text-muted px-1">
            Зберігай облік боргів і дат повернення, привʼязуй вхідні операції,
            щоб автоматично рахувати повернене.
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
                  msg: `Видалено «${removed.name}» зі списку «Мені винні»`,
                  onUndo: () => setReceivables((rs) => [...rs, removed]),
                });
              }}
              onLink={() => setTxPicker({ id: r.id, type: "recv" })}
              linkedCount={r.linkedTxIds?.length || 0}
            />
          ))}
        {receivables.length > 3 && (
          <Button
            variant="text"
            onClick={() => setAllReceivablesVisible((visible) => !visible)}
            aria-expanded={allReceivablesVisible}
          >
            {allReceivablesVisible
              ? "Показати менше"
              : `Показати всі (${receivables.length})`}
          </Button>
        )}
        {showRecvForm && (
          <div ref={recvFormRef}>
            <ReceivableForm
              onKindChange={switchAssetKind}
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
          </div>
        )}
      </AssetsGroupCard>

      <AssetsGroupCard
        title="Інші активи"
        iconName="piggy-bank"
        iconClassName="text-muted"
        open={assetsOpen}
        onToggle={() => setAssetsExpanded(!assetsOpen)}
      >
        {manualAssets.length === 0 && !showAssetForm && (
          <div className="space-y-2">
            <p className="text-style-body text-muted px-1">
              Готівка, заощадження, депозит, інвестиції, нерухомість, авто: усе,
              що не на картці Monobank.
            </p>
            <div className="flex flex-wrap gap-1.5 px-1">
              {["Готівка", "Депозит", "Інвестиції", "Нерухомість", "Авто"].map(
                (chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center text-style-caption text-muted"
                  >
                    {chip}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
        {showAssetForm && (
          <AssetForm
            onKindChange={switchAssetKind}
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
        )}
        {manualAssets.slice(0, allAssetsVisible ? undefined : 3).map((a, i) => (
          <div
            key={a.id}
            className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
          >
            <FinanceItemHeading
              title={a.name}
              meta={a.currency}
              value={
                showBalance ? (
                  <Money
                    amount={Number(a.amount)}
                    symbol={
                      a.currency === "UAH"
                        ? "\u20B4"
                        : a.currency === "USD"
                          ? "$"
                          : (a.currency ?? "\u20B4")
                    }
                    tone="inherit"
                  />
                ) : (
                  "\u2022\u2022\u2022\u2022"
                )
              }
              actions={
                <>
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
                    className="touch-target focus-ring text-subtle hover:text-text transition-colors"
                    aria-label={`Редагувати актив ${a.name}`}
                  >
                    <Icon name="edit" size="md" aria-hidden />
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
                    className="touch-target focus-ring text-subtle hover:text-danger transition-colors"
                    aria-label={`Видалити актив ${a.name}`}
                  >
                    <Icon name="trash" size="md" aria-hidden />
                  </button>
                </>
              }
            />
          </div>
        ))}
        {manualAssets.length > 3 && (
          <Button
            variant="text"
            onClick={() => setAllAssetsVisible((visible) => !visible)}
            aria-expanded={allAssetsVisible}
          >
            {allAssetsVisible
              ? "Показати менше"
              : `Показати всі (${manualAssets.length})`}
          </Button>
        )}
      </AssetsGroupCard>
    </div>
  );
}
