/**
 * Silpo DB-row normalizers (Hard Rule #1 — `pg` returns `bigint`/`int8`
 * columns as strings; coerce to `number` before the response leaves the
 * server). `silpo_receipts.total_kop`, `silpo_receipt_items.price_kop` and
 * `silpo_receipt_items.id` (BIGSERIAL) are all bigint on disk (migration
 * 121).
 *
 * Reuses `toNumberOrNull` from `./mono.js` rather than duplicating it — the
 * helper is ring/domain-generic (see its docstring).
 */
import { toNumberOrNull } from "./mono.js";

// ── Receipt item ─────────────────────────────────────────────────────────

export interface SilpoReceiptItemRow {
  id: unknown; // BIGSERIAL → string from pg
  name: string;
  qty: unknown; // NUMERIC → string from pg when non-null
  unit: string | null;
  priceKop: unknown; // BIGINT → string from pg
  categorySlug: string | null;
  barcode: string | null;
}

export interface NormalizedSilpoReceiptItem {
  id: number;
  name: string;
  qty: number | null;
  unit: string | null;
  priceKop: number;
  categorySlug: string | null;
  barcode: string | null;
}

export function normalizeSilpoReceiptItem(
  row: SilpoReceiptItemRow,
): NormalizedSilpoReceiptItem {
  return {
    id: toNumberOrNull(row.id) ?? 0,
    name: row.name,
    qty: toNumberOrNull(row.qty),
    unit: row.unit,
    // NOT NULL BIGINT column — `?? 0` only guards a malformed/mocked row in
    // tests; a real DB row always has a numeric string here.
    priceKop: toNumberOrNull(row.priceKop) ?? 0,
    categorySlug: row.categorySlug,
    barcode: row.barcode,
  };
}

// ── Receipt (summary + detail) ───────────────────────────────────────────

export interface SilpoReceiptRow {
  receiptId: string;
  purchasedAt: Date | string;
  storeId: string | null;
  channel: "online" | "offline";
  paymentHint: string | null;
  totalKop: unknown; // BIGINT → string from pg
  transactionId: string | null;
}

export interface NormalizedSilpoReceiptSummary {
  receiptId: string;
  purchasedAt: string;
  storeId: string | null;
  channel: "online" | "offline";
  paymentHint: string | null;
  totalKop: number;
  transactionId: string | null;
}

function toIsoString(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : v;
}

export function normalizeSilpoReceiptSummary(
  row: SilpoReceiptRow,
): NormalizedSilpoReceiptSummary {
  return {
    receiptId: row.receiptId,
    purchasedAt: toIsoString(row.purchasedAt),
    storeId: row.storeId,
    channel: row.channel,
    paymentHint: row.paymentHint,
    totalKop: toNumberOrNull(row.totalKop) ?? 0,
    transactionId: row.transactionId,
  };
}

export interface NormalizedSilpoReceiptDetail extends NormalizedSilpoReceiptSummary {
  items: NormalizedSilpoReceiptItem[];
}

export function normalizeSilpoReceiptDetail(
  row: SilpoReceiptRow,
  itemRows: SilpoReceiptItemRow[],
): NormalizedSilpoReceiptDetail {
  return {
    ...normalizeSilpoReceiptSummary(row),
    items: itemRows.map(normalizeSilpoReceiptItem),
  };
}
