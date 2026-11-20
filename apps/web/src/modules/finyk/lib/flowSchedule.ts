import { messages } from "@shared/i18n";
/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Розклад майбутніх потоків: підписки (наступне списання), борги
 * (дата погашення) і «мені винні» (дата повернення) — одним списком
 * `FlowItem`-ів із `daysLeft`.
 *
 * AI-CONTEXT: до 2026-09-03 це жило всередині `useOverviewData`, бо єдиним
 * споживачем був Огляд («Найближчі платежі» + рядок «регулярні» в «Місяць»).
 * Після переїзду «Найближчих платежів» у Планування (рішення власника) той
 * самий розрахунок потрібен двом сторінкам, тож він винесений сюди, а не
 * скопійований: розбіжність у двох копіях (інший поріг днів, інший
 * порядок) помітили б не одразу.
 *
 * AI-CONTEXT (2026-11-19, Ф-4 (б)): сам розрахунок (цикл підписки, залишок
 * боргу, київський `daysLeft`, предикат запланованого списання) переїхав у
 * `@sergeant/finyk-domain/domain/flowSchedule`, бо його читає й серверний
 * push «завтра спишеться». Тут лишились підписи екрана з i18n.
 */
import {
  PLANNED_FLOWS_HORIZON_DAYS,
  buildFinykFlowSchedule,
  selectPlannedOutflows as selectDomainPlannedOutflows,
  type FinykFlow,
} from "@sergeant/finyk-domain/domain/flowSchedule";
import { pluralDays } from "@sergeant/shared";
import type { useStorage } from "../hooks/useStorage";
import type { FlowItem } from "../pages/overview/FlowRow";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

type StorageLike = ReturnType<typeof useStorage>;

export type ScheduledFlow = FlowItem & {
  id: string;
  daysLeft: number;
  dueDate: Date;
};

/** Скільки днів наперед показують «Найближчі платежі» (константа домену). */
export { PLANNED_FLOWS_HORIZON_DAYS };

const formatDaysLeft = (days: number): string => {
  if (days === 0) return messages.finykRedesign.dueToday;
  if (days === 1) return messages.finykRedesign.dueTomorrow;
  return `${messages.finykRedesign.dueIn} ${days} ${pluralDays(days)}`;
};

export interface UseFlowScheduleParams {
  subscriptions: StorageLike["subscriptions"];
  manualDebts: StorageLike["manualDebts"];
  receivables: StorageLike["receivables"];
  transactions: Transaction[];
  /** Київські частини «сьогодні»: рік, 0-based місяць, день. */
  kyivYear: number;
  kyivMonth: number;
  kyivDay: number;
}

/** Доменний потік → рядок екрана: підпис днів і запасна назва з i18n. */
const toScheduledFlow = (f: FinykFlow, fallbackTitle: string) => ({
  id: f.id,
  // AI-CONTEXT (2026-08-21): тут клеївся `sub.emoji`, засіяний дефолт
  // «📱», який людина ніколи не обирала. Рядок потоку показує назву.
  title: f.name || fallbackTitle,
  amount: f.amount,
  sign: f.sign as string,
  daysLeft: f.daysLeft,
  hint: formatDaysLeft(f.daysLeft),
  currency: f.currency,
  dueDate: f.dueDate,
});

/**
 * Розклад рахує домен (`buildFinykFlowSchedule`, Ф-4 (б)): ті самі потоки
 * читає серверний push «завтра спишеться». Тут лише підписи.
 */
export function getFlowSchedule({
  subscriptions,
  manualDebts,
  receivables,
  transactions,
  kyivYear,
  kyivMonth,
  kyivDay,
}: UseFlowScheduleParams) {
  // Полудень UTC київської дати: у Києві це той самий день за будь-якого
  // часового поясу пристрою.
  const schedule = buildFinykFlowSchedule({
    subscriptions,
    manualDebts,
    receivables,
    transactions,
    nowMs: Date.UTC(kyivYear, kyivMonth, kyivDay, 12),
  });

  const subscriptionFlows = schedule.subscriptionFlows.map((f) =>
    toScheduledFlow(f, ""),
  );
  const debtOutFlows = schedule.debtOutFlows.map((f) =>
    toScheduledFlow(f, messages.finykRedesign.passive),
  );
  const debtInFlows = schedule.debtInFlows.map((f) =>
    toScheduledFlow(f, messages.finykRedesign.receivable),
  );

  const plannedFlows = [...subscriptionFlows, ...debtOutFlows, ...debtInFlows]
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= PLANNED_FLOWS_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return { subscriptionFlows, debtOutFlows, debtInFlows, plannedFlows };
}

export type FlowSchedule = ReturnType<typeof getFlowSchedule>;

/** Заплановане списання: підписка або погашення боргу. */
export type PlannedOutflow = ScheduledFlow & {
  kind: "subscription" | "debt";
};

/**
 * Заплановані списання розкладу: підписки й погашення боргів, строк яких
 * ще не минув (`daysLeft >= 0`). «Мені винні» сюди не входять: це
 * надходження.
 *
 * AI-CONTEXT: одне джерело правди (OD-26 Ф-4, П-4 (Б), рішення founder-а
 * 2026-11-18). Денна норма «Можна сьогодні» (`getFinykDayPlan`) віднімає
 * рівно ці потоки в межах місяця, рядок «спишеться» на хабі
 * (`selectDueCharges`) показує їх же за сьогодні й завтра, а серверний push
 * (Ф-4 (б)) бере їх за завтра. Предикат живе в домені
 * (`selectPlannedOutflows` з `@sergeant/finyk-domain/domain/flowSchedule`);
 * тут лише типізована обгортка. Не копіюй фільтр поруч.
 */
export function selectPlannedOutflows(
  schedule: Pick<FlowSchedule, "subscriptionFlows" | "debtOutFlows">,
): PlannedOutflow[] {
  return selectDomainPlannedOutflows(schedule);
}
