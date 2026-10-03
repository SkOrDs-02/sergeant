/**
 * Детермінований matcher «чек Сільпо ↔ mono-транзакція» (спека
 * silpo-mcp-integration, § Рішення дизайну).
 *
 * Правила:
 *  - збіг `receipt_id` (mono ↔ чек) — сильний сигнал, матчиться одразу;
 *  - інакше: точна сума в копійках + відстань днів ≤ 1 у **Europe/Kyiv**
 *    (звітна межа доби — доменний інваріант для серверних звітів) +
 *    кандидат схожий на супермаркетну витрату (MCC 5411 або «сільпо» в описі);
 *  - **ніколи не force-match**: якщо в чека кілька кандидатів або за одну
 *    транзакцію конкурують кілька чеків — амбігуїті, лишаємо ручний вибір;
 *  - поповнення «Власного Рахунку» — mono-транзакція, що не є покупкою:
 *    виключається з кандидатів за описом (формат звіряється на спайку §0).
 *
 * Чиста функція без I/O: приймає знімки чеків і транзакцій, повертає
 * пропозиції лінків. Персист і UI-підтвердження — на сервері/клієнті.
 */

import { toKyivISODate } from "@sergeant/shared";

const SILPO_DESCRIPTION_RE = /(?:сільпо|silpo)/iu;

/**
 * Поповнення «Власного Рахунку» лояльності — переказ, а не покупка.
 * Формат опису mono-транзакції провізійний до спайку §0.
 */
const OWN_ACCOUNT_TOPUP_RE = /власн\p{L}*\s+рахун/iu;

const GROCERY_MCC = 5411;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReceiptForMatching {
  receiptId: string;
  /** Сума чека в копійках (додатна). */
  totalKop: number;
  /** Момент покупки, epoch мілісекунди. */
  purchasedAtMs: number;
}

export interface MonoTxForReceiptMatching {
  id: string;
  /** Сума в копійках; витрата — відʼємна (mono minor units). */
  amountKop: number;
  /** Момент транзакції, epoch секунди (mono `time`). */
  timeSeconds: number;
  mcc?: number | null;
  description?: string | null;
  /** `mono_transaction.receipt_id`, якщо банк його віддав. */
  receiptId?: string | null;
}

export type ReceiptMatchConfidence = "receipt_id" | "amount_date";

export interface ReceiptMatchSuggestion {
  receiptId: string;
  transactionId: string;
  confidence: ReceiptMatchConfidence;
}

export interface ReceiptMatchResult {
  matches: ReceiptMatchSuggestion[];
  /** Чеки без жодного кандидата — першокласний стан «Чеки без транзакції». */
  unmatchedReceiptIds: string[];
  /** Чеки з ≥2 кандидатами (або конкуренцією за транзакцію) — ручний вибір. */
  ambiguousReceiptIds: string[];
}

/** `YYYY-MM-DD` у Europe/Kyiv. */
function kyivDayKey(epochMs: number): string {
  return toKyivISODate(epochMs);
}

/** Відстань у добах між київськими календарними днями двох моментів. */
function kyivDayDistance(aMs: number, bMs: number): number {
  const a = Date.UTC(
    Number(kyivDayKey(aMs).slice(0, 4)),
    Number(kyivDayKey(aMs).slice(5, 7)) - 1,
    Number(kyivDayKey(aMs).slice(8, 10)),
  );
  const b = Date.UTC(
    Number(kyivDayKey(bMs).slice(0, 4)),
    Number(kyivDayKey(bMs).slice(5, 7)) - 1,
    Number(kyivDayKey(bMs).slice(8, 10)),
  );
  return Math.abs(a - b) / DAY_MS;
}

function isOwnAccountTopup(tx: MonoTxForReceiptMatching): boolean {
  return OWN_ACCOUNT_TOPUP_RE.test(tx.description ?? "");
}

/** Схожа на супермаркетну витрату: відʼємна сума + MCC 5411 або «сільпо» в описі. */
function isGroceryExpenseCandidate(tx: MonoTxForReceiptMatching): boolean {
  if (!(tx.amountKop < 0)) return false;
  if (isOwnAccountTopup(tx)) return false;
  return (
    tx.mcc === GROCERY_MCC || SILPO_DESCRIPTION_RE.test(tx.description ?? "")
  );
}

/**
 * Пропонує лінки чек↔транзакція. Жодного force-match: амбігуїті повертається
 * окремим списком і НЕ потрапляє у `matches`.
 */
export function matchReceiptsToTransactions(
  receipts: readonly ReceiptForMatching[],
  transactions: readonly MonoTxForReceiptMatching[],
): ReceiptMatchResult {
  const matches: ReceiptMatchSuggestion[] = [];
  const unmatchedReceiptIds: string[] = [];
  const ambiguousReceiptIds: string[] = [];

  const usedTxIds = new Set<string>();

  // Прохід 1: сильний сигнал — точний збіг receipt_id.
  const byBankReceiptId = new Map<string, MonoTxForReceiptMatching[]>();
  for (const tx of transactions) {
    if (isOwnAccountTopup(tx)) continue;
    const bankReceiptId = tx.receiptId?.trim();
    if (!bankReceiptId) continue;
    const bucket = byBankReceiptId.get(bankReceiptId) ?? [];
    bucket.push(tx);
    byBankReceiptId.set(bankReceiptId, bucket);
  }

  const pendingAmountDate: ReceiptForMatching[] = [];
  for (const receipt of receipts) {
    const strong = byBankReceiptId.get(receipt.receiptId.trim()) ?? [];
    const strongTx = strong[0];
    if (strongTx && strong.length === 1 && !usedTxIds.has(strongTx.id)) {
      usedTxIds.add(strongTx.id);
      matches.push({
        receiptId: receipt.receiptId,
        transactionId: strongTx.id,
        confidence: "receipt_id",
      });
    } else if (strong.length > 1) {
      ambiguousReceiptIds.push(receipt.receiptId);
    } else {
      pendingAmountDate.push(receipt);
    }
  }

  // Прохід 2: точна сума + ±1 доба Kyiv, one-to-one без амбігуїті.
  const candidatesByReceipt = new Map<string, MonoTxForReceiptMatching[]>();
  const receiptIdsByTx = new Map<string, string[]>();
  for (const receipt of pendingAmountDate) {
    const candidates = transactions.filter(
      (tx) =>
        !usedTxIds.has(tx.id) &&
        isGroceryExpenseCandidate(tx) &&
        Math.abs(tx.amountKop) === receipt.totalKop &&
        kyivDayDistance(tx.timeSeconds * 1000, receipt.purchasedAtMs) <= 1,
    );
    candidatesByReceipt.set(receipt.receiptId, candidates);
    for (const tx of candidates) {
      const list = receiptIdsByTx.get(tx.id) ?? [];
      list.push(receipt.receiptId);
      receiptIdsByTx.set(tx.id, list);
    }
  }

  for (const receipt of pendingAmountDate) {
    const candidates = candidatesByReceipt.get(receipt.receiptId) ?? [];
    const only = candidates[0];
    if (!only || candidates.length === 0) {
      unmatchedReceiptIds.push(receipt.receiptId);
      continue;
    }
    const competitors = receiptIdsByTx.get(only.id) ?? [];
    if (candidates.length > 1 || competitors.length > 1) {
      ambiguousReceiptIds.push(receipt.receiptId);
      continue;
    }
    usedTxIds.add(only.id);
    matches.push({
      receiptId: receipt.receiptId,
      transactionId: only.id,
      confidence: "amount_date",
    });
  }

  return { matches, unmatchedReceiptIds, ambiguousReceiptIds };
}
