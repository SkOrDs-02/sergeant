/**
 * Pure extractor: maps a `FinykStorageSlots` bundle (output of
 * `useFinykStorageSlots`) into the `FinykDualWriteState` shape the
 * diff layer consumes.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`.
 *
 * The extractor is intentionally stupid — it does NOT mutate, deeply
 * clone, or normalise data. The slot bundle already holds the LS
 * shape verbatim (it's what `usePersist` reads/writes), so the only
 * thing this layer does is:
 *
 *   - flatten record-shaped LS keys (`finyk_tx_cats`,
 *     `finyk_tx_splits`, `finyk_mono_debt_linked`) into entry arrays
 *     keyed by `transactionId`,
 *   - synthesise a stable `id` for the `id-table` rows from the raw
 *     string-array LS keys (`finyk_hidden`, `finyk_hidden_txs`),
 *   - JSON-encode the per-row blobs once (the diff layer compares
 *     `dataJson` strings to detect changes — comparing serialised
 *     blobs avoids paying for deep equality and matches how the
 *     server-side apply-fns store the row).
 *
 * The per-slice helpers (`blobsFromArray`, `idsFromArray`, …) and
 * {@link stateWithSlice} are exported so non-hook callers — the
 * chat-action dual-write bridge in `core/lib/chatActions/finykActions`
 * — can build a single-slice `FinykDualWriteState` from raw LS values
 * without the React slot bundle. Mirrors the mobile extractor
 * (`apps/mobile/src/modules/finyk/lib/sqliteWriter/extract.ts`).
 */

import type { FinykStorageSlots } from "../../hooks/useFinykStorageSlots";
import {
  EMPTY_FINYK_STATE,
  type FinykBlobEntry,
  type FinykDualWriteState,
  type FinykIdEntry,
  type FinykMonoDebtLinkEntry,
  type FinykNetworthEntry,
  type FinykTxCategoryEntry,
  type FinykTxSplitsEntry,
} from "./diff.js";

/** Convert a per-row array (rows with `id`) into FinykBlobEntry[]. */
export function blobsFromArray(
  arr: readonly unknown[] | null | undefined,
): FinykBlobEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykBlobEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const id =
      typeof (row as { id?: unknown }).id === "string"
        ? (row as { id: string }).id
        : null;
    if (!id) continue;
    let dataJson: string;
    try {
      dataJson = JSON.stringify(row);
    } catch {
      // Circular / non-serialisable rows are skipped — the LS layer
      // can't have written them anyway, so this is just defensive.
      continue;
    }
    out.push({ id, dataJson });
  }
  return out;
}

/** Convert a string-array LS key into FinykIdEntry[]. */
export function idsFromArray(
  arr: readonly unknown[] | null | undefined,
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
  map: Record<string, unknown> | null | undefined,
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
  map: Record<string, unknown> | null | undefined,
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
  arr: readonly unknown[] | null | undefined,
): FinykNetworthEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykNetworthEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as { month?: unknown; networth?: unknown };
    const month =
      typeof r.month === "string" && /^\d{4}-\d{2}$/.test(r.month)
        ? r.month
        : null;
    const networth =
      typeof r.networth === "number" && Number.isFinite(r.networth)
        ? r.networth
        : null;
    if (!month || networth === null) continue;
    out.push({ month, networth });
  }
  return out;
}

export function extractFinykDualWriteState(
  slots: FinykStorageSlots,
  showBalance: boolean,
): FinykDualWriteState {
  if (!slots) return EMPTY_FINYK_STATE;

  let monthlyPlanJson: string;
  try {
    monthlyPlanJson = JSON.stringify(slots.monthlyPlan ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }

  // Stage 13 / PR #075 — обидва масиви тепер їдуть через `finyk_prefs`
  // dual-write замість LS-only. Захищаємось від не-string елементів,
  // щоб серверний `applyFinykPrefs` отримав чистий `string[]`.
  const excludedStatTxIdsJson = serializeStringArray(slots.excludedStatTxIds);
  const dismissedRecurringJson = serializeStringArray(slots.dismissedRecurring);

  return {
    hiddenAccounts: idsFromArray(slots.hiddenAccounts),
    hiddenTransactions: idsFromArray(slots.hiddenTxIds),
    budgets: blobsFromArray(slots.budgets),
    subscriptions: blobsFromArray(slots.subscriptions),
    assets: blobsFromArray(slots.manualAssets),
    debts: blobsFromArray(slots.manualDebts),
    receivables: blobsFromArray(slots.receivables),
    customCategories: blobsFromArray(slots.customCategories),
    manualExpenses: blobsFromArray(slots.manualExpenses),
    txCategories: txCatsFromMap(slots.txCategories),
    txSplits: txSplitsFromMap(slots.txSplits),
    monoDebtLinks: monoDebtLinksFromMap(slots.monoDebtLinkedTxIds),
    networthHistory: networthHistoryFrom(slots.networthHistory),
    prefs: {
      monthlyPlanJson,
      showBalance,
      excludedStatTxIdsJson,
      dismissedRecurringJson,
    },
  };
}

/**
 * Build a FinykDualWriteState that contains ONLY the given slice. Used
 * by non-hook callers (the chat-action dual-write bridge) so each write
 * diffs a single-slice `prev → next` pair without reading every other LS
 * key. Mirrors the mobile MMKV-store usage.
 */
export function stateWithSlice<K extends keyof FinykDualWriteState>(
  key: K,
  value: FinykDualWriteState[K],
): FinykDualWriteState {
  return { ...EMPTY_FINYK_STATE, [key]: value };
}

function serializeStringArray(value: readonly unknown[] | undefined): string {
  if (!Array.isArray(value)) return "[]";
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) out.push(item);
  }
  try {
    return JSON.stringify(out);
  } catch {
    return "[]";
  }
}
