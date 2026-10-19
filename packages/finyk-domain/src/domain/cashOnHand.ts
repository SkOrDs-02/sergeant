/**
 * «Готівка на руках» (ADR-0076): один UAH-рахунок на користувача.
 *
 * Стан рахунку малий і живе одним обʼєктом у `finyk_prefs.prefs_json`
 * поруч із правилами мерчантів: початкова сума, мить створення, поправки
 * звірки і список знять, які людина попросила рахувати витратою. Баланс не
 * зберігається, а рахується тут із операцій, тож розійтись із ними не може.
 *
 * Правило forward-only (Р2.6 спеки `finyk-analytics-v3.md`): у баланс і у
 * «переказ на готівку» потрапляє лише те, що датоване від `createdAt`.
 * Початкова сума і є баланс на ту мить, тож старіші рухи в ній уже
 * враховані, а історичні агрегати не перераховуються.
 *
 * DOM-free: функції приймають уже прочитані структури, як `lib/metrics.ts`.
 */

import { INTERNAL_TRANSFER_ID } from "../constants";
import { txTimeMs } from "../lib/transactions.js";
import {
  resolveManualExpenseKind,
  type ManualExpenseEntry,
} from "./transactions.js";

/** Зняття готівки: 6011 (банкомат) і 6010 (каса банку). */
export const CASH_WITHDRAWAL_MCCS: ReadonlySet<number> = new Set([6010, 6011]);

/**
 * Описи зняття з реальних виписок. Ними ж сервер підказує чип
 * «Внутрішній переказ» в імпорті (`import/categoryHint.ts`), тож рядок
 * імпорту, позначений переказом, упізнається як зняття тим самим списком.
 */
export const CASH_WITHDRAWAL_FRAGMENTS: readonly string[] = [
  "зняття готівки",
  "видача готівки",
  "отримання готівки",
  "зняття коштів",
  "банкомат",
  "atm",
  "cash withdrawal",
];

export interface CashAdjustment {
  id: string;
  /** Різниця «фактична мінус розрахована», копійки зі знаком. */
  amount: number;
  /** Мить поправки, мс. */
  at: number;
}

export interface CashOnHandState {
  /** Сума, яку людина ввела при створенні рахунку, копійки. */
  initialAmount: number;
  /** Мить створення рахунку, мс. Межа forward-only. */
  createdAt: number;
  adjustments: CashAdjustment[];
  /** Банківські зняття, які людина попросила рахувати витратою. */
  countAsExpenseTxIds: string[];
  /**
   * Останній вибір рахунку у формі ручного запису (Р3.2): `true` означає
   * «Готівка на руках». Живе тут, бо порядок записів у сховищі не каже,
   * який із них створено останнім, а без рахунку дефолт і так «Без рахунку».
   */
  preferForManual: boolean;
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Сирий JSON → стан або `null`, якщо рахунку немає чи форма зіпсована. */
export function sanitizeCashOnHand(raw: unknown): CashOnHandState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteInt(r["initialAmount"]) || !isFiniteInt(r["createdAt"])) {
    return null;
  }
  const adjustments = Array.isArray(r["adjustments"])
    ? (r["adjustments"] as unknown[]).flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const x = a as Record<string, unknown>;
        return typeof x["id"] === "string" &&
          isFiniteInt(x["amount"]) &&
          isFiniteInt(x["at"])
          ? [{ id: x["id"], amount: x["amount"], at: x["at"] }]
          : [];
      })
    : [];
  const countAsExpenseTxIds = Array.isArray(r["countAsExpenseTxIds"])
    ? (r["countAsExpenseTxIds"] as unknown[]).filter(
        (id): id is string => typeof id === "string" && id !== "",
      )
    : [];
  return {
    initialAmount: r["initialAmount"],
    createdAt: r["createdAt"],
    adjustments,
    countAsExpenseTxIds,
    preferForManual: r["preferForManual"] === true,
  };
}

export function createCashOnHand(
  amountMinor: number,
  nowMs: number,
): CashOnHandState {
  return {
    initialAmount: Math.round(amountMinor),
    createdAt: Math.round(nowMs),
    adjustments: [],
    countAsExpenseTxIds: [],
    preferForManual: false,
  };
}

export interface CashBankTxLike {
  id: string;
  amount: number;
  time?: number | undefined;
  mcc?: number | undefined;
  manual?: boolean | undefined;
}

/** Банківська операція, яка за правилом ADR-0076 є зняттям готівки. */
function isBankCashWithdrawal(
  tx: CashBankTxLike,
  cash: CashOnHandState,
): boolean {
  if (tx.manual || tx.amount >= 0) return false;
  if (!CASH_WITHDRAWAL_MCCS.has(Number(tx.mcc))) return false;
  const ms = txTimeMs(tx.time);
  return Number.isFinite(ms) && ms >= cash.createdAt;
}

/**
 * Банківські зняття, що стали переказом на готівку: не витрата, а
 * поповнення рахунку. Перебиті «Рахувати як витрату» сюди не входять.
 */
export function findCashTransferTxIds(
  transactions:
    readonly (CashBankTxLike | null | undefined)[] | null | undefined,
  cash: CashOnHandState | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!cash) return out;
  const overridden = new Set(cash.countAsExpenseTxIds);
  for (const tx of transactions ?? []) {
    if (!tx?.id || overridden.has(tx.id)) continue;
    if (isBankCashWithdrawal(tx, cash)) out.add(tx.id);
  }
  return out;
}

/** Чи підпадає операція під правило зняття (для підказки в деталях). */
export function isCashWithdrawalCandidate(
  tx: CashBankTxLike,
  cash: CashOnHandState | null | undefined,
): boolean {
  return !!cash && isBankCashWithdrawal(tx, cash);
}

function looksLikeCashWithdrawal(description: string | undefined): boolean {
  const normalized = (description ?? "").toLocaleLowerCase("uk-UA");
  return CASH_WITHDRAWAL_FRAGMENTS.some((f) => normalized.includes(f));
}

function entryTimeMs(entry: ManualExpenseEntry): number {
  return entry.date ? new Date(entry.date).getTime() : Number.NaN;
}

function entryMinor(entry: ManualExpenseEntry): number {
  return Math.abs(Math.round(Number(entry.amount || 0) * 100));
}

export interface CashBalanceInput {
  cash: CashOnHandState | null | undefined;
  bankTxs?: readonly (CashBankTxLike | null | undefined)[] | null;
  manualExpenses?: readonly (ManualExpenseEntry | null | undefined)[] | null;
}

/**
 * Баланс = початкова сума + перекази на готівку - готівкові витрати +
 * готівкові доходи + поправки (Р2.4). Копійки; `null`, коли рахунку немає.
 *
 * Переказ на готівку буває двох видів: банківське зняття за MCC і ручний
 * або імпортований запис із категорією «Внутрішній переказ» і описом
 * зняття (Р2.7). Другий рахунку не має, бо гроші в ньому йдуть з банку.
 */
export function computeCashBalanceMinor(
  input: CashBalanceInput,
): number | null {
  const { cash } = input;
  if (!cash) return null;
  let balance = cash.initialAmount;

  const bank = input.bankTxs ?? [];
  const transferIds = findCashTransferTxIds(bank, cash);
  for (const tx of bank) {
    if (tx && transferIds.has(tx.id)) balance += Math.abs(tx.amount);
  }

  for (const entry of input.manualExpenses ?? []) {
    if (!entry) continue;
    const ms = entryTimeMs(entry);
    if (!Number.isFinite(ms) || ms < cash.createdAt) continue;
    const isIncome = resolveManualExpenseKind(entry) === "income";
    if (entry.account === "cash") {
      balance += isIncome ? entryMinor(entry) : -entryMinor(entry);
    } else if (
      !isIncome &&
      entry.category === INTERNAL_TRANSFER_ID &&
      looksLikeCashWithdrawal(entry.description)
    ) {
      balance += entryMinor(entry);
    }
  }

  for (const a of cash.adjustments) balance += a.amount;
  return balance;
}

/**
 * «Вказати фактичну суму»: поправка на різницю. Поправка не витрата й не
 * дохід, у жодну статистику вона не потрапляє (Р2.3). Без різниці стан
 * повертається як є.
 */
export function withCashAdjustment(
  cash: CashOnHandState,
  currentBalanceMinor: number,
  actualMinor: number,
  nowMs: number,
  id: string,
): CashOnHandState {
  const diff = Math.round(actualMinor) - currentBalanceMinor;
  if (diff === 0) return cash;
  return {
    ...cash,
    adjustments: [...cash.adjustments, { id, amount: diff, at: nowMs }],
  };
}

/** Перемикач «Рахувати як витрату» для одного банківського зняття. */
export function toggleCashCountAsExpense(
  cash: CashOnHandState,
  txId: string,
): CashOnHandState {
  const has = cash.countAsExpenseTxIds.includes(txId);
  return {
    ...cash,
    countAsExpenseTxIds: has
      ? cash.countAsExpenseTxIds.filter((id) => id !== txId)
      : [...cash.countAsExpenseTxIds, txId],
  };
}
