import { useEffect } from "react";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";
import { getVisibleFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykSqliteReadTick } from "../lib/sqliteReadGate";
import { getCachedFinykSqliteState } from "../lib/sqliteReader";
import { writeFinykQuickStatsSnapshot } from "./useFinykQuickStatsWriter";

/**
 * Restores the derived Hub snapshot after authenticated SQLite boot/pull.
 *
 * The snapshot itself is intentionally not cloud-synced. It is rebuilt from
 * the canonical SQLite state + Mono mirror, so a fresh login does not show an
 * empty Finyk card until the module screen happens to be opened.
 */
export function useFinykQuickStatsBoot(): void {
  const sqliteTick = useFinykSqliteReadTick();
  const monoMirrorTick = useFinykMonoMirrorTick();

  useEffect(() => {
    const storage = getCachedFinykSqliteState();
    const mono = getVisibleFinykMonoMirrorState();

    // Never replace a previously useful snapshot with a partial cold-boot
    // zero while either canonical cache is still loading.
    if (!storage.refreshedAt || !mono.refreshedAt) return;

    const transferTxIds = Object.entries(storage.txCategories)
      .filter(([, categoryId]) => categoryId === INTERNAL_TRANSFER_ID)
      .map(([transactionId]) => transactionId);
    const excludedTxIds = new Set<string>([
      ...storage.hiddenTransactions,
      ...transferTxIds,
      ...storage.receivables.flatMap((item) => item.linkedTxIds || []),
      ...(storage.excludedStatTxIds ?? []),
    ]);
    const manualTxs = storage.manualExpenses.map((expense) =>
      manualExpenseToTransaction(expense),
    );

    writeFinykQuickStatsSnapshot({
      transactions:
        manualTxs.length > 0
          ? [...mono.transactions, ...manualTxs]
          : mono.transactions,
      excludedTxIds,
      txSplits: storage.txSplits,
      planExpense: Number(storage.monthlyPlan?.expense || 0),
    });
  }, [monoMirrorTick, sqliteTick]);
}
