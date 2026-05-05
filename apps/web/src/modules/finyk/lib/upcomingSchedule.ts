/**
 * Shared helpers for Finyk's "upcoming schedule" surfaces (stats strip on
 * Активи / Планування). Centralises the maths that used to live inline in
 * `Assets.tsx` so Budgets (and any future module page) can reuse the same
 * `subsMonthly` / `nextCharge` / `urgentLiability` figures without drifting
 * from the canonical computation.
 */

import { calcDebtRemaining, calcReceivableRemaining } from "../utils";
import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import type {
  Debt as EngineDebt,
  Receivable as EngineReceivable,
  Tx as EngineTx,
} from "@sergeant/finyk-domain/domain/debtEngine";

export type UpcomingCharge = {
  label: string;
  amount: number;
  sign: "-" | "+";
  dueDate: Date;
};

export type UrgentLiability = {
  name: string;
  remaining: number;
  dueDate: Date;
};

/**
 * `transactions` is intentionally left as `unknown[]` (mutable) — both
 * `calcDebtRemaining` and `calcReceivableRemaining` take a non-readonly
 * `Tx[]` for backward-compat with legacy call sites. The runtime shape
 * is the same; the mutability opt-out lives in the engine.
 */
export type FinykScheduleInput = {
  subscriptions: readonly unknown[];
  manualDebts: readonly unknown[];
  receivables: readonly unknown[];
  transactions: unknown[];
  todayStart: Date;
};

export type FinykSchedule = {
  subsMonthly: number;
  subsCount: number;
  nextCharge: UpcomingCharge | null;
  urgentLiability: UrgentLiability | null;
};

export function parseLocalDate(isoDate: string | undefined | null): Date {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y!, (m || 1) - 1, d || 1);
}

export function getNextBillingDate(billingDay: number, now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  let d = new Date(y, m, Math.min(billingDay, new Date(y, m + 1, 0).getDate()));
  if (d < new Date(y, m, now.getDate())) {
    d = new Date(
      y,
      m + 1,
      Math.min(billingDay, new Date(y, m + 2, 0).getDate()),
    );
  }
  return d;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

export function formatRelativeDue(dueDate: Date, todayStart: Date): string {
  const days = Math.ceil((dueDate.getTime() - todayStart.getTime()) / 86400000);
  if (days <= 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days <= 7) return `через ${days} дн`;
  return formatShortDate(dueDate);
}

/**
 * Computes the upcoming-schedule figures from raw Finyk storage slices.
 *
 * `subsMonthly` sums only UAH subscription amounts — mixed-currency totals
 * would be misleading. `nextCharge` is the earliest of next subscription
 * billing, a manual debt with remaining + dueDate, or a receivable with
 * remaining + dueDate, dropping anything already in the past relative to
 * `todayStart`. `urgentLiability` is the **largest** manual debt that
 * still has a dueDate and owes something — not the soonest — because the
 * tile is meant to draw attention to the biggest time-sensitive hit, not
 * every little bill.
 */
export function computeFinykSchedule({
  subscriptions,
  manualDebts,
  receivables,
  transactions,
  todayStart,
}: FinykScheduleInput): FinykSchedule {
  type Sub = {
    id?: string;
    name?: string;
    billingDay: number | string;
  };
  // Narrow views over the store shapes: the engine helpers need the
  // EngineDebt / EngineReceivable fields (`id`, `amount`, optional
  // `linkedTxIds`), plus `name` / `dueDate` for the UI strip.
  type Debt = EngineDebt & { name: string; dueDate?: string };
  type Recv = EngineReceivable & { name: string; dueDate?: string };

  const subs = subscriptions as readonly Sub[];
  const debts = manualDebts as readonly Debt[];
  const recvs = receivables as readonly Recv[];
  const txs = transactions as EngineTx[];

  let subsMonthly = 0;
  const upcoming: UpcomingCharge[] = [];

  type GetSubAmountMeta = typeof getSubscriptionAmountMeta;
  for (const sub of subs) {
    const { amount, currency, lastTx } = getSubscriptionAmountMeta(
      sub as Parameters<GetSubAmountMeta>[0],
      transactions as Parameters<GetSubAmountMeta>[1],
    );
    if (!amount || currency !== "₴") continue;
    subsMonthly += amount;
    // AI-NOTE: коли остання списана транзакція припадає на `dueDate`
    // (тобто billingDay сьогодні і користувач уже привʼязав сьогоднішнє
    // списання), цикл уже сплачено — переносимо `dueDate` на наступний
    // billingDay, щоб тайл "Наступний платіж" не показував сплачений.
    let dueDate = getNextBillingDate(Number(sub.billingDay), todayStart);
    if (lastTx?.time && lastTx.time >= dueDate.getTime()) {
      dueDate = getNextBillingDate(
        Number(sub.billingDay),
        new Date(dueDate.getTime() + 86400000),
      );
    }
    upcoming.push({
      label: sub.name ?? "Підписка",
      amount,
      sign: "-",
      dueDate,
    });
  }

  for (const d of debts) {
    if (!d.dueDate) continue;
    const remaining = calcDebtRemaining(d, txs);
    if (remaining <= 0) continue;
    upcoming.push({
      label: d.name,
      amount: remaining,
      sign: "-",
      dueDate: parseLocalDate(d.dueDate),
    });
  }

  for (const r of recvs) {
    if (!r.dueDate) continue;
    const remaining = calcReceivableRemaining(r, txs);
    if (remaining <= 0) continue;
    upcoming.push({
      label: r.name,
      amount: remaining,
      sign: "+",
      dueDate: parseLocalDate(r.dueDate),
    });
  }

  upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const nextCharge =
    upcoming.find((it) => it.dueDate.getTime() >= todayStart.getTime()) ?? null;

  let urgentLiability: UrgentLiability | null = null;
  for (const d of debts) {
    if (!d.dueDate) continue;
    const remaining = calcDebtRemaining(d, txs);
    if (remaining <= 0) continue;
    const candidate: UrgentLiability = {
      name: d.name,
      remaining,
      dueDate: parseLocalDate(d.dueDate),
    };
    if (!urgentLiability || candidate.remaining > urgentLiability.remaining) {
      urgentLiability = candidate;
    }
  }

  return {
    subsMonthly,
    subsCount: subs.length,
    nextCharge,
    urgentLiability,
  };
}

/**
 * Lazy initialiser for a mount-time `todayStart` (midnight today). Pinning
 * the value via `useState(() => startOfToday())` keeps `useMemo` deps
 * referentially stable — date only matters for day-level comparisons, so
 * a frozen snapshot is safer than a fresh `new Date()` each render.
 */
export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
