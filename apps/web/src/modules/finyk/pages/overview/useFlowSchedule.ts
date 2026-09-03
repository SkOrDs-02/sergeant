/**
 * Last validated: 2026-09-03
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
 */
import { useMemo } from "react";
import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import { kyivCalendarDaysBetween } from "@sergeant/shared";
import { getDaysInMonth } from "@shared/lib/time/kyivTime";
import { calcDebtRemaining, calcReceivableRemaining } from "../../utils";
import type { useStorage } from "../../hooks/useStorage";
import type { FlowItem } from "./FlowRow";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

type StorageLike = ReturnType<typeof useStorage>;

export type ScheduledFlow = FlowItem & {
  id: string;
  daysLeft: number;
  dueDate: Date;
};

/** Скільки днів наперед показують «Найближчі платежі». */
export const PLANNED_FLOWS_HORIZON_DAYS = 10;

const parseLocalDate = (isoDate: string | null | undefined): Date => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y ?? 0, (m || 1) - 1, d || 1);
};

const formatDaysLeft = (days: number): string => {
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days <= 3) return `через ${days} дн`;
  return `через ${days} дн`;
};

// `today` carries the Kyiv-anchored calendar parts of "now" (year, 0-based
// month, day) so the billing rollover math stays on the Europe/Kyiv day
// boundary regardless of the device timezone.
const getNextBillingDate = (
  billingDay: number,
  today: { year: number; month: number; day: number },
): Date => {
  const { year: y, month: m, day } = today;
  let d = new Date(y, m, Math.min(billingDay, getDaysInMonth(y, m)));
  if (d < new Date(y, m, day))
    d = new Date(y, m + 1, Math.min(billingDay, getDaysInMonth(y, m + 1)));
  return d;
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

export function useFlowSchedule({
  subscriptions,
  manualDebts,
  receivables,
  transactions,
  kyivYear,
  kyivMonth,
  kyivDay,
}: UseFlowScheduleParams) {
  // Memoize the Kyiv day-start epoch so it is a stable primitive: it only
  // changes when the calendar day rolls over. Deriving it inline from a `new
  // Date(...)` each render makes React Compiler treat the Date-derived value as
  // potentially-mutable and skip memoization of every flow that depends on it;
  // the wrapped primitive keeps the dependency arrays below simple expressions
  // and lets the debt/subscription flow memos below preserve cleanly.

  const todayStartMs = useMemo(
    () => new Date(kyivYear, kyivMonth, kyivDay).getTime(),
    [kyivYear, kyivMonth, kyivDay],
  );

  const subscriptionFlows = useMemo(
    () =>
      subscriptions.map((sub) => {
        const { amount, currency } = getSubscriptionAmountMeta(
          sub,
          transactions,
        );
        const dueDate = getNextBillingDate(Number(sub.billingDay) || 1, {
          year: kyivYear,
          month: kyivMonth,
          day: kyivDay,
        });
        const daysLeft = kyivCalendarDaysBetween(
          dueDate.getTime(),
          todayStartMs,
        );
        return {
          id: `sub-${sub.id}`,
          // AI-CONTEXT (2026-08-21): тут клеївся `sub.emoji`. Поле
          // ЖОДНОГО разу не редагується користувачем — форма підписки
          // не має для нього поля, тож у ньому завжди лежав засіяний
          // дефолт «📱». Тобто це був не вибір людини, а хардкод
          // емодзі, який малювався системним шрифтом. Рядок потоку
          // показує назву; гліф йому не потрібен.
          title: sub.name,
          amount,
          sign: "-",
          daysLeft,
          hint: formatDaysLeft(daysLeft),
          currency,
          dueDate,
        };
      }),
    [subscriptions, transactions, todayStartMs, kyivYear, kyivMonth, kyivDay],
  );

  const debtOutFlows = useMemo(
    () =>
      manualDebts
        .map((d) => ({ ...d, remaining: calcDebtRemaining(d, transactions) }))
        .filter((d) => d.dueDate && d.remaining > 0)
        .map((d) => {
          const daysLeft = kyivCalendarDaysBetween(
            parseLocalDate(d.dueDate).getTime(),
            todayStartMs,
          );
          return {
            id: `debt-${d.id}`,
            title: d.name || "Борг",
            amount: d.remaining,
            sign: "-",
            daysLeft,
            hint: formatDaysLeft(daysLeft),
            currency: "₴",
            dueDate: parseLocalDate(d.dueDate),
          };
        }),
    [manualDebts, transactions, todayStartMs],
  );

  const debtInFlows = useMemo(
    () =>
      receivables
        .map((r) => ({
          ...r,
          remaining: calcReceivableRemaining(r, transactions),
        }))
        .filter((r) => r.dueDate && r.remaining > 0)
        .map((r) => {
          const daysLeft = kyivCalendarDaysBetween(
            parseLocalDate(r.dueDate).getTime(),
            todayStartMs,
          );
          return {
            id: `recv-${r.id}`,
            title: r.name || "Дебіторка",
            amount: r.remaining,
            sign: "+",
            daysLeft,
            hint: formatDaysLeft(daysLeft),
            currency: "₴",
            dueDate: parseLocalDate(r.dueDate),
          };
        }),
    [receivables, transactions, todayStartMs],
  );

  const plannedFlows = useMemo(
    () =>
      [...subscriptionFlows, ...debtOutFlows, ...debtInFlows]
        .filter(
          (x) => x.daysLeft >= 0 && x.daysLeft <= PLANNED_FLOWS_HORIZON_DAYS,
        )
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [subscriptionFlows, debtOutFlows, debtInFlows],
  );

  return { subscriptionFlows, debtOutFlows, debtInFlows, plannedFlows };
}
