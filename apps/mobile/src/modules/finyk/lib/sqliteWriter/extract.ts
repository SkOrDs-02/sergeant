/**
 * Tiny helpers that take a single LS-key value (e.g. `manualAssets[]`)
 * and produce the partial FinykDualWriteState slice the diff layer
 * expects. Used by the mobile MMKV stores after each write so the
 * dual-write trigger can be called with a `prev`/`next` pair that
 * differs only in the key being mutated.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`.
 */

import {
  EMPTY_FINYK_STATE,
  type FinykBlobEntry,
  type FinykDualWriteState,
  type FinykIdEntry,
  type FinykMonoDebtLinkEntry,
  type FinykNetworthEntry,
  type FinykTxCategoryEntry,
  type FinykTxSplitsEntry,
} from "./diff";

/** Convert a per-row array (rows with `id`) into FinykBlobEntry[]. */
export function blobsFromArray(
  arr: readonly unknown[] | null | undefined,
): FinykBlobEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykBlobEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as { id?: unknown };
    const id = typeof r.id === "string" ? r.id : null;
    if (!id) continue;
    let dataJson: string;
    try {
      dataJson = JSON.stringify(row);
    } catch {
      continue;
    }
    out.push({ id, dataJson });
  }
  return out;
}

/** Convert a string-array LS key into FinykIdEntry[]. */
export function idsFromArray(
  arr: readonly string[] | null | undefined,
): FinykIdEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykIdEntry[] = [];
  for (const v of arr) {
    if (typeof v === "string" && v.length > 0) out.push({ id: v });
  }
  return out;
}

/** Convert a tx-id → categoryId map into FinykTxCategoryEntry[]. */
export function txCatsFromMap(
  map: Record<string, string | undefined> | null | undefined,
): FinykTxCategoryEntry[] {
  if (!map || typeof map !== "object") return [];
  const out: FinykTxCategoryEntry[] = [];
  for (const [transactionId, categoryId] of Object.entries(map)) {
    if (typeof categoryId !== "string" || categoryId.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    out.push({ transactionId, categoryId });
  }
  return out;
}

/** Convert a tx-id → splits[] map into FinykTxSplitsEntry[]. */
export function txSplitsFromMap(
  map: Record<string, unknown> | null | undefined,
): FinykTxSplitsEntry[] {
  if (!map || typeof map !== "object") return [];
  const out: FinykTxSplitsEntry[] = [];
  for (const [transactionId, splits] of Object.entries(map)) {
    if (!Array.isArray(splits) || splits.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    let splitsJson: string;
    try {
      splitsJson = JSON.stringify(splits);
    } catch {
      continue;
    }
    out.push({ transactionId, splitsJson });
  }
  return out;
}

/** Convert a tx-id → debtIds[] map into FinykMonoDebtLinkEntry[]. */
export function monoDebtLinksFromMap(
  map: Record<string, string[]> | null | undefined,
): FinykMonoDebtLinkEntry[] {
  if (!map || typeof map !== "object") return [];
  const out: FinykMonoDebtLinkEntry[] = [];
  for (const [transactionId, debtIds] of Object.entries(map)) {
    if (!Array.isArray(debtIds) || debtIds.length === 0) continue;
    if (typeof transactionId !== "string" || transactionId.length === 0)
      continue;
    let debtIdsJson: string;
    try {
      debtIdsJson = JSON.stringify(debtIds);
    } catch {
      continue;
    }
    out.push({ transactionId, debtIdsJson });
  }
  return out;
}

/** Convert a NetworthEntry[] LS array into FinykNetworthEntry[]. */
export function networthHistoryFrom(
  arr:
    | ReadonlyArray<{ month?: unknown; networth?: unknown }>
    | null
    | undefined,
): FinykNetworthEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykNetworthEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const month =
      typeof row.month === "string" && /^\d{4}-\d{2}$/.test(row.month)
        ? row.month
        : null;
    const networth =
      typeof row.networth === "number" && Number.isFinite(row.networth)
        ? row.networth
        : null;
    if (!month || networth === null) continue;
    out.push({ month, networth });
  }
  return out;
}

/**
 * Build a FinykDualWriteState that contains ONLY the given slice. Used
 * by mobile MMKV stores so each write fires a per-key trigger
 * (`prev → next`) without paying the cost of reading every other LS
 * key after every mutation.
 */
export function stateWithSlice<K extends keyof FinykDualWriteState>(
  key: K,
  value: FinykDualWriteState[K],
): FinykDualWriteState {
  return { ...EMPTY_FINYK_STATE, [key]: value };
}
