/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Розклад майбутніх потоків Фініка: підписки (наступне списання), борги
 * (дата погашення) і «мені винні» (дата повернення), та вибірка
 * запланованих списань із нього.
 *
 * AI-CONTEXT (2026-11-19, Ф-4 (б)): переїхало з
 * `apps/web/src/modules/finyk/lib/flowSchedule.ts`, щоб push «завтра
 * спишеться» на сервері і рядок «спишеться» на хабі та денна норма
 * «Можна сьогодні» брали той самий список з одного джерела. Тут немає
 * веб-імпортів, I/O і `Date.now()`: «зараз» приходить аргументом. Підписи
 * (`hint`, запасна назва) добудовує веб, домен повертає `name: null`.
 *
 * Межа доби тут КИЇВСЬКА: цикл списання підписки і «скільки днів лишилось»
 * це фінансовий календар (ADR-0078 § фінансові періоди). Особистий день
 * людини (коли саме «напередодні») вирішує викликач і передає готовий
 * `dueDayKey` у `selectFinykChargesDueOn`.
 */
import {
  deviceDayKey,
  kyivCalendarDaysBetween,
  toKyivISODate,
} from "@sergeant/shared";
import { getSubscriptionAmountMeta } from "./subscriptionUtils.js";
import {
  calcDebtRemaining,
  calcReceivableRemaining,
  type Debt,
  type Receivable,
} from "./debtEngine.js";

/** Скільки днів наперед показують «Найближчі платежі». */
export const PLANNED_FLOWS_HORIZON_DAYS = 10;

/** Київські частини дати: рік, 1-based місяць, день. */
function kyivParts(ms: number): { year: number; month: number; day: number } {
  const [y, m, d] = toKyivISODate(ms).split("-").map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/**
 * Наступна дата списання за днем місяця. Цикл рахується за київським
 * календарем, щоб подорож не зрушила день списання; результат несе
 * київський день у ЛОКАЛЬНИХ полях (`new Date(y, m, d)`). Окреме імʼя від
 * `getNextBillingDate` з `overview.ts` (та сама арифметика старого Огляду),
 * щоб барель `domain/index.ts` не мав двох однойменних експортів.
 */
export function getSubscriptionNextBillingDate(
  billingDay: number,
  now: Date,
): Date {
  const parts = kyivParts(now.getTime());
  const y = parts.year;
  const m = parts.month - 1;
  const today = parts.day;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const daysInNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  let d = new Date(y, m, Math.min(billingDay, daysInMonth));
  if (d < new Date(y, m, today)) {
    d = new Date(y, m + 1, Math.min(billingDay, daysInNextMonth));
  }
  return d;
}

/**
 * Наступна дата списання підписки для всіх поверхонь Фініка (картка
 * підписки, «Найближчі платежі», смуга статистики, push). Цикл вважається
 * сплаченим, коли останнє привʼязане списання ближче до поточної дати
 * списання, ніж до попередньої: сервіс може зняти гроші на день-два
 * раніше, і таке списання закриває цикл, а запізніле списання минулого
 * циклу ні. `lastChargeSec` у секундах, як `Transaction.time`.
 */
export function getSubscriptionDueDate(
  billingDay: number,
  now: Date,
  lastChargeSec?: number | null,
): Date {
  const due = getSubscriptionNextBillingDate(billingDay, now);
  if (lastChargeSec == null) return due;
  // Перша дата списання не раніше ніж за 31 день до `due` - це і є
  // попередня: між сусідніми датами завжди 28-31 день.
  const prevDue = getSubscriptionNextBillingDate(
    billingDay,
    new Date(due.getTime() - 31 * 86400000),
  );
  const midpoint = (prevDue.getTime() + due.getTime()) / 2;
  if (lastChargeSec * 1000 < midpoint) return due;
  // Наступний день календарно, полудень UTC: +24 год від опівночі пристрою
  // у день переходу з літнього часу чи на пристрої східніше Києва лишались
  // у тому самому київському дні, і цикл не перемикався. `due` несе
  // київський день у локальних полях (`new Date(y, m, d)` вище), тож
  // локальні геттери тут читають саме його.
  return getSubscriptionNextBillingDate(
    billingDay,
    new Date(
      Date.UTC(due.getFullYear(), due.getMonth(), due.getDate() + 1, 12),
    ),
  );
}

/** Підписка, як її зберігає Фінік (`finyk_subscriptions`). */
export interface FlowSubscriptionInput {
  id: string;
  name?: string | undefined;
  billingDay?: number | string | undefined;
  linkedTxId?: string | undefined;
  keyword?: string | undefined;
  currency?: string | undefined;
  /** Очікувана сума в копійках, поки немає зіставленої операції. */
  expectedAmount?: number | undefined;
}

/** Операція для сум підписок і залишків боргів (банк + ручні, копійки). */
export interface FlowTxInput {
  id: string;
  amount: number;
  time?: number | undefined;
  description?: string | undefined;
  currencyCode?: number | undefined;
}

export interface FinykFlowScheduleInput {
  subscriptions: readonly FlowSubscriptionInput[];
  manualDebts: readonly Debt[];
  receivables?: readonly Receivable[] | undefined;
  transactions: readonly FlowTxInput[];
  /** «Зараз», мс. Київський календар береться з нього. */
  nowMs: number;
}

/** Один майбутній потік. Гроші в ГРИВНЯХ (`amount`), як у сховищі боргів. */
export interface FinykFlow {
  /** `sub-<id>`, `debt-<id>` або `recv-<id>`. */
  id: string;
  /** Назва зі сховища; `null`, коли порожня (підпис добудовує поверхня). */
  name: string | null;
  /** Гривні; `null`, коли суму підписки ще невідомо. */
  amount: number | null;
  sign: "-" | "+";
  /** Символ валюти (`₴`, `$`). */
  currency: string;
  /** Київські календарні дні до дати (0 — сьогодні, відʼємне — минуло). */
  daysLeft: number;
  /** Дата в локальних полях (історичний контракт веба). */
  dueDate: Date;
  /** `YYYY-MM-DD` київського дня списання. */
  dueDayKey: string;
}

export interface FinykFlowSchedule {
  subscriptionFlows: FinykFlow[];
  debtOutFlows: FinykFlow[];
  debtInFlows: FinykFlow[];
}

const parseLocalDate = (isoDate: string | null | undefined): Date => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y ?? 0, (m || 1) - 1, d || 1);
};

/**
 * Розклад потоків. Протерміновані лишаються з відʼємним `daysLeft`:
 * фільтр вікна робить споживач (`selectPlannedOutflows`, горизонт веба).
 */
export function buildFinykFlowSchedule({
  subscriptions,
  manualDebts,
  receivables = [],
  transactions,
  nowMs,
}: FinykFlowScheduleInput): FinykFlowSchedule {
  const { year, month, day } = kyivParts(nowMs);
  const todayStartMs = new Date(year, month - 1, day).getTime();
  const txs = transactions as FlowTxInput[];
  // `dueDate` несе київський день у локальних полях, тож ключ читається з
  // них же (`deviceDayKey` — форматер локальних полів), а не через пояс.
  const dayKeyOf = (d: Date) => deviceDayKey(d);

  const subscriptionFlows = subscriptions.map((sub): FinykFlow => {
    const { amount, currency, lastTx } = getSubscriptionAmountMeta(sub, txs);
    // Полудень UTC київської дати: у Києві це той самий день за будь-якого
    // часового поясу пристрою.
    const dueDate = getSubscriptionDueDate(
      Number(sub.billingDay) || 1,
      new Date(Date.UTC(year, month - 1, day, 12)),
      lastTx?.time,
    );
    return {
      id: `sub-${sub.id}`,
      name: sub.name || null,
      amount,
      sign: "-",
      currency,
      daysLeft: kyivCalendarDaysBetween(dueDate.getTime(), todayStartMs),
      dueDate,
      dueDayKey: dayKeyOf(dueDate),
    };
  });

  const debtOutFlows = manualDebts
    .map((d) => ({ d, remaining: calcDebtRemaining(d, txs) }))
    .filter(({ d, remaining }) => d.dueDate && remaining > 0)
    .map(({ d, remaining }): FinykFlow => {
      const dueDate = parseLocalDate(d.dueDate);
      return {
        id: `debt-${d.id}`,
        name: d.name || null,
        amount: remaining,
        sign: "-",
        currency: "₴",
        daysLeft: kyivCalendarDaysBetween(dueDate.getTime(), todayStartMs),
        dueDate,
        dueDayKey: dayKeyOf(dueDate),
      };
    });

  const debtInFlows = receivables
    .map((r) => ({ r, remaining: calcReceivableRemaining(r, txs) }))
    .filter(({ r, remaining }) => r.dueDate && remaining > 0)
    .map(({ r, remaining }): FinykFlow => {
      const dueDate = parseLocalDate(r.dueDate);
      return {
        id: `recv-${r.id}`,
        name: r.name || null,
        amount: remaining,
        sign: "+",
        currency: "₴",
        daysLeft: kyivCalendarDaysBetween(dueDate.getTime(), todayStartMs),
        dueDate,
        dueDayKey: dayKeyOf(dueDate),
      };
    });

  return { subscriptionFlows, debtOutFlows, debtInFlows };
}

interface PlannedFlowLike {
  sign: string;
  daysLeft: number;
}

/**
 * Заплановані списання розкладу: підписки й погашення боргів, строк яких
 * ще не минув (`daysLeft >= 0`). «Мені винні» сюди не входять: це
 * надходження.
 *
 * AI-CONTEXT: одне джерело правди для трьох поверхонь (OD-26 Ф-4, П-4 (Б),
 * рішення founder-а 2026-11-18). Денна норма «Можна сьогодні» віднімає рівно
 * ці потоки в межах місяця, рядок «спишеться» на хабі показує їх за сьогодні
 * й завтра, push «завтра спишеться» (Ф-4 (б)) бере їх за завтрашній день.
 * Не копіюй фільтр поруч: інакше поверхні розійдуться.
 */
export function selectPlannedOutflows<
  S extends PlannedFlowLike,
  D extends PlannedFlowLike,
>(schedule: {
  subscriptionFlows: readonly S[];
  debtOutFlows: readonly D[];
}): ((S & { kind: "subscription" }) | (D & { kind: "debt" }))[] {
  return [
    ...schedule.subscriptionFlows.map((f) => ({
      ...f,
      kind: "subscription" as const,
    })),
    ...schedule.debtOutFlows.map((f) => ({ ...f, kind: "debt" as const })),
  ].filter((f) => f.sign === "-" && f.daysLeft >= 0);
}

/** Заплановане списання на конкретний день (вхід push «завтра спишеться»). */
export interface FinykDueCharge {
  /** `sub-<id>` або `debt-<id>`: частина ключа дедупу. */
  flowId: string;
  kind: "subscription" | "debt";
  /** `null`, коли назва порожня. */
  name: string | null;
  /** Копійки; `null`, коли суму підписки ще невідомо. */
  amountMinor: number | null;
  currency: string;
  dueDayKey: string;
}

export interface SelectFinykChargesDueOnInput extends FinykFlowScheduleInput {
  /** `YYYY-MM-DD`: день, про списання в який питаємо. */
  dueDayKey: string;
}

/**
 * Що спишеться в день `dueDayKey`. Порядок: більша сума першою, невідома
 * сума в кінці. Порожній список, коли нічого не заплановано.
 */
export function selectFinykChargesDueOn({
  dueDayKey,
  ...input
}: SelectFinykChargesDueOnInput): FinykDueCharge[] {
  return selectPlannedOutflows(buildFinykFlowSchedule(input))
    .filter((f) => f.dueDayKey === dueDayKey)
    .map((f): FinykDueCharge => ({
      flowId: f.id,
      kind: f.kind,
      name: f.name,
      amountMinor:
        typeof f.amount === "number" ? Math.round(f.amount * 100) : null,
      currency: f.currency,
      dueDayKey: f.dueDayKey,
    }))
    .sort((a, b) => (b.amountMinor ?? -1) - (a.amountMinor ?? -1));
}

/** Наступний календарний день для ключа `YYYY-MM-DD` (без поясу). */
export function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
  return next.toISOString().slice(0, 10);
}

/** Ключ дедупу `push_reminder_log` для push «завтра спишеться». */
export function finykDueDedupKey(flowId: string, dueDayKey: string): string {
  return `finyk_due_${flowId}_${dueDayKey}`;
}
