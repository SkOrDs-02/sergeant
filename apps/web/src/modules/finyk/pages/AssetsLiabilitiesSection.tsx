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
