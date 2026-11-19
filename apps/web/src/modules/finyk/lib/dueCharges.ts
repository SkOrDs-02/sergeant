/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Дані рядка «спишеться» на хабі (OD-26 Ф-4 (а), спека
 * `docs/work/specs/finyk-history-three-months-and-upcoming-charges.md`).
 *
 * Платіж у рядку — будь-яке заплановане списання: підписка або погашення
 * боргу, рівно ті потоки, що віднімає «Можна сьогодні» (П-4 (Б), рішення
 * founder-а 2026-11-18). Тому селектор не має власного фільтра: він бере
 * `selectPlannedOutflows` з того самого розкладу `getFlowSchedule`, що й
 * денна норма, і лише звужує вікно до «сьогодні й завтра».
 */
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import {
  getFlowSchedule,
  selectPlannedOutflows,
  type UseFlowScheduleParams,
} from "./flowSchedule";

/** Вікно рядка: сьогодні (0) і завтра (1). Дефолт § 11.8 розбору, Ф-4. */
export const DUE_CHARGES_WINDOW_DAYS = 2;

export interface DueCharge {
  /** Стабільний id потоку: `sub-<id>` або `debt-<id>`. */
  id: string;
  kind: "subscription" | "debt";
  /** Назва підписки чи боргу, як у «Найближчих платежах». */
  title: string;
  /** Копійки; `null`, коли суму підписки ще невідомо. */
  amountMinor: number | null;
  /** Символ валюти (`₴`, `$`): підписка може бути не в гривнях. */
  currency: string;
  /** 0 — сьогодні, 1 — завтра (київський календар). */
  daysLeft: number;
  dueDate: Date;
}

export interface SelectDueChargesInput {
  subscriptions: UseFlowScheduleParams["subscriptions"];
  manualDebts: UseFlowScheduleParams["manualDebts"];
  /** Не потрібні самому рядку, але розклад їх приймає; за замовчуванням порожньо. */
  receivables?: UseFlowScheduleParams["receivables"] | undefined;
  /** Банк + ручні записи: з них відомі суми підписок і залишки боргів. */
  transactions: readonly Transaction[];
  nowMs: number;
  windowDays?: number | undefined;
}

/**
 * Що спишеться сьогодні й завтра. Порядок: сьогодні перед завтра, у межах
 * дня більша сума першою, невідома сума в кінці. Порожній список, коли
 * нічого не заплановано.
 */
export function selectDueCharges({
  subscriptions,
  manualDebts,
  receivables = [],
  transactions,
  nowMs,
  windowDays = DUE_CHARGES_WINDOW_DAYS,
}: SelectDueChargesInput): DueCharge[] {
  const parts = getKyivDateParts(nowMs);
  const flows = getFlowSchedule({
    subscriptions,
    manualDebts,
    receivables,
    transactions: [...transactions],
    kyivYear: parts.year,
    kyivMonth: parts.month - 1,
    kyivDay: parts.day,
  });
  return selectPlannedOutflows(flows)
    .filter((f) => f.daysLeft < windowDays)
    .map((f): DueCharge => ({
      id: f.id,
      kind: f.kind,
      title: f.title,
      amountMinor:
        typeof f.amount === "number" ? Math.round(f.amount * 100) : null,
      currency: f.currency,
      daysLeft: f.daysLeft,
      dueDate: f.dueDate,
    }))
    .sort(
      (a, b) =>
        a.daysLeft - b.daysLeft ||
        (b.amountMinor ?? -1) - (a.amountMinor ?? -1),
    );
}
