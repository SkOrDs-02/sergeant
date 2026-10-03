/**
 * Bridge that routes Finyk chat-action localStorage writes into the
 * SQLite dual-write pipeline.
 *
 * Background: the Finyk module migrated to a SQLite-canonical dual-write
 * store. Manual UI mutations flow React-state → `useFinykDualWriteSync`
 * → `finyk_*` SQLite tables, and the module reads back from those tables.
 * The chat-action executors run synchronously outside React and historically
 * wrote LS-key blobs only, so AI-created rows never reached the canonical
 * store the UI reads.
 *
 * AI-DANGER: (data-08) канонічний стан — це `getCachedFinykSqliteState()`,
 * а НЕ kv-ключі `finyk_*`: UI їх не пише (`useReadonlyPersist`), тож kv там
 * порожній або застарілий. Екзекутори мусять будувати `next` від кешу, а
 * `prev` для diff-а тут теж береться з кешу — інакше видалення (закритий
 * борг, undo створення) не емітять delete, а часткова зміна стирає решту.
 *
 * {@link finykChatWrite} is a drop-in replacement for `lsSet` at those
 * call sites. It:
 *
 *   1. snapshots the previous CANONICAL value from the SQLite warm cache
 *      (kv лише як запасний варіант, коли кеш ще холодний);
 *   2. keeps the `lsSet` write as a first-paint / activation-probe mirror
 *      of the full next value;
 *   3. optimistically patches the warm cache (see
 *      `patchFinykSqliteStateCache`) so the next executor in the same turn
 *      builds on top of this write;
 *   4. mirrors the per-slice `prev → next` delta into SQLite and bumps
 *      the read-gate so any mounted Finyk UI re-renders (see
 *      `modules/finyk/lib/sqliteWriter/chatBridge`).
 *
 * Keys not covered by the dual-write contract fall through to a plain
 * `lsSet`, preserving the previous behaviour.
 */

import { ls, lsSet } from "../../hubChatUtils";
import {
  getCachedFinykSqliteState,
  patchFinykSqliteStateCache,
  type SqliteFinykCache,
} from "../../../../modules/finyk/lib/sqliteReader";
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

/** LS-ключ → поле канонічного кешу, з якого береться `prev` для diff-а. */
const CACHE_FIELDS: Record<string, keyof SqliteFinykCache> = {
  finyk_manual_expenses_v1: "manualExpenses",
  finyk_debts: "manualDebts",
  finyk_recv: "receivables",
  finyk_budgets: "budgets",
  finyk_assets: "manualAssets",
  finyk_subs: "subscriptions",
  finyk_custom_cats_v1: "customCategories",
  finyk_hidden_txs: "hiddenTransactions",
  finyk_hidden: "hiddenAccounts",
  finyk_tx_cats: "txCategories",
  finyk_tx_splits: "txSplits",
  finyk_mono_debt_linked: "monoDebtLinkedTxIds",
  finyk_networth_history: "networthHistory",
};

function safeStringifyPlan(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

/**
 * Write a Finyk LS key from a chat action AND mirror the change into the
 * SQLite dual-write store. Fire-and-forget for the SQLite side — the LS
 * write and the cache patch are synchronous so the returning tool-result
 * and the next executor of the same turn observe the value immediately.
 */
export function finykChatWrite(key: string, value: unknown): void {
  const cache = getCachedFinykSqliteState();
  const warm = cache.refreshedAt !== null;

  if (key === MONTHLY_PLAN_KEY) {
    // Знімок prev-плану ДО патча кешу: mirror читає решту prefs-полів із
    // кешу вже після `await`, а сам план порівнює саме з цим знімком.
    const prevPlanJson = safeStringifyPlan(warm ? cache.monthlyPlan : null);
    lsSet(key, value);
    if (warm) {
      patchFinykSqliteStateCache({
        monthlyPlan: (value ?? {}) as SqliteFinykCache["monthlyPlan"],
      });
    }
    void mirrorFinykChatMonthlyPlan(safeStringifyPlan(value), prevPlanJson);
    return;
  }

  const build = SLICE_BUILDERS[key];
  if (!build) {
    // Not a dual-write-covered key — keep the previous LS-only behaviour.
    lsSet(key, value);
    return;
  }

  // Snapshot BEFORE the write: канонічне pre-mutation значення — з кешу
  // (kv-ключі UI не пише). Холодний кеш → запасний kv-варіант.
  const field = CACHE_FIELDS[key];
  const prevRaw: unknown =
    warm && field ? cache[field] : ls<unknown>(key, null);
  lsSet(key, value);
  if (warm && field) {
    patchFinykSqliteStateCache({
      [field]: value,
    } as Partial<SqliteFinykCache>);
  }
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
