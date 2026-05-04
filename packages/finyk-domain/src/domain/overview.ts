/**
 * Pure helpers for the Finyk Overview page.
 *
 * Extracted from `apps/web/src/modules/finyk/pages/Overview.tsx` and
 * `pages/overview/pulseStyle.ts` so both the web PWA and the React Native
 * port can reuse the same DOM-free business logic (`parseLocalDate`,
 * `formatDaysLeft`, `getNextBillingDate`, planned-flow aggregation, pulse
 * classification).
 *
 * Everything here is pure / deterministic — no `Date.now()` defaults, no
 * `localStorage`, no React. The caller passes `now` so tests can lock the
 * clock and so the same selector can power server-rendered digests later.
 */

import type { Transaction } from "./types.js";
import {
  calcDebtRemaining,
  calcReceivableRemaining,
  type Debt as EngineDebt,
  type Receivable as EngineReceivable,
} from "./debtEngine.js";
import { getSubscriptionAmountMeta } from "./subscriptionUtils.js";

/**
 * Расширює базовий `Debt` / `Receivable` опціональними UI-полями, що
 * зберігаються у localStorage / MMKV payload-і (emoji, name, dueDate).
 * Парсинг `dueDate` як локальної дати — відповідальність {@link parseLocalDate}.
 */
export type DebtLike = EngineDebt & {
  name?: string;
  emoji?: string;
  dueDate?: string | null;
};

export type ReceivableLike = EngineReceivable & {
  name?: string;
  emoji?: string;
  dueDate?: string | null;
};

/**
 * Canonical Sergeant status hexes used by planned-flow rows. Inlined here
 * (rather than importing `@shared/lib/themeHex`) to keep the package
 * workspace-agnostic and DOM-free.
 */
export const OVERVIEW_FLOW_COLOR = {
  danger: "#ef4444",
  success: "#10b981",
} as const;

/**
 * Parse an ISO date string ("YYYY-MM-DD") as a **local-time** midnight.
 * `new Date(isoDate)` would interpret it as UTC, which shifts the day by
 * a timezone offset — important for Kyiv users whose due-dates must land
 * on the same calendar day they entered.
 */
export function parseLocalDate(isoDate: string | null | undefined): Date {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  // `y` буде `undefined` для пустого рядка — `Date(NaN, ...)` повертає
  // Invalid Date, а ось `new Date(undefined as any, ...)` падає у TS під
  // strict noUncheckedIndexedAccess. Дефолтимо у епоху, поведінка
  // викликачів (`isNaN(date.getTime())`) лишається консистентною.
  return new Date(y ?? 1970, (m || 1) - 1, d || 1);
}

/**
 * Humanise a days-left count as a Ukrainian hint ("сьогодні" / "завтра" /
 * "через N дн"). Negative inputs are not special-cased here — callers
 * already filter to `daysLeft >= 0` before rendering.
 */
export function formatDaysLeft(days: number): string {
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  return `через ${days} дн`;
}

/**
 * Compute the next occurrence of a monthly billing day (1..31) relative
 * to `now`. Clamps to the last day of each month so that billingDay=31 in
 * February still resolves to Feb 28/29.
 */
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

export type FlowSign = "+" | "-";

/**
 * Planned financial flow (subscription / debt / receivable) ready for
 * rendering in `PlannedFlowsCard` and `MonthPulseCard`.
 */
export interface PlannedFlow {
  id: string;
  title: string;
  amount: number | null;
  sign: FlowSign;
  color: string;
  daysLeft: number;
  hint: string;
  currency: string;
  dueDate: Date;
}

interface Subscription {
  id: string;
  name: string;
  emoji?: string;
  billingDay: number;
  linkedTxId?: string;
  keyword?: string;
  currency?: string;
}

/**
 * Build outgoing subscription flows. Each subscription resolves its next
 * billing date and the last-transaction-inferred amount (see
 * `getSubscriptionAmountMeta`).
 */
export function buildSubscriptionFlows(
  subscriptions: Subscription[],
  transactions: Transaction[],
  now: Date,
): PlannedFlow[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return subscriptions.map((sub) => {
    const { amount, currency } = getSubscriptionAmountMeta(
      sub,
      // subscriptionUtils has a looser Transaction type — accept both.
      transactions as never,
    );
    const dueDate = getNextBillingDate(sub.billingDay, now);
    const daysLeft = Math.ceil(
      (dueDate.getTime() - todayStart.getTime()) / 86400000,
    );
    return {
      id: `sub-${sub.id}`,
      title: `${sub.emoji ?? ""} ${sub.name}`.trim(),
      amount,
      sign: "-",
      color: OVERVIEW_FLOW_COLOR.danger,
      daysLeft,
      hint: formatDaysLeft(daysLeft),
      currency,
      dueDate,
    };
  });
}

/**
 * Build outgoing debt flows — only debts with a `dueDate` and a non-zero
 * remaining balance contribute to the Overview planning list.
 */
export function buildDebtOutFlows(
  debts: DebtLike[],
  transactions: Transaction[],
  now: Date,
): PlannedFlow[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return debts
    .map((d) => ({ ...d, remaining: calcDebtRemaining(d, transactions) }))
    .filter((d) => d.dueDate && d.remaining > 0)
    .map((d) => {
      const dueDate = parseLocalDate(d.dueDate);
      const daysLeft = Math.ceil(
        (dueDate.getTime() - todayStart.getTime()) / 86400000,
      );
      return {
        id: `debt-${d.id}`,
        title: `${d.emoji || "💸"} ${d.name}`,
        amount: d.remaining,
        sign: "-" as FlowSign,
        color: OVERVIEW_FLOW_COLOR.danger,
        daysLeft,
        hint: formatDaysLeft(daysLeft),
        currency: "₴",
        dueDate,
      };
    });
}

/**
 * Build incoming receivable flows — inverse of {@link buildDebtOutFlows}.
 */
export function buildReceivableInFlows(
  receivables: ReceivableLike[],
  transactions: Transaction[],
  now: Date,
): PlannedFlow[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return receivables
    .map((r) => ({
      ...r,
      remaining: calcReceivableRemaining(r, transactions),
    }))
    .filter((r) => r.dueDate && r.remaining > 0)
    .map((r) => {
      const dueDate = parseLocalDate(r.dueDate);
      const daysLeft = Math.ceil(
        (dueDate.getTime() - todayStart.getTime()) / 86400000,
      );
      return {
        id: `recv-${r.id}`,
        title: `${r.emoji || "💰"} ${r.name}`,
        amount: r.remaining,
        sign: "+" as FlowSign,
        color: OVERVIEW_FLOW_COLOR.success,
        daysLeft,
        hint: formatDaysLeft(daysLeft),
        currency: "₴",
        dueDate,
      };
    });
}

/**
 * Merge subscription + debt + receivable flows into the 10-day planned
 * window shown on Overview (sorted by `daysLeft` ascending).
 */
export function buildPlannedFlows(
  flows: readonly PlannedFlow[][],
  { windowDays = 10 }: { windowDays?: number } = {},
): PlannedFlow[] {
  return flows
    .flat()
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= windowDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Aggregate totals for flows that land in the current calendar month —
 * used by `MonthPulseCard` to net planned in/out against fact spend.
 */
export function aggregateMonthFlows(
  flows: readonly PlannedFlow[],
  now: Date,
): {
  recurringOutThisMonth: number;
  recurringInThisMonth: number;
  unknownOutCount: number;
  monthFlows: PlannedFlow[];
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthEnd = new Date(y, m + 1, 0);
  const monthFlows = flows.filter(
    (f) => f.daysLeft >= 0 && f.dueDate && f.dueDate <= monthEnd,
  );

  let recurringOutThisMonth = 0;
  let recurringInThisMonth = 0;
  let unknownOutCount = 0;
  for (const f of monthFlows) {
    if (f.sign === "-") {
      if (typeof f.amount === "number") recurringOutThisMonth += f.amount;
      else unknownOutCount += 1;
    } else if (f.sign === "+" && typeof f.amount === "number") {
      recurringInThisMonth += f.amount;
    }
  }
  return {
    recurringOutThisMonth,
    recurringInThisMonth,
    unknownOutCount,
    monthFlows,
  };
}

/**
 * Visual classification for the `MonthPulseCard` — returns CSS class
 * fragments (Tailwind / NativeWind-compatible) plus a status label. The
 * caller composes them into the final `className`; this function stays
 * design-token agnostic.
 */
export type PulseInput = {
  hasExpensePlan: boolean;
  spendPlanRatio: number;
  dayBudget: number;
};

export type PulseStyle = {
  accentLeft: string;
  bg: string;
  color: string;
  statusText: string;
};

export function computePulseStyle({
  hasExpensePlan,
  spendPlanRatio,
  dayBudget,
}: PulseInput): PulseStyle {
  if (hasExpensePlan) {
    if (spendPlanRatio > 0.75) {
      return {
        accentLeft: "border-l-red-500",
        bg: "bg-pulse-b",
        color: "text-danger",
        statusText: "Понад 75% запланованого",
      };
    }
    if (spendPlanRatio > 0.5) {
      return {
        accentLeft: "border-l-amber-500",
        bg: "bg-pulse-w",
        color: "text-warning",
        statusText: "Понад 50% запланованого",
      };
    }
    return {
      accentLeft: "border-l-emerald-500",
      bg: "bg-pulse-ok",
      color: "text-success",
      statusText: "В межах плану",
    };
  }

  const pulseGood = dayBudget >= 200;
  const pulseWarn = dayBudget >= 0 && dayBudget < 200;
  const pulseBad = dayBudget < 0;
  return {
    accentLeft: pulseGood
      ? "border-l-emerald-500"
      : pulseWarn
        ? "border-l-amber-500"
        : "border-l-red-500",
    bg: pulseGood ? "bg-pulse-ok" : pulseWarn ? "bg-pulse-w" : "bg-pulse-b",
    color: pulseGood
      ? "text-success"
      : pulseWarn
        ? "text-warning"
        : "text-danger",
    statusText: pulseBad
      ? "Перевитрата"
      : pulseWarn
        ? "Обережно — майже вичерпано"
        : "В нормі",
  };
}

/**
 * Derive the "firstName" shown in the Overview hero greeting from a
 * Monobank `clientInfo.name` payload. Monobank returns "Surname Name"
 * ordering (Ukrainian convention), so we prefer the second token.
 */
export function deriveFirstName(
  clientName: string | null | undefined,
  fallback = "друже",
): string {
  if (!clientName) return fallback;
  const parts = clientName.split(" ").filter(Boolean);
  return parts[1] ?? parts[0] ?? fallback;
}
