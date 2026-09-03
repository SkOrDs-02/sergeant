import { useMemo } from "react";
import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import { detectRecurring } from "@sergeant/finyk-domain/lib/recurringDetect";
import { SubCard } from "../components/SubCard";
import { MonthOutflowComb } from "../components/MonthOutflowComb";
import type { CombEntry } from "../lib/monthOutflowComb";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
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
    subsMonthly,
  } = state;
  const toast = useToast();

  // Дні регулярних надходжень. Той самий рушій, що ловить підписки, але
  // з іншого боку потоку (`flow: "income"` — етап 2 гребеня). Окремий
  // `useMemo`, бо залежить лише від транзакцій: перелік підписок на
  // зарплату не впливає.
  const incomeDays = useMemo(() => {
    const candidates = detectRecurring([...transactions], { flow: "income" });
    return [...new Set(candidates.map((c) => c.billingDay))];
  }, [transactions]);

  // AI-CONTEXT: суми для гребеня беруться тим самим
  // `getSubscriptionAmountMeta`, що й у `SubCard`. Це не зручність, а
  // інваріант: якби гребінь рахував суму інакше, він показував би інший
  // місяць, ніж список під ним, і розбіжність помітили б не одразу.
  //
  // Межі місяця — за КИЇВСЬКИМ годинником, не за пристроєм. ADR-0078
  // ділить добу навпіл: пристрій володіє ОСОБИСТИМ днем (відмітка
  // звички, лог їжі, денний запис), а фінансові періоди лишаються за
  // Europe/Kyiv. Місяць підписок — фінансовий період, тож 1-ше число
  // тут те саме, з якого рахуються звіти, а не те, яке показує телефон
  // у роумінгу.
  const { combEntries, daysInMonth, todayDom } = useMemo(() => {
    const kyiv = getKyivDateParts();
    const entries: CombEntry[] = subscriptions.map((sub) => ({
      id: String(sub.id),
      name: String(sub.name ?? ""),
      billingDay: Number(sub.billingDay) || 0,
      amount: getSubscriptionAmountMeta(sub, [...transactions]).amount,
    }));
    return {
      combEntries: entries,
      // День 0 наступного місяця = останній день поточного.
      daysInMonth: new Date(Date.UTC(kyiv.year, kyiv.month, 0)).getUTCDate(),
      todayDom: kyiv.day,
    };
  }, [subscriptions, transactions]);

  return (
    <div className="mb-3 space-y-0">
      <MonthOutflowComb
        entries={combEntries}
        daysInMonth={daysInMonth}
        today={todayDom}
        incomeDays={incomeDays}
        showBalance={showBalance}
        className="mb-2"
      />
      <div className="mb-2 rounded-xl border border-finyk-soft-border bg-finyk-soft px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-style-caption text-finyk-soft-fg">
          Витрати на підписки за місяць
        </span>
        <strong className="text-style-label tabular-nums text-finyk-soft-fg">
          {showBalance ? <Money amount={Math.round(subsMonthly)} /> : "••••"}
        </strong>
      </div>
      {subscriptions.length > 0 && (
        <button
          type="button"
          onClick={() => openHubModule("routine", "")}
          className="w-full text-style-caption text-muted hover:text-text transition-colors pb-2 flex items-center justify-center gap-1.5"
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
      {/* Вхід у форму — quick-action «+ Підписка» угорі сторінки; власна
          кнопка секції дублювала його (звіт власника 2026-09-03). */}
      {showSubForm && (
        <SubscriptionForm
          newSub={newSub}
          setNewSub={setNewSub}
          setSubscriptions={setSubscriptions}
          setShowSubForm={setShowSubForm}
          transactions={transactions}
        />
      )}
    </div>
  );
}
