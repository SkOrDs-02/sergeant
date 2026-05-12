import { SubCard } from "../components/SubCard";
import { Icon } from "@shared/components/ui/Icon";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { SubscriptionForm } from "./AssetsForm";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

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
