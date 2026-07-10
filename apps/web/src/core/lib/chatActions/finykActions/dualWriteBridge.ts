/**
 * Bridge that routes Finyk chat-action localStorage writes into the
 * SQLite dual-write pipeline.
 *
 * Background: the Finyk module migrated to a SQLite-canonical dual-write
 * store. Manual UI mutations flow React-state → `useFinykDualWriteSync`
 * → `finyk_*` SQLite tables, and the module reads back from those tables
 * (LS is only a first-paint fallback). The chat-action executors run
 * synchronously outside React and historically wrote LS-key blobs only,
 * so AI-created rows never reached the canonical store the UI reads.
 *
 * {@link finykChatWrite} is a drop-in replacement for `lsSet` at those
 * call sites. It:
 *
 *   1. snapshots the previous LS value (the chat action has not written
 *      yet — `ls` re-parses storage, so this is the pre-mutation state);
 *   2. keeps the `lsSet` write — the AI's own read-only query tools
 *      (`queryFinykActions` / `finykActions/search`) and the first-paint
 *      fallback still read LS, so it must stay in sync;
 *   3. mirrors the per-slice `prev → next` delta into SQLite and bumps
 *      the read-gate so any mounted Finyk UI re-renders (see
 *      `modules/finyk/lib/sqliteWriter/chatBridge`).
 *
 * Keys not covered by the dual-write contract fall through to a plain
 * `lsSet`, preserving the previous behaviour.
 */

import { ls, lsSet } from "../../hubChatUtils";
import {
  blobsFromArray,
  idsFromArray,
  monoDebtLinksFromMap,
  networthHistoryFrom,
  stateWithSlice,
  txCatsFromMap,
  txSplitsFromMap,
} from "../../../../modules/finyk/lib/sqliteWriter/extract";
import type { FinykDualWriteState } from "../../../../modules/finyk/lib/sqliteWriter/diff";
import {
  mirrorFinykChatDualWrite,
  mirrorFinykChatMonthlyPlan,
} from "../../../../modules/finyk/lib/sqliteWriter/chatBridge";

/** Singleton prefs key — merged against canonical fields, not slice-diffed. */
const MONTHLY_PLAN_KEY = "finyk_monthly_plan";

/**
 * Map each dual-write-covered LS key to a builder that turns a raw LS
 * value into a single-slice `FinykDualWriteState`. Each builder is
 * concretely typed so the `stateWithSlice` key/value pairing stays sound.
 */
const SLICE_BUILDERS: Record<string, (raw: unknown) => FinykDualWriteState> = {
  finyk_manual_expenses_v1: (raw) =>
    stateWithSlice("manualExpenses", blobsFromArray(raw as readonly unknown[])),
  finyk_debts: (raw) =>
    stateWithSlice("debts", blobsFromArray(raw as readonly unknown[])),
  finyk_recv: (raw) =>
    stateWithSlice("receivables", blobsFromArray(raw as readonly unknown[])),
  finyk_budgets: (raw) =>
    stateWithSlice("budgets", blobsFromArray(raw as readonly unknown[])),
  finyk_assets: (raw) =>
    stateWithSlice("assets", blobsFromArray(raw as readonly unknown[])),
  finyk_subs: (raw) =>
    stateWithSlice("subscriptions", blobsFromArray(raw as readonly unknown[])),
  finyk_custom_cats_v1: (raw) =>
    stateWithSlice(
      "customCategories",
      blobsFromArray(raw as readonly unknown[]),
    ),
  finyk_hidden_txs: (raw) =>
    stateWithSlice(
      "hiddenTransactions",
      idsFromArray(raw as readonly unknown[]),
    ),
  finyk_hidden: (raw) =>
    stateWithSlice("hiddenAccounts", idsFromArray(raw as readonly unknown[])),
  finyk_tx_cats: (raw) =>
    stateWithSlice(
      "txCategories",
      txCatsFromMap(raw as Record<string, unknown>),
    ),
  finyk_tx_splits: (raw) =>
    stateWithSlice("txSplits", txSplitsFromMap(raw as Record<string, unknown>)),
  finyk_mono_debt_linked: (raw) =>
    stateWithSlice(
      "monoDebtLinks",
      monoDebtLinksFromMap(raw as Record<string, unknown>),
    ),
  finyk_networth_history: (raw) =>
    stateWithSlice(
      "networthHistory",
      networthHistoryFrom(raw as readonly unknown[]),
    ),
};

/**
 * Write a Finyk LS key from a chat action AND mirror the change into the
 * SQLite dual-write store. Fire-and-forget for the SQLite side — the LS
 * write is synchronous so the returning tool-result and the AI's query
 * tools observe the value immediately.
 */
export function finykChatWrite(key: string, value: unknown): void {
  if (key === MONTHLY_PLAN_KEY) {
    lsSet(key, value);
    let monthlyPlanJson: string;
    try {
      monthlyPlanJson = JSON.stringify(value ?? {});
    } catch {
      monthlyPlanJson = "{}";
    }
    void mirrorFinykChatMonthlyPlan(monthlyPlanJson);
    return;
  }

  const build = SLICE_BUILDERS[key];
  if (!build) {
    // Not a dual-write-covered key — keep the previous LS-only behaviour.
    lsSet(key, value);
    return;
  }

  // Snapshot BEFORE the write: the chat action hasn't committed yet, and
  // `ls` re-parses storage, so this is the genuine pre-mutation value.
  const prevRaw = ls<unknown>(key, null);
  lsSet(key, value);
  void mirrorFinykChatDualWrite(build(prevRaw), build(value));
}

/**
 * Mirror a manual-expenses change into the SQLite dual-write store using an
 * EXPLICIT `prev → next` pair.
 *
 * The server-routed `create_transaction` path (`serverActions.ts`) writes the
 * LS mirror through the canonical `finykStorage` wrapper (`saveTransactions` +
 * `flushPendingWrites`) BEFORE it can mirror, so {@link finykChatWrite}'s
 * re-read-prev-from-LS trick would see `prev === next` and no-op. This variant
 * takes the snapshots the caller already holds (the manual-expenses array
 * before and after the unshift), so the diff still captures the delta.
 */
export function finykChatMirrorManualExpenses(
  prev: readonly unknown[],
  next: readonly unknown[],
): void {
  void mirrorFinykChatDualWrite(
    stateWithSlice("manualExpenses", blobsFromArray(prev)),
    stateWithSlice("manualExpenses", blobsFromArray(next)),
  );
}
