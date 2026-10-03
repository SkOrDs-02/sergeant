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
  /** `pantry_claimed_at` (migration 151) - omittable so existing callers
   *  that don't select the column keep compiling; treated as `null`. */
  pantryClaimedAt?: Date | string | null;
}

export interface NormalizedSilpoReceiptItem {
  id: number;
  name: string;
  qty: number | null;
  unit: string | null;
  priceKop: number;
  categorySlug: string | null;
  barcode: string | null;
  pantryClaimedAt: string | null;
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
    pantryClaimedAt: row.pantryClaimedAt
      ? toIsoString(row.pantryClaimedAt)
      : null,
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
  /** `pantry_auto_declined_at` (migration 151) - omittable, same reason as
   *  `SilpoReceiptItemRow.pantryClaimedAt` above. */
  pantryAutoDeclinedAt?: Date | string | null;
  /** `COUNT(...)` of claimed items - pg returns bigint as string, omittable
   *  for the same reason. `normalizeSilpoReceiptDetail` overrides this with
   *  the exact count from `itemRows` instead of requiring the detail query
   *  to carry a redundant aggregate. */
  pantryClaimedCount?: unknown;
}

export interface NormalizedSilpoReceiptSummary {
  receiptId: string;
  purchasedAt: string;
  storeId: string | null;
  channel: "online" | "offline";
  paymentHint: string | null;
  totalKop: number;
  transactionId: string | null;
  pantryClaimedCount: number;
  pantryAutoDeclined: boolean;
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
    pantryClaimedCount: toNumberOrNull(row.pantryClaimedCount) ?? 0,
    pantryAutoDeclined: row.pantryAutoDeclinedAt != null,
  };
}

export interface NormalizedSilpoReceiptDetail extends NormalizedSilpoReceiptSummary {
  items: NormalizedSilpoReceiptItem[];
}

export function normalizeSilpoReceiptDetail(
  row: SilpoReceiptRow,
  itemRows: SilpoReceiptItemRow[],
): NormalizedSilpoReceiptDetail {
  const items = itemRows.map(normalizeSilpoReceiptItem);
  return {
    ...normalizeSilpoReceiptSummary(row),
    // Точний рахунок з уже завантажених позицій - детальний запит не
    // потребує окремого агрегату поруч із самим списком.
    pantryClaimedCount: items.filter((i) => i.pantryClaimedAt != null).length,
    items,
  };
}
