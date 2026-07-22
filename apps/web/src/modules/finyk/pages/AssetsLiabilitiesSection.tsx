import { DebtCard } from "../components/DebtCard";
import {
  getMonoDebt,
  getDebtPaid,
  calcDebtRemaining,
  getDebtEffectiveTotal,
} from "../utils";
import { getAccountVisual } from "../lib/accountVisual";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { DebtForm } from "./AssetsForm";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

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
    editingDebtId,
    setEditingDebtId,
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
            {["Кредит", "Розстрочка", "Позика", "Комуналка"].map((chip) => (
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
      {showDebtForm ? (
        <DebtForm
          newDebt={newDebt}
          setNewDebt={setNewDebt}
          setManualDebts={setManualDebts}
          setShowDebtForm={(next) => {
            setShowDebtForm(next);
            if (!next) setEditingDebtId(null);
          }}
          debtFormRef={debtFormRef}
          debtNameInputRef={debtNameInputRef}
          editingId={editingDebtId}
          onUpdate={(id, value) => {
            setManualDebts((ds) =>
              ds.map((item) =>
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
            setEditingDebtId(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingDebtId(null);
            setNewDebt({
              name: "",
              emoji: "",
              totalAmount: "",
              dueDate: "",
            });
            setShowDebtForm(true);
          }}
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
          onEdit={() => {
            setEditingDebtId(d.id);
            setNewDebt({
              name: d.name ?? "",
              emoji: d.emoji ?? "",
              totalAmount: String(d.totalAmount ?? d.amount ?? ""),
              dueDate: d.dueDate ?? "",
            });
            setShowDebtForm(true);
          }}
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
