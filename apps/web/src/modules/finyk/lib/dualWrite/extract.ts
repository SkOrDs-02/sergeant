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

interface FinykIdLike {
  id?: unknown;
}

function blobsFromArray(
  arr: ReadonlyArray<FinykIdLike & Record<string, unknown>> | undefined,
): FinykBlobEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykBlobEntry[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : null;
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

function idsFromArray(arr: readonly string[] | undefined): FinykIdEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: FinykIdEntry[] = [];
  for (const v of arr) {
    if (typeof v === "string" && v.length > 0) out.push({ id: v });
  }
  return out;
}

function txCatsFromMap(
  map: Record<string, string | undefined> | undefined,
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

function txSplitsFromMap(
  map: Record<string, unknown> | undefined,
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

function monoDebtLinksFromMap(
  map: Record<string, string[]> | undefined,
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

function networthHistoryFrom(
  arr: ReadonlyArray<{ month?: unknown; networth?: unknown }> | undefined,
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

  return {
    hiddenAccounts: idsFromArray(slots.hiddenAccounts),
    hiddenTransactions: idsFromArray(slots.hiddenTxIds),
    budgets: blobsFromArray(
      slots.budgets as ReadonlyArray<FinykIdLike & Record<string, unknown>>,
    ),
    subscriptions: blobsFromArray(
      slots.subscriptions as ReadonlyArray<
        FinykIdLike & Record<string, unknown>
      >,
    ),
    assets: blobsFromArray(
      slots.manualAssets as ReadonlyArray<
        FinykIdLike & Record<string, unknown>
      >,
    ),
    debts: blobsFromArray(
      slots.manualDebts as ReadonlyArray<FinykIdLike & Record<string, unknown>>,
    ),
    receivables: blobsFromArray(
      slots.receivables as ReadonlyArray<FinykIdLike & Record<string, unknown>>,
    ),
    customCategories: blobsFromArray(
      slots.customCategories as ReadonlyArray<
        FinykIdLike & Record<string, unknown>
      >,
    ),
    manualExpenses: blobsFromArray(
      slots.manualExpenses as ReadonlyArray<
        FinykIdLike & Record<string, unknown>
      >,
    ),
    txCategories: txCatsFromMap(slots.txCategories),
    txSplits: txSplitsFromMap(slots.txSplits as Record<string, unknown>),
    monoDebtLinks: monoDebtLinksFromMap(slots.monoDebtLinkedTxIds),
    networthHistory: networthHistoryFrom(slots.networthHistory),
    prefs: {
      monthlyPlanJson,
      showBalance,
    },
  };
}
