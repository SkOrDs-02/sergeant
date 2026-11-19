import { Button } from "@shared/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { DebtCard } from "../components/DebtCard";
import { AssetsGroupCard } from "./AssetsGroupCard";
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
import { ManualAssetRow } from "./ManualAssetRow";
import { localTodayKey } from "@sergeant/finyk-domain/domain/assets";
import { messages } from "@shared/i18n";
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

  // Закриті рахунки-активи (спека finyk-savings-assets) — окремою
  // згорнутою групою; видалення й правка йдуть за id, не за індексом.
  const [closedVisible, setClosedVisible] = useState(false);
  const today = localTodayKey();
  const activeAssets = manualAssets.filter((a) => a["status"] !== "closed");
  const closedAssets = manualAssets.filter((a) => a["status"] === "closed");
  const renderAssetRow = (a: (typeof manualAssets)[number]) => (
    <ManualAssetRow
      key={a.id}
      asset={a}
      today={today}
      showBalance={showBalance}
      onEdit={() => {
        setEditingAssetId(a.id);
        setNewAsset({
          name: a.name ?? "",
          amount: String(a.amount ?? ""),
          currency: a.currency ?? "UAH",
          emoji: a.emoji ?? "",
        });
        setShowAssetForm(true);
      }}
      onChange={(next) =>
        setManualAssets((as) =>
          as.map((item) => (item.id === a.id ? next : item)),
        )
      }
      onDelete={() => {
        const removed = a;
        const removedIdx = manualAssets.findIndex((x) => x.id === a.id);
        setManualAssets((as) => as.filter((x) => x.id !== a.id));
        showUndoToast(toast, {
          msg: `Видалено актив «${removed.name}»`,
          onUndo: () =>
            setManualAssets((as) => {
              const next = [...as];
              next.splice(Math.max(0, removedIdx), 0, removed);
              return next;
            }),
        });
      }}
    />
  );

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
                as.map((item) =>
                  item.id === id ? { ...item, ...value } : item,
                ),
              );
              setEditingAssetId(null);
            }}
          />
        )}
        {activeAssets
          .slice(0, allAssetsVisible ? undefined : 3)
          .map((a) => renderAssetRow(a))}
        {activeAssets.length > 3 && (
          <Button
            variant="text"
            onClick={() => setAllAssetsVisible((visible) => !visible)}
            aria-expanded={allAssetsVisible}
          >
            {allAssetsVisible
              ? "Показати менше"
              : `Показати всі (${activeAssets.length})`}
          </Button>
        )}
        {closedAssets.length > 0 && (
          <Button
            variant="text"
            onClick={() => setClosedVisible((visible) => !visible)}
            aria-expanded={closedVisible}
          >
            {messages.finyk.savingsAssets.closedGroup.replace(
              "{n}",
              String(closedAssets.length),
            )}
          </Button>
        )}
        {closedVisible && closedAssets.map((a) => renderAssetRow(a))}
      </AssetsGroupCard>
    </div>
  );
}
