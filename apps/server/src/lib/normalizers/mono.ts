/**
 * Monobank DB-row normalizers.
 *
 * `node-postgres` returns Postgres `bigint` (int8) columns as **strings**.
 * These helpers coerce numeric columns to plain `number` in API responses,
 * keeping values within JavaScript's safe-integer range (Monobank balances
 * are denominated in kopecks, max ≈ 9 × 10¹⁵). See AGENTS.md rule #1.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

export function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string" || typeof v === "bigint") return Number(v);
  return null;
}

// ── Account row normalizer ───────────────────────────────────────────────────

export interface MonoAccountRow {
  userId: string;
  monoAccountId: string;
  sendId: string | null;
  type: string;
  currencyCode: number;
  cashbackType: string | null;
  maskedPan: string[] | null;
  iban: string | null;
  balance: unknown;
  creditLimit: unknown;
  lastSeenAt: Date | string | null;
}

export interface NormalizedMonoAccount {
  userId: string;
  monoAccountId: string;
  sendId: string | null;
  type: string;
  currencyCode: number;
  cashbackType: string | null;
  maskedPan: string[];
  iban: string | null;
  balance: number | null;
  creditLimit: number | null;
  lastSeenAt: string | null;
}

export function normalizeMonoAccount(
  row: MonoAccountRow,
): NormalizedMonoAccount {
  return {
    ...row,
    balance: toNumberOrNull(row.balance),
    creditLimit: toNumberOrNull(row.creditLimit),
    maskedPan: row.maskedPan ?? [],
    lastSeenAt:
      row.lastSeenAt instanceof Date
        ? row.lastSeenAt.toISOString()
        : row.lastSeenAt,
  };
}

// ── Transaction row normalizer ───────────────────────────────────────────────

export interface MonoTransactionRow {
  userId: string;
  monoAccountId: string;
  monoTxId: string;
  time: Date | string;
  amount: unknown;
  operationAmount: unknown;
  currencyCode: number;
  mcc: number | null;
  originalMcc: number | null;
  hold: boolean | null;
  description: string | null;
  comment: string | null;
  cashbackAmount: unknown;
  commissionRate: unknown;
  balance: unknown;
  receiptId: string | null;
  invoiceId: string | null;
  counterEdrpou: string | null;
  counterIban: string | null;
  counterName: string | null;
  categorySlug: string | null;
  categoryOverridden: boolean;
  source: string;
  receivedAt: Date | string;
}

export interface NormalizedMonoTransaction {
  userId: string;
  monoAccountId: string;
  monoTxId: string;
  time: string;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  mcc: number | null;
  originalMcc: number | null;
  hold: boolean | null;
  description: string | null;
  comment: string | null;
  cashbackAmount: number | null;
  commissionRate: number | null;
  balance: number | null;
  receiptId: string | null;
  invoiceId: string | null;
  counterEdrpou: string | null;
  counterIban: string | null;
  counterName: string | null;
  categorySlug: string | null;
  categoryOverridden: boolean;
  source: string;
  receivedAt: string;
}

export function normalizeMonoTransaction(
  row: MonoTransactionRow,
): NormalizedMonoTransaction {
  return {
    ...row,
    amount: toNumberOrNull(row.amount) ?? 0,
    operationAmount: toNumberOrNull(row.operationAmount) ?? 0,
    cashbackAmount: toNumberOrNull(row.cashbackAmount),
    commissionRate: toNumberOrNull(row.commissionRate),
    balance: toNumberOrNull(row.balance),
    time: row.time instanceof Date ? row.time.toISOString() : String(row.time),
    receivedAt:
      row.receivedAt instanceof Date
        ? row.receivedAt.toISOString()
        : String(row.receivedAt),
  };
}
