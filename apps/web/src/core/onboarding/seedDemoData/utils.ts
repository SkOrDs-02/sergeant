import { safeWriteLS, safeRemoveLS } from "@shared/lib/storage";

export function writeJSON(key: string, value: unknown): void {
  safeWriteLS(key, value);
}

export function writeRaw(key: string, value: string): void {
  safeWriteLS(key, value);
}

export function removeKey(key: string): void {
  safeRemoveLS(key);
}

export function toISO(d: Date): string {
  return d.toISOString();
}

export function dateKey(d: Date): string {
  // YYYY-MM-DD in local time — matches nutrition/routine persistence.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export function shortId(prefix: string, seed: number): string {
  return `${prefix}_${seed.toString(36)}`;
}

export interface ManualExpense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

// Monobank transaction shape mirrors the canonical `Transaction` type
// from `@sergeant/finyk-domain`: amount is signed minor units (kopecks),
// `time` is unix seconds, `date` is ISO. Keeping both the canonical and
// the legacy compatibility fields populated so every Finyk selector
// recognises the row regardless of which field it reads.
export interface MonoTx {
  id: string;
  amount: number;
  date: string;
  time: number;
  description: string;
  merchant: string;
  mcc: number;
  categoryId: string;
  type: "expense" | "income";
  source: "mono";
  accountId: string | null;
  manual: boolean;
  note?: string;
  _source: string;
  _accountId: string | null;
  _manual: boolean;
}

// Build a Monobank-shaped transaction from a compact spec entry. Amount
// is in UAH (floating point) and gets converted to signed kopecks so
// `getTxStatAmount` / `getMonthlySummary` compute spent/income correctly.
export function buildMonoTx(
  seed: number,
  at: Date,
  uah: number,
  description: string,
  mcc: number,
  kind: "expense" | "income",
): MonoTx {
  const amountKopecks =
    kind === "expense" ? -Math.round(uah * 100) : Math.round(uah * 100);
  return {
    id: shortId("demo_mtx", seed),
    amount: amountKopecks,
    date: toISO(at),
    time: Math.floor(at.getTime() / 1000),
    description,
    merchant: description,
    mcc,
    categoryId: "",
    type: kind,
    source: "mono",
    accountId: "demo_acc_main",
    manual: false,
    _source: "monobank",
    _accountId: "demo_acc_main",
    _manual: false,
  };
}
