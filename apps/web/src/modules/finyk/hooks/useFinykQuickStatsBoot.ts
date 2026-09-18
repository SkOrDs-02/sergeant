import { useEffect } from "react";
import { buildFinykExcludedTxIds } from "@sergeant/finyk-domain";
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

    // Zero-delta заміна ручної збірки на канонічну `buildFinykExcludedTxIds`
    // (W1-CANON-AGG стадія 2а): попередній інлайн уже мав усі чотири
    // частини, тож жодне число quick-stats не зрушило.
    const manualTxs = storage.manualExpenses.map((expense) =>
      manualExpenseToTransaction(expense),
    );
    const excludedTxIds = buildFinykExcludedTxIds({
      hiddenTxIds: storage.hiddenTransactions,
      txCategories: storage.txCategories,
      receivables: storage.receivables,
      excludedStatTxIds: storage.excludedStatTxIds,
      transactions: manualTxs,
    });

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
